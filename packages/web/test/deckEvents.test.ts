import { describe, expect, it } from "vitest";
import { applyDeckEvent } from "../src/landing/deckEvents";

const a = { token: "aaaaaaaa", title: "A", editedAt: "2026-01-01T00:00:00.000Z", archived: false };
const b = { token: "bbbbbbbb", title: "B", editedAt: "2026-02-01T00:00:00.000Z", archived: false };
const msg = (type: string, data: unknown) => ({ deck: "workspace", seq: 1, type, kind: "event" as const, data });

describe("landing deck events", () => {
  it("adds a new deck, replaces a known one in place, and takes a removed one out", () => {
    expect(applyDeckEvent([a], msg("deck.added", b))).toEqual([a, b]);
    const retitled = { ...a, title: "A2", archived: true, editedAt: "2026-03-01T00:00:00.000Z", dir: "/x", template: "plain@1" };
    expect(applyDeckEvent([a, b], msg("deck.changed", retitled))).toEqual([{ token: a.token, title: "A2", editedAt: retitled.editedAt, archived: true }, b]);
    expect(applyDeckEvent([a, b], msg("deck.changed", { ...b, title: "B2" })).map((d) => d.title)).toEqual(["A", "B2"]);
    expect(applyDeckEvent([a, b], msg("deck.removed", { token: a.token }))).toEqual([b]);
  });
  it("leaves the list alone for any other message", () => {
    const list = [a];
    expect(applyDeckEvent(list, msg("slide", { token: a.token }))).toBe(list);
  });
});
