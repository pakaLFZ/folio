import { describe, expect, it } from "vitest";
import type { DeckState } from "../src/editor/deckState";
import { clickSlide, collapseSelection, extendSelection, NO_SELECTION, selectedIds } from "../src/editor/railSelection";

const deck = (current: string): DeckState =>
  ({ manifest: ["s1", "s2", "s3", "s4", "s5"].map((id) => ({ id })), current, selectedSlot: null, selection: NO_SELECTION }) as unknown as DeckState;

describe("rail selection", () => {
  it("a plain click selects one slide and makes it current", () => {
    const s = clickSlide(clickSlide(deck("s1"), "s3", "toggle"), "s4", "one");
    expect([s.current, selectedIds(s)]).toEqual(["s4", ["s4"]]);
  });
  it("Ctrl+click toggles without changing the current slide, and keeps the current one", () => {
    let s = clickSlide(deck("s2"), "s4", "toggle");
    expect([s.current, selectedIds(s)]).toEqual(["s2", ["s2", "s4"]]);
    s = clickSlide(s, "s4", "toggle");
    expect(selectedIds(s)).toEqual(["s2"]);
    expect(selectedIds(clickSlide(s, "s2", "toggle"))).toEqual(["s2"]);
  });
  it("Shift+click selects from the anchor, the last plain- or Ctrl-clicked slide", () => {
    const s = clickSlide(clickSlide(clickSlide(deck("s1"), "s2", "one"), "s3", "toggle"), "s5", "range");
    expect(selectedIds(s)).toEqual(["s2", "s3", "s4", "s5"]);
  });
  it("Shift+Arrow extends from the head, and Escape collapses to the current slide", () => {
    let s = extendSelection(extendSelection(clickSlide(deck("s1"), "s3", "one"), 1), 1);
    expect(selectedIds(s)).toEqual(["s3", "s4", "s5"]);
    s = extendSelection(s, -1);
    expect(selectedIds(s)).toEqual(["s3", "s4"]);
    expect(selectedIds(collapseSelection(s))).toEqual(["s3"]);
  });
  it("a stale selection that lost the current slide reads as the current slide alone", () => {
    const s = { ...clickSlide(deck("s1"), "s2", "toggle"), current: "s4" };
    expect(selectedIds(s)).toEqual(["s4"]);
  });
});
