import { describe, expect, it } from "vitest";
import { dragSlots, gapLanding, gapUnder, homeGap, nearSpan } from "../src/editor/railGap";

const order = ["s1", "s2", "s3", "s4", "s5"];
const slotsOf = (moving: string[], gap: number) => order.map((id) => dragSlots(order, moving, gap).get(id));

describe("rail gap", () => {
  it("the others close up and a gap the group's size opens; the group stands in it", () => {
    expect(slotsOf(["s2"], 3)).toEqual([0, 3, 1, 2, 4]);
    expect(slotsOf(["s2", "s4"], 0)).toEqual([2, 0, 3, 1, 4]);
    expect(slotsOf(["s1", "s2"], 3)).toEqual([3, 4, 0, 1, 2]);
  });
  it("a contiguous group's home gap leaves every slide in place", () => {
    expect(homeGap(order, ["s2", "s3"])).toBe(1);
    expect(slotsOf(["s2", "s3"], 1)).toEqual([0, 1, 2, 3, 4]);
    expect(homeGap(order, ["s2", "s4"])).toBe(1);
  });
  it("the gap follows the pointer's slot, offset by the grabbed slide, within the list", () => {
    expect(gapUnder(4, 0, 5, 1)).toBe(4);
    expect(gapUnder(4, 1, 5, 2)).toBe(3);
    expect(gapUnder(9, 0, 5, 2)).toBe(3);
    expect(gapUnder(-2, 0, 5, 2)).toBe(0);
  });
  it("a gap names the slide the group lands in front of, and a no-op gap names nothing", () => {
    expect(gapLanding(order, ["s2", "s4"], 0)).toBe("s1");
    expect(gapLanding(order, ["s2"], 4)).toBeNull();
    expect(gapLanding(order, ["s2"], 1)).toBeUndefined();
    expect(gapLanding(order, ["s2", "s3"], 1)).toBeUndefined();
    expect(gapLanding(order, ["s1", "s4"], 2)).toBe("s5");
  });
  it("a slot is near a span within the reach on either side", () => {
    expect([0, 1, 5, 9, 10].map((s) => nearSpan(s, 4, 6, 3))).toEqual([false, true, true, true, false]);
  });
});
