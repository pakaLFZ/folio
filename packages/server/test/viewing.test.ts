import { describe, expect, it } from "vitest";
import { VIEWING_TTL_MS, ViewingRegistry } from "../src/viewing.js";

const report = (over = {}) => ({ tab: "t1", token: "abcd1234", slide: "s001", mode: "edit" as const, slot: null, slides: [], visible: true, focused: false, ...over });

describe("ViewingRegistry", () => {
  it("moves the version on a change, not on a heartbeat, and moves activity only when shown or focused", () => {
    const r = new ViewingRegistry();
    r.report(report(), 1000);
    expect(r.version).toBe(1);
    r.report(report(), 5000);
    expect(r.version).toBe(1);
    expect(r.list(5000)[0]!.activeAt).toBe(1000);
    r.report(report({ focused: true }), 6000);
    expect([r.version, r.list(6000)[0]!.activeAt]).toEqual([2, 6000]);
    r.report(report({ focused: true }), 7000);
    expect([r.version, r.list(7000)[0]!.activeAt]).toEqual([2, 7000]);
  });
  it("forgets a closed tab, a deck whose stream closed, and a silent tab", () => {
    const r = new ViewingRegistry();
    r.report(report(), 0);
    r.report(report({ tab: "t2", token: "ffff0000" }), 0);
    r.report(report({ tab: "t3" }), 0);
    r.close("t1");
    r.keepStreamed((token) => token !== "ffff0000");
    expect(r.list(0).map((e) => e.tab)).toEqual(["t3"]);
    expect(r.list(VIEWING_TTL_MS + 1)).toEqual([]);
  });
  it("wakes a waiter on the next change and times out without one", async () => {
    const r = new ViewingRegistry();
    expect(await r.wait(r.version, 10)).toBe(false);
    const waiting = r.wait(r.version, 5000);
    r.report(report());
    expect(await waiting).toBe(true);
  });
});
