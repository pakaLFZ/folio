/**
 * The SharedWorker: holds the browser's one stream and fans messages out to the
 * tabs that subscribed to each deck.
 */
import type { StreamMessage } from "@folio/core";
import { StreamCore } from "./core";

interface PortState {
  decks: Set<string>;
}

const ports = new Map<MessagePort, PortState>();
let core: StreamCore | null = null;

/**
 * Deliver a message to every port that wants it.
 *
 * @param message - a stream message or a status change.
 */
function fanOut(message: StreamMessage | { type: "status"; connected: boolean }): void {
  for (const [port, state] of ports) {
    const wanted = !("deck" in message) || state.decks.has("*") || state.decks.has(message.deck);
    if (wanted) port.postMessage(message);
  }
}

(self as unknown as { onconnect: (e: MessageEvent) => void }).onconnect = (event) => {
  const port = event.ports[0]!;
  const state: PortState = { decks: new Set() };
  ports.set(port, state);
  port.onmessage = (e: MessageEvent<{ type: string; root?: string; decks?: string[]; cursor?: string }>) => {
    const msg = e.data;
    if (msg.type === "init" && !core) core = new StreamCore(msg.root ?? "/", fanOut);
    if (!core) return;
    if (msg.type === "init") core.seed(msg.cursor);
    if (msg.type === "subscribe") {
      const fresh = (msg.decks ?? []).filter((d) => !state.decks.has(d));
      fresh.forEach((d) => state.decks.add(d));
      core.change(fresh, 1);
    } else if (msg.type === "unsubscribe") {
      const gone = (msg.decks ?? []).filter((d) => state.decks.has(d));
      gone.forEach((d) => state.decks.delete(d));
      core.change(gone, -1);
    } else if (msg.type === "close") {
      core.change([...state.decks], -1);
      ports.delete(port);
    }
  };
  port.start();
};
