import { describe, expect, it } from "vitest";
import { searchComments, searchSnippet, searchTerms, statusMatches, type FolioComment, type SearchRecord } from "../src/index.js";

const comment = (over: Partial<FolioComment> = {}): FolioComment => ({
  id: "c1", deck: "d1", slide: "s1", slideRev: "r1", region: [0, 0, 10, 10], marks: [], components: [{ slot: "note", role: "note" }], shots: null,
  thread: [{ author: "user", at: "2026-10-12T00:00:00Z", text: "The barrier looks too low" }], status: "open", assignee: null,
  createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z", ...over,
});
const rec = (c: FolioComment, names = ["example", "d1"]): SearchRecord => ({ comment: c, deckNames: names });

describe("comment search", () => {
  it("splits terms and keeps quoted phrases whole", () => {
    expect(searchTerms('Barrier "too low"  eV')).toEqual(["barrier", "too low", "ev"]);
    expect(searchTerms("   ")).toEqual([]);
  });
  it("needs every term somewhere in the comment", () => {
    const records = [rec(comment())];
    expect(searchComments(records, { text: "barrier LOW" })).toHaveLength(1);
    expect(searchComments(records, { text: "barrier missing" })).toHaveLength(0);
  });
  it("finds a match inside a reply, not the first message", () => {
    const c = comment({ thread: [...comment().thread, { author: "w1", at: "2026-10-12T01:00:00Z", text: "Changed it to the zirconium value" }] });
    const [hit] = searchComments([rec(c)], { text: "zirconium barrier" });
    expect(hit?.messages.map((m) => [m.index, m.author])).toEqual([[0, "user"], [1, "w1"]]);
    expect(hit?.messages[1]?.snippet).toBe("Changed it to the [zirconium] value");
  });
  it("finds a match in an attachment name", () => {
    const att = { file: "att-1-isotherm.csv", name: "isotherm-77K.csv", type: "text/csv", bytes: 10 };
    const c = comment({ thread: [...comment().thread, { author: "user", at: "2026-10-12T02:00:00Z", text: "data here", attachments: [att] }] });
    const [hit] = searchComments([rec(c)], { text: "ISOTHERM" });
    expect(hit?.messages).toEqual([{ index: 1, author: "user", at: "2026-10-12T02:00:00Z", hits: 1, snippet: "attached [isotherm]-77K.csv" }]);
  });
  it("ranks by hits, then by recent activity", () => {
    const one = comment({ id: "one", updatedAt: "2026-10-12T05:00:00Z" });
    const two = comment({ id: "two", thread: [{ author: "user", at: "", text: "barrier, barrier" }] });
    const newer = comment({ id: "newer", updatedAt: "2026-10-12T09:00:00Z" });
    expect(searchComments([one, two, newer].map((c) => rec(c)), { text: "barrier" }).map((h) => h.record.comment.id)).toEqual(["two", "newer", "one"]);
  });
  it("filters by status, resolved and archived included", () => {
    const records = [
      rec(comment({ id: "open" })),
      rec(comment({ id: "done", status: "resolved" })),
      rec(comment({ id: "held", status: "held" })),
      rec(comment({ id: "review", thread: [...comment().thread, { author: "w1", at: "", text: "fixed" }] })),
    ];
    const ids = (status: string[]) => searchComments(records, { text: "barrier", status }).map((h) => h.record.comment.id).sort();
    expect(ids([])).toEqual(["done", "held", "open", "review"]);
    expect(ids(["resolved"])).toEqual(["done"]);
    expect(ids(["archived"])).toEqual(["done"]);
    expect(ids(["done", "held"])).toEqual(["done", "held"]);
    expect(ids(["review"])).toEqual(["review"]);
    expect(statusMatches(comment({ status: "resolved" }), ["queue"])).toBe(false);
  });
  it("filters by deck, slot, author and since; an empty query lists them", () => {
    const records = [rec(comment({ id: "a" })), rec(comment({ id: "b", components: [{ slot: "fig:a", role: "figure" }], updatedAt: "2026-10-13T00:00:00Z" }), ["other", "d2"])];
    expect(searchComments(records, { deck: "other" }).map((h) => h.record.comment.id)).toEqual(["b"]);
    expect(searchComments(records, { slot: "note" }).map((h) => h.record.comment.id)).toEqual(["a"]);
    expect(searchComments(records, { author: "w9" })).toHaveLength(0);
    expect(searchComments(records, { since: "2026-10-12T12:00:00Z" }).map((h) => h.record.comment.id)).toEqual(["b"]);
    expect(searchComments(records, {}, "user").map((h) => h.record.comment.id)).toEqual(["b", "a"]);
    expect(searchComments(records, { limit: 1 })).toHaveLength(1);
  });
  it("cuts a long snippet around the first match", () => {
    expect(searchSnippet(`${"x".repeat(100)} needle ${"y".repeat(100)}`, ["needle"], 10)).toBe(`…${"x".repeat(9)} [needle] ${"y".repeat(9)}…`);
  });
});
