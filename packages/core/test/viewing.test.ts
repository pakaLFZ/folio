import { describe, expect, it } from "vitest";
import { parseViewingReport, rankViewing, sameView, viewingStatusLine, viewingText, type ViewingTab } from "../src/viewing.js";

const report = { tab: "t1", token: "abcd1234", slide: "s002", mode: "edit", slot: null, slides: [], visible: true, focused: true };
const tab = (over: Partial<ViewingTab> = {}): ViewingTab => ({
  tab: "t1", deck: "decks/example", token: "abcd1234", title: "Example",
  slide: { id: "s002", position: 2, of: 7, layout: "two-col", title: "Results" },
  mode: "edit", selection: { slot: "shape:a", slides: [] }, visible: true, focused: true, activeSecondsAgo: 0, ...over,
});

describe("viewing", () => {
  it("parses a report, a closed tab, and names a bad field", () => {
    expect(parseViewingReport(report)).toEqual({ report });
    expect(parseViewingReport({ tab: "t1", closed: true })).toEqual({ closed: "t1" });
    expect(parseViewingReport({ ...report, token: 5 })).toEqual({ error: "token must be a deck token" });
    expect(parseViewingReport({ ...report, mode: "weird" })).toMatchObject({ report: { mode: "edit" } });
  });
  it("compares what is shown, not when", () => {
    expect(sameView(report as never, { ...report } as never)).toBe(true);
    expect(sameView(report as never, { ...report, slide: "s003" } as never)).toBe(false);
  });
  it("ranks visible, then focused, then most recently active", () => {
    const entries = [
      { id: "hidden-new", visible: false, focused: false, activeAt: 900 },
      { id: "visible-old", visible: true, focused: false, activeAt: 100 },
      { id: "visible-new", visible: true, focused: false, activeAt: 500 },
      { id: "focused", visible: true, focused: true, activeAt: 50 },
    ];
    expect(rankViewing(entries).map((e) => e.id)).toEqual(["focused", "visible-new", "visible-old", "hidden-new"]);
  });
  it("prints the top tab in full and the others one line each", () => {
    const text = viewingText([tab(), tab({ tab: "t2", deck: "decks/b", visible: false, focused: false, activeSecondsAgo: 300, selection: { slot: null, slides: [] } })]);
    expect(text).toContain("deck      decks/example");
    expect(text).toContain("slide     s002, 2 of 7");
    expect(text).toContain("selection shape:a");
    expect(text).toContain("  decks/b  s002 (2 of 7, layout two-col)  edit  hidden, active 5 min ago");
    expect(viewingText([])).toBe("no editor tab is open\n");
  });
  it("gives folio status one line", () => {
    expect(viewingStatusLine(null)).toMatch(/no editor is open/);
    expect(viewingStatusLine([])).toBe("viewing: no editor tab is open\n");
    expect(viewingStatusLine([tab()])).toBe("viewing: decks/example s002 (2 of 7) edit shape:a, active now  (folio viewing)\n");
  });
});
