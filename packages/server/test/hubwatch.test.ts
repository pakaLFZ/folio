import type { ServerResponse } from "node:http";
import { describe, expect, it } from "vitest";
import { Hub } from "../src/hub.js";

const response = () => ({ write: () => true }) as unknown as ServerResponse;
const fresh = { epoch: "", seqs: {} };

describe("Hub interest", () => {
  it("starts and stops the watchers of the decks an all-decks stream has open", () => {
    const hub = new Hub();
    const calls: string[] = [];
    hub.onInterest = (token, watching) => void calls.push(`${token} ${watching}`);
    const detachAll = hub.subscribe(response(), "all", fresh, ["aaaaaaaa"]);
    expect(calls).toEqual(["aaaaaaaa true"]);
    expect(hub.watchedDecks()).toEqual(new Set(["aaaaaaaa"]));
    const detachDeck = hub.subscribe(response(), ["aaaaaaaa"], fresh);
    detachAll();
    expect(calls).toEqual(["aaaaaaaa true"]);
    detachDeck();
    expect(calls).toEqual(["aaaaaaaa true", "aaaaaaaa false"]);
    hub.close();
  });

  it("starts no watcher for an all-decks stream with no deck open", () => {
    const hub = new Hub();
    const calls: string[] = [];
    hub.onInterest = (token, watching) => void calls.push(`${token} ${watching}`);
    hub.subscribe(response(), "all", fresh)();
    expect(calls).toEqual([]);
    hub.close();
  });
});
