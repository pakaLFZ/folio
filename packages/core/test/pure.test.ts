import { describe, expect, it } from "vitest";
import {
  breakerState, canonicalJson, coalesce, commentLink, commentTurn, encodeCursor, executionOrder, expectedPixels, filterInbox, hookCacheKey,
  clearable, inboxIndex, intersectingSlots, onBoard, marksBounds, nextJobs, parseCommentLink, parseCursor, pngSize, rankBetween, replayFrom, resolveAliases,
  revisionSteps, rolloutStep, validateHookInputs, viewOf, withFollower, type FolioComment, type Job, type StreamMessage,
} from "../src/index.js";

const layout = { description: "", background: "plain", usage: null, decorations: [], aliases: {}, slots: {
  note: { role: "note" as const, box: [25, 110, 440, 400] as [number, number, number, number], lines: null, enforce: false, hook: null, style: null, description: null, placeholder: null, tableStyle: null, below: null, fill: null, border: null, padding: 0, draft: false },
  "fig:a": { role: "figure" as const, box: [495, 133, 440, 360] as [number, number, number, number], lines: null, enforce: false, hook: null, style: null, description: null, placeholder: null, tableStyle: null, below: null, fill: null, border: null, padding: 0, draft: false },
} };
const comment = (over: Partial<FolioComment> = {}): FolioComment => ({
  id: "c1", deck: "d", slide: "s1", slideRev: "r1", region: [0, 0, 10, 10], marks: [], components: [], shots: null,
  thread: [{ author: "user", at: "2026-10-12T00:00:00Z", text: "hi" }], status: "open", assignee: null, createdAt: "2026-10-12T00:00:00Z", updatedAt: "2026-10-12T00:00:00Z", ...over,
});

describe("comments", () => {
  it("finds the slots a region covers", () => {
    expect(intersectingSlots([300, 300, 300, 60], layout)).toEqual(["note", "fig:a"]);
    expect(intersectingSlots([470, 0, 20, 20], layout)).toEqual([]);
  });
  it("says whose turn it is", () => {
    expect(commentTurn(comment().thread)).toBe("agent");
    expect(commentTurn([...comment().thread, { author: "w1", at: "", text: "done" }])).toBe("user");
  });
  it("takes the region from the sketch", () => {
    expect(marksBounds([{ tool: "arrow", points: [[100, 50], [40, 80]] }], 5)).toEqual([35, 45, 70, 40]);
    expect(marksBounds([])).toBeNull();
  });
  it("round-trips a comment link", () => {
    expect(parseCommentLink(commentLink("http://localhost:4310/", "a1b2c3d4", "s002", "cx"))).toEqual({ deck: "a1b2c3d4", slide: "s002", comment: "cx" });
  });
  it("steps through revisions with screenshots", () => {
    const c = comment({ shots: { region: "r", slide: "s" }, thread: [{ author: "user", at: "a", text: "x", slideRev: "r1" }, { author: "w", at: "b", text: "y", slideRev: "r2", shots: { region: "r2", slide: "s2" } }] });
    expect(revisionSteps(c).map((s) => s.rev)).toEqual(["r1", "r2"]);
  });
  it("ranks between neighbours and follows without duplicates", () => {
    expect(rankBetween(10, 20)).toBe(15);
    expect(rankBetween(undefined, 20)).toBeLessThan(20);
    expect(withFollower(["user"], "user")).toEqual(["user"]);
    expect(withFollower(["user", "w1"], "w1", false)).toEqual(["user"]);
  });
});

describe("board", () => {
  it("puts each comment in its column", () => {
    expect(viewOf(comment())).toBe("queue");
    expect(viewOf(comment({ assignee: "w1" }))).toBe("progress");
    expect(viewOf(comment({ status: "answered" }))).toBe("review");
    expect(viewOf(comment({ status: "held" }))).toBe("held");
    expect(viewOf(comment({ status: "resolved" }))).toBe("done");
  });
  it("orders the queue by rank and filters following", () => {
    const rows = inboxIndex([{ comment: comment({ id: "a", rank: 5 }), deckTitle: "D", orphaned: null }, { comment: comment({ id: "b", rank: 1, followers: ["w1"] }), deckTitle: "D", orphaned: null }], {});
    expect(rows.map((r) => r.id)).toEqual(["b", "a"]);
    expect(filterInbox(rows, { following: true }).map((r) => r.id)).toEqual(["a"]);
  });
  it("leaves a cleared Done card off the board and clears only cards still in the column", () => {
    const cleared = comment({ id: "c", status: "resolved", clearedAt: "2026-10-12T00:00:00Z" });
    const rows = inboxIndex([{ comment: cleared, deckTitle: "D", orphaned: null }, { comment: comment({ id: "d", status: "resolved" }), deckTitle: "D", orphaned: null }], {});
    expect(rows.map((r) => r.id)).toEqual(["d"]);
    expect(onBoard(cleared)).toBe(false);
    expect(onBoard(comment({ clearedAt: "2026-10-12T00:00:00Z" }))).toBe(true);
    expect(clearable(comment(), "queue")).toBe(true);
    expect(clearable(comment({ assignee: "w1" }), "queue")).toBe(false);
    expect(clearable(cleared, "done")).toBe(false);
  });
  it("lists comments in execution order: queue by rank, then the other columns", () => {
    const later = (id: string, over: Partial<FolioComment>) => comment({ id, ...over });
    const list = [
      later("held", { status: "held" }), later("done", { status: "resolved" }), later("q2", { rank: 9 }),
      later("review", { status: "answered" }), later("progress", { assignee: "w1", rank: 1 }), later("q1", { rank: 3 }),
    ];
    expect(executionOrder(list).map((c) => c.id)).toEqual(["q1", "q2", "progress", "review", "held", "done"]);
  });
});

describe("queue", () => {
  const job = (hook: string, slot: string, priority = 4, at = 0): Job => ({ deck: "d", slide: "s", slot, hook, stamp: `${hook}@1:x`, key: slot, kind: "figure", role: "figure", inputs: {}, box: { w: 1, h: 1, dpi: 72 }, priority, enqueuedAt: at, attempt: 0 });
  it("shares slots round-robin across hooks within the caps", () => {
    const queued = [job("a", "1"), job("a", "2"), job("a", "3"), job("b", "4")];
    expect(nextJobs(queued, [], { global: 3, perHook: 2 }, new Set()).map((j) => j.slot)).toEqual(["1", "4", "2"]);
  });
  it("runs the slot the user looks at first and skips paused hooks and busy slots", () => {
    const picked = nextJobs([job("a", "1", 4), job("b", "2", 1), job("c", "3", 2)], [job("x", "3")], { global: 4, perHook: 2 }, new Set(["c@1:x"]));
    expect(picked.map((j) => j.slot)).toEqual(["2", "1"]);
  });
  it("pauses after three failures in a row", () => {
    expect(breakerState([false, false, true, false, false]).paused).toBe(false);
    expect(breakerState([true, false, false, false])).toEqual({ failures: 3, paused: true });
  });
  it("opens or stops a rollout on the canary", () => {
    const running = rolloutStep({ phase: "canary" }, { type: "start", key: "k" });
    expect(rolloutStep(running, { type: "result", key: "k", ok: true })).toEqual({ phase: "rolling" });
    expect(rolloutStep(running, { type: "result", key: "k", ok: false, reason: "exit" }).phase).toBe("failed");
  });
});

describe("hooks", () => {
  it("keys equal inputs equally whatever their key order", () => {
    const stamp = { name: "h", version: 1, scriptHash: "x" };
    expect(canonicalJson({ b: 1, a: [2, { d: 1, c: 0 }] })).toBe('{"a":[2,{"c":0,"d":1}],"b":1}');
    expect(hookCacheKey({ a: 1, b: 2 }, { w: 1, h: 2, dpi: 3 }, stamp)).toBe(hookCacheKey({ b: 2, a: 1 }, { w: 1, h: 2, dpi: 3 }, stamp));
    expect(hookCacheKey({ a: 1 }, { w: 1, h: 2, dpi: 3 }, stamp)).not.toBe(hookCacheKey({ a: 1 }, { w: 1, h: 2, dpi: 3 }, { ...stamp, scriptHash: "y" }));
  });
  it("names a bad input by its path", () => {
    const schema = { type: "object", additionalProperties: false, required: ["runs"], properties: { runs: { type: "array", items: { type: "string" } } } };
    const issues = validateHookInputs(schema, { runs: ["a", 3], extra: 1 }).map((i) => i.jsonPath).sort();
    expect(issues).toEqual(["/extra", "/runs/1"]);
  });
  it("computes and reads figure sizes", () => {
    expect(expectedPixels({ w: 439.6, h: 360.2, dpi: 200 })).toEqual({ w: 1221, h: 1001 });
    const header = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 4, 197, 0, 0, 3, 232]);
    expect(pngSize(header)).toEqual({ w: 1221, h: 1000 });
  });
});

describe("stream", () => {
  const m = (seq: number, kind: "event" | "reading", key?: string): StreamMessage => ({ deck: "d", seq, type: kind === "event" ? "slide" : "presence", kind, ...(key ? { key } : {}), data: seq });
  it("keeps every event and the last reading per key", () => {
    expect(coalesce([m(1, "event"), m(1, "reading", "x"), m(2, "event"), m(2, "reading", "x")]).map((x) => `${x.kind}${x.data}`)).toEqual(["event1", "event2", "reading2"]);
  });
  it("replays what was missed or asks for a resync", () => {
    const ring = [m(5, "event"), m(6, "event"), m(7, "event")];
    expect(replayFrom(ring, 5, 7)).toEqual({ resync: false, messages: [ring[1], ring[2]] });
    expect(replayFrom(ring, 2, 7)).toEqual({ resync: true });
  });
  it("round-trips a cursor with its epoch", () => {
    expect(parseCursor(encodeCursor({ b: 2, a: 1 }, "e1"))).toEqual({ epoch: "e1", seqs: { a: 1, b: 2 } });
  });
});

describe("aliases", () => {
  it("moves an aliased slot to its name here", () => {
    expect(resolveAliases({ body: "x", title: "t" }, { body: "note" })).toEqual({ note: "x", title: "t" });
    expect(resolveAliases({ body: "x", note: "own" }, { body: "note" })).toEqual({ note: "own" });
  });
});
