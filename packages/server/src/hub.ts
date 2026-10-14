/**
 * The event hub: one Server-Sent Events stream per browser carries any number of
 * decks. Each deck numbers its events and keeps a ring of the recent ones, so a
 * reconnect with `Last-Event-ID` gets exactly what it missed, or one `resync`.
 */
import { randomBytes } from "node:crypto";
import type { ServerResponse } from "node:http";
import { coalesce, encodeCursor, replayFrom, type StreamMessage } from "@folio/core";

export const HEARTBEAT_MS = 15_000;
export const BACKLOG = 64;
export const RING = 512;

interface Subscriber {
  res: ServerResponse;
  decks: Set<string> | "all";
  /** Decks an "all" stream has open in a tab: their file watchers run as for a deck subscriber. */
  watch: Set<string>;
  cursor: Record<string, number>;
  pending: StreamMessage[];
  scheduled: boolean;
}

/** The decks a stream keeps watched: its own decks, or the open ones of an "all" stream. */
const interests = (sub: Subscriber): Set<string> => (sub.decks === "all" ? sub.watch : sub.decks);

/** Whether a stream keeps a deck's file watcher running. */
const interested = (sub: Subscriber, token: string): boolean => interests(sub).has(token);

export class Hub {
  private readonly seq = new Map<string, number>();
  private readonly rings = new Map<string, StreamMessage[]>();
  private readonly subscribers = new Set<Subscriber>();
  private readonly timer: NodeJS.Timeout;
  /** This server run; a cursor from another run cannot be replayed. */
  readonly epoch = randomBytes(4).toString("hex");
  /** Called when a deck gains its first or loses its last subscriber. */
  onInterest: (token: string, watching: boolean) => void = () => {};
  /** Called after any stream closes. */
  onDetach: () => void = () => {};

  constructor() {
    this.timer = setInterval(() => this.heartbeat(), HEARTBEAT_MS);
    this.timer.unref();
  }

  /**
   * Publish an event (never dropped) or a reading (last wins) for a deck.
   *
   * @param deck - the deck token.
   * @param type - e.g. `slide`, `comment`, `warnings`, `hook`, `presence`.
   * @param data - the payload, kept small: a patch, not a whole slide.
   * @param kind - `event` (default) or `reading`.
   * @param key - for readings, what a later reading replaces (e.g. a slot).
   */
  publish(deck: string, type: string, data: unknown, kind: "event" | "reading" = "event", key?: string): void {
    const seq = kind === "event" ? (this.seq.get(deck) ?? 0) + 1 : (this.seq.get(deck) ?? 0);
    const message: StreamMessage = { deck, seq, type, kind, data, ...(key ? { key } : {}) };
    if (kind === "event") {
      this.seq.set(deck, seq);
      const ring = this.rings.get(deck) ?? [];
      ring.push(message);
      if (ring.length > RING) ring.shift();
      this.rings.set(deck, ring);
    }
    for (const sub of this.subscribers) {
      if (sub.decks === "all" || sub.decks.has(deck)) this.enqueue(sub, message);
    }
  }

  /**
   * Attach a browser's stream.
   *
   * @param res - the HTTP response, already given SSE headers by the caller.
   * @param decks - tokens to receive, or "all" for the inbox.
   * @param last - the parsed `Last-Event-ID`: epoch and per-deck numbers. A
   *   cursor from an earlier server run gets a resync for each of its decks.
   * @param watch - for an "all" stream, the decks open in its tabs, whose
   *   file watchers it starts as a deck subscriber would.
   * @returns a function that detaches it.
   */
  subscribe(res: ServerResponse, decks: string[] | "all", last: { epoch: string; seqs: Record<string, number> }, watch: string[] = []): () => void {
    const lastSeen = last.epoch === this.epoch ? last.seqs : {};
    const stale = last.epoch && last.epoch !== this.epoch ? Object.keys(last.seqs) : [];
    const sub: Subscriber = { res, decks: decks === "all" ? "all" : new Set(decks), watch: new Set(decks === "all" ? watch : []), cursor: {}, pending: [], scheduled: false };
    this.subscribers.add(sub);
    const tokens = decks === "all" ? [...this.seq.keys()] : decks;
    for (const token of tokens) {
      sub.cursor[token] = this.seq.get(token) ?? 0;
      if (token in lastSeen) this.replay(sub, token, lastSeen[token]!);
      else if (stale.includes(token)) this.enqueue(sub, { deck: token, seq: sub.cursor[token]!, type: "resync", kind: "event", data: null });
      if (decks !== "all" && this.interestCount(token) === 1) this.onInterest(token, true);
    }
    for (const token of sub.watch) if (this.interestCount(token) === 1) this.onInterest(token, true);
    res.write(`retry: 2000\nid: ${encodeCursor(sub.cursor, this.epoch)}\nevent: hello\ndata: ${JSON.stringify({ cursor: sub.cursor })}\n\n`);
    return () => this.unsubscribe(sub);
  }

  /**
   * Where the stream of some decks stands now, as a `Last-Event-ID` cursor.
   * A page takes it before reading its slides and connects with it, so an
   * event published between the read and the connection is replayed.
   *
   * @param tokens - deck tokens.
   * @returns the cursor, with 0 for a deck that has published nothing.
   */
  cursorOf(tokens: string[]): string {
    return encodeCursor(Object.fromEntries(tokens.map((t) => [t, this.seq.get(t) ?? 0])), this.epoch);
  }

  /** Number of subscribers that watch a deck. */
  interestCount(token: string): number {
    let n = 0;
    for (const sub of this.subscribers) if (interested(sub, token)) n += 1;
    return n;
  }

  /**
   * The number of open streams and the decks each one carries.
   *
   * @returns one entry per open stream.
   */
  stats(): { streams: number; decks: (string[] | "all")[] } {
    const decks = [...this.subscribers].map((s) => (s.decks === "all" ? ("all" as const) : [...s.decks]));
    return { streams: this.subscribers.size, decks };
  }

  /** Whether some open stream carries a deck, directly or as "all". */
  carries(token: string): boolean {
    for (const sub of this.subscribers) if (sub.decks === "all" || sub.decks.has(token)) return true;
    return false;
  }

  /** Tokens watched by at least one browser. */
  watchedDecks(): Set<string> {
    const out = new Set<string>();
    for (const sub of this.subscribers) for (const t of interests(sub)) out.add(t);
    return out;
  }

  private unsubscribe(sub: Subscriber): void {
    this.subscribers.delete(sub);
    for (const token of interests(sub)) if (this.interestCount(token) === 0) this.onInterest(token, false);
    this.onDetach();
  }

  private replay(sub: Subscriber, token: string, lastSeq: number): void {
    const result = replayFrom(this.rings.get(token) ?? [], lastSeq, this.seq.get(token) ?? 0);
    if (result.resync) this.enqueue(sub, { deck: token, seq: this.seq.get(token) ?? 0, type: "resync", kind: "event", data: null });
    else for (const m of result.messages) this.enqueue(sub, m);
  }

  private enqueue(sub: Subscriber, message: StreamMessage): void {
    sub.pending.push(message);
    if (sub.pending.length > BACKLOG) sub.pending = this.trim(sub.pending);
    if (!sub.scheduled) {
      sub.scheduled = true;
      setImmediate(() => this.flush(sub));
    }
  }

  /**
   * Shrink an overflowing backlog: coalesce readings, and if events alone still
   * overflow, replace each deck's events with one resync marker.
   */
  private trim(pending: StreamMessage[]): StreamMessage[] {
    const merged = coalesce(pending);
    if (merged.length <= BACKLOG) return merged;
    const decks = new Map<string, number>();
    for (const m of merged) if (m.kind === "event") decks.set(m.deck, Math.max(decks.get(m.deck) ?? 0, m.seq));
    const readings = merged.filter((m) => m.kind === "reading").slice(-BACKLOG / 2);
    return [...[...decks].map(([deck, seq]) => ({ deck, seq, type: "resync", kind: "event" as const, data: null })), ...readings];
  }

  private flush(sub: Subscriber): void {
    sub.scheduled = false;
    if (!this.subscribers.has(sub)) return;
    if (sub.res.writableNeedDrain) {
      sub.res.once("drain", () => this.flush(sub));
      return;
    }
    const batch = coalesce(sub.pending);
    sub.pending = [];
    for (const m of batch) {
      if (m.kind === "event") sub.cursor[m.deck] = Math.max(sub.cursor[m.deck] ?? 0, m.seq);
      sub.res.write(`id: ${encodeCursor(sub.cursor, this.epoch)}\ndata: ${JSON.stringify(m)}\n\n`);
    }
  }

  private heartbeat(): void {
    for (const sub of this.subscribers) sub.res.write(`: heartbeat ${Date.now()}\n\n`);
  }

  /** Stop the heartbeat timer and end every stream. */
  close(): void {
    clearInterval(this.timer);
    for (const sub of this.subscribers) sub.res.end();
    this.subscribers.clear();
  }
}
