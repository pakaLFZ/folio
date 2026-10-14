/**
 * The tab's side of the live stream. One stream per browser, by the first of:
 * a SharedWorker; a leader tab elected with Web Locks relaying over a
 * BroadcastChannel; or, failing both, a stream of this tab's own.
 */
import { parseCursor, type StreamMessage } from "@folio/core";
import { boot } from "../boot";
import { StreamCore } from "./core";

type Listener = (message: StreamMessage) => void;
type StatusListener = (connected: boolean) => void;

const listeners = new Set<{ decks: Set<string>; fn: Listener }>();
const statusListeners = new Set<StatusListener>();
const tabId = Math.random().toString(36).slice(2);
let transport: { change: (decks: string[], delta: 1 | -1) => void } | null = null;
const RECENT_LIMIT = 512;
const recent: StreamMessage[] = [];
const droppedUpTo = new Map<string, number>();
let droppedAll = false;

/** Keep the tab's latest messages, so a page that starts in place can catch up from its cursor. */
function remember(message: StreamMessage): void {
  recent.push(message);
  if (recent.length <= RECENT_LIMIT) return;
  const old = recent.shift()!;
  droppedUpTo.set(old.deck, Math.max(droppedUpTo.get(old.deck) ?? 0, old.seq));
}

/**
 * Hand a message to the listeners of its deck.
 *
 * @param message - a stream message or a status change.
 */
function deliver(message: StreamMessage | { type: "status"; connected: boolean }): void {
  if (!("deck" in message)) {
    if (!message.connected) {
      droppedAll = true;
      recent.length = 0;
    }
    statusListeners.forEach((fn) => fn(message.connected));
    return;
  }
  remember(message);
  for (const l of listeners) if (l.decks.has("*") || l.decks.has(message.deck)) l.fn(message);
}

/** Connect through a SharedWorker. */
function sharedWorkerTransport() {
  const worker = new SharedWorker(new URL("./worker.ts", import.meta.url), { type: "module", name: `folio-stream:${boot.root}` });
  worker.port.onmessage = (e) => deliver(e.data);
  worker.port.start();
  worker.port.postMessage({ type: "init", root: boot.root, cursor: boot.cursor });
  addEventListener("pagehide", () => worker.port.postMessage({ type: "close" }));
  return { change: (decks: string[], delta: 1 | -1) => worker.port.postMessage({ type: delta > 0 ? "subscribe" : "unsubscribe", decks }) };
}

/** Connect through a leader tab: one tab holds the stream, the others listen. */
function leaderTransport() {
  const channel = new BroadcastChannel(`folio-stream:${boot.root}`);
  const mine = new Map<string, number>();
  const announce = () => channel.postMessage({ type: "want", tab: tabId, decks: [...mine.keys()] });
  channel.onmessage = (e) => {
    const msg = e.data;
    if (msg.type === "relay") deliver(msg.message);
    else if (msg.type === "leader") announce();
  };
  void navigator.locks.request(`folio-stream-leader:${boot.root}`, () => {
    const wants = new Map<string, string[]>([[tabId, [...mine.keys()]]]);
    const core = new StreamCore(boot.root, (message) => {
      deliver(message);
      channel.postMessage({ type: "relay", message });
    });
    core.seed(boot.cursor);
    const resubscribe = () => {
      core.change([...new Set([...wants.values()].flat())], 1);
    };
    channel.addEventListener("message", (e) => {
      if (e.data.type !== "want") return;
      wants.set(e.data.tab, e.data.decks);
      resubscribe();
    });
    addEventListener("pagehide", () => channel.postMessage({ type: "leader-gone" }));
    channel.postMessage({ type: "leader" });
    resubscribe();
    return new Promise(() => {});
  });
  addEventListener("pagehide", () => channel.postMessage({ type: "want", tab: tabId, decks: [] }));
  return {
    change: (decks: string[], delta: 1 | -1) => {
      for (const d of decks) mine.set(d, (mine.get(d) ?? 0) + delta);
      for (const [d, n] of mine) if (n <= 0) mine.delete(d);
      announce();
    },
  };
}

/**
 * Pick the transport once.
 *
 * @returns the transport this tab uses.
 */
function getTransport() {
  if (transport) return transport;
  if (typeof SharedWorker !== "undefined") transport = sharedWorkerTransport();
  else if (typeof BroadcastChannel !== "undefined" && navigator.locks) transport = leaderTransport();
  else {
    const core = new StreamCore(boot.root, deliver);
    core.seed(boot.cursor);
    transport = { change: (decks, delta) => core.change(decks, delta) };
  }
  return transport;
}

/**
 * Hand a new listener what this tab received after a cursor: a page opened in
 * place (no reload) read its slides at that cursor while the tab's stream kept
 * running. A `resync` stands in when the kept messages no longer reach back
 * or the stream has dropped since (another server run may have reused the numbers).
 */
function catchUp(decks: string[], since: string, fn: Listener): void {
  const { seqs } = parseCursor(since);
  for (const deck of decks) {
    const from = seqs[deck];
    if (from === undefined) continue;
    if (droppedAll || (droppedUpTo.get(deck) ?? 0) > from) fn({ deck, seq: from, type: "resync", kind: "event", data: null });
    else recent.filter((m) => m.deck === deck && m.seq > from).forEach(fn);
  }
}

/**
 * Receive the live messages of some decks.
 *
 * @param decks - deck tokens, or `["*"]` for every deck (the inbox).
 * @param fn - called with each message for those decks.
 * @param since - the cursor the caller's data was read at; messages this tab
 *   already received after it are replayed first.
 * @returns a function that stops the subscription.
 */
export function subscribe(decks: string[], fn: Listener, since?: string): () => void {
  const entry = { decks: new Set(decks), fn };
  if (since) catchUp(decks, since, fn);
  listeners.add(entry);
  getTransport().change(decks, 1);
  return () => {
    listeners.delete(entry);
    getTransport().change(decks, -1);
  };
}

/**
 * Follow the connection state.
 *
 * @param fn - called with true on connect and false on a drop.
 * @returns a function that stops following.
 */
export function onStatus(fn: StatusListener): () => void {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}
