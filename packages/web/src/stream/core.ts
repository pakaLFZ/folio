/**
 * One EventSource for any number of decks. Used inside the SharedWorker, by the
 * leader tab when there is no SharedWorker, and per tab as the last fallback.
 * Subscriptions are reference-counted; a change reconnects with the cursor, so
 * nothing is missed across the reconnect.
 */
import type { StreamMessage } from "@folio/core";

export type Sink = (message: StreamMessage | { type: "status"; connected: boolean }) => void;

export class StreamCore {
  private readonly counts = new Map<string, number>();
  private source: EventSource | null = null;
  private cursor = "";
  private key = "";
  private timer: ReturnType<typeof setTimeout> | null = null;

  /**
   * @param root - the server root, e.g. `/`.
   * @param sink - receives every message and connection status change.
   */
  constructor(private readonly root: string, private readonly sink: Sink) {}

  /**
   * Start from a cursor taken when a page read its slides, so events published
   * before the stream connects are replayed. A cursor already further along
   * for a deck is kept.
   *
   * @param cursor - an `epoch!token:seq` cursor, or undefined.
   */
  seed(cursor: string | undefined): void {
    if (cursor) this.cursor = this.cursor ? mergeCursor(this.cursor, cursor) : cursor;
  }

  /**
   * Add or remove interest in decks; `*` means every deck (the inbox).
   *
   * @param decks - deck tokens or `*`.
   * @param delta - +1 to subscribe, -1 to unsubscribe.
   */
  change(decks: string[], delta: 1 | -1): void {
    for (const d of decks) {
      const n = (this.counts.get(d) ?? 0) + delta;
      if (n > 0) this.counts.set(d, n);
      else this.counts.delete(d);
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.connect(), 30);
  }

  private connect(): void {
    const open = [...this.counts.keys()].filter((d) => d !== "*").sort();
    const decks = this.counts.has("*") ? ["*", ...open] : open;
    const key = decks.join(",");
    if (key === this.key && this.source) return;
    this.key = key;
    this.source?.close();
    this.source = null;
    if (!decks.length) return;
    const path = decks[0] !== "*" ? `events?decks=${key}` : open.length ? `inbox/events?watch=${open.join(",")}` : "inbox/events";
    const sep = path.includes("?") ? "&" : "?";
    const source = new EventSource(`${this.root}${path}${this.cursor ? `${sep}cursor=${encodeURIComponent(this.cursor)}` : ""}`);
    source.onopen = () => this.sink({ type: "status", connected: true });
    source.onerror = () => this.sink({ type: "status", connected: false });
    source.addEventListener("hello", (e) => {
      this.cursor = mergeCursor(this.cursor, (e as MessageEvent).lastEventId);
    });
    source.onmessage = (e) => {
      if (e.lastEventId) this.cursor = mergeCursor(this.cursor, e.lastEventId);
      this.sink(JSON.parse(e.data) as StreamMessage);
    };
    this.source = source;
  }
}

/**
 * Merge two `epoch!token:seq` cursors, keeping the higher number per deck. A
 * cursor from a newer server run replaces the older one outright.
 *
 * @returns the merged cursor.
 */
export function mergeCursor(a: string, b: string): string {
  const [ea = "", pa = ""] = a.includes("!") ? a.split("!") : ["", a];
  const [eb = "", pb = ""] = b.includes("!") ? b.split("!") : ["", b];
  if (ea && eb && ea !== eb) return b;
  const out = new Map<string, number>();
  for (const pair of `${pa},${pb}`.split(",")) {
    const [t, s] = pair.split(":");
    if (t && s) out.set(t, Math.max(out.get(t) ?? 0, Number(s)));
  }
  return `${eb || ea}!${[...out].sort().map(([t, s]) => `${t}:${s}`).join(",")}`;
}
