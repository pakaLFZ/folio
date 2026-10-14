import { describe, expect, it } from "vitest";
import { applyDrag, drawn } from "../src/editor/shapeDrag";
import type { Shape } from "../src/editor/shapeModel";
import { handleAxes, snapMove, snapPoint, snapTargets } from "../src/editor/snap";

const canvas = { w: 960, h: 540 };
const targets = snapTargets([[100, 100, 200, 100]], canvas);
const ctx = { targets, tol: 3 };
const box: Shape = { name: "shape:a", box: [400, 300, 100, 50], content: { kind: "rect" } };

describe("snap targets", () => {
  it("are the other boxes' edges and centres, and the canvas's edges and centre lines", () => {
    expect(targets.xs).toEqual([0, 480, 960, 100, 200, 300]);
    expect(targets.ys).toEqual([0, 270, 540, 100, 150, 200]);
  });
});

describe("snapping", () => {
  it("a point within the tolerance lands on the nearest target, and says where", () => {
    expect(snapPoint([102, 400], targets, 3)).toEqual({ p: [100, 400], guides: [{ axis: "x", at: 100 }] });
    expect(snapPoint([104, 400], targets, 3).p).toEqual([104, 400]);
  });
  it("a side handle snaps along its own axis only", () => {
    expect(handleAxes("e")).toEqual({ x: true, y: false });
    expect(snapPoint([299, 151], targets, 3, handleAxes("e")).p).toEqual([300, 151]);
  });
  it("a moved box snaps whichever of its edges or centre is nearest, per axis", () => {
    expect(snapMove([302, 268, 100, 50], targets, 3)).toEqual({ dx: -2, dy: 2, guides: [{ axis: "x", at: 300 }, { axis: "y", at: 270 }] });
    expect(snapMove([432, 400, 100, 50], targets, 3).dx).toBe(-2);
  });
  it("a box drawn near another's left edge lands on it; Alt draws free", () => {
    expect(drawn({ kind: "draw", tool: "text", a: [102, 250], b: [250, 320], shift: false, free: false }, ctx)?.box).toEqual([100, 250, 150, 70]);
    expect(drawn({ kind: "draw", tool: "text", a: [102, 250], b: [250, 320], shift: false, free: true }, ctx)?.box).toEqual([102, 250, 148, 70]);
  });
  it("moving and resizing snap; Alt does not", () => {
    expect(applyDrag({ kind: "move", name: "shape:a", a: [0, 0], b: [-98, 0], free: false }, box, ctx).shape.box).toEqual([300, 300, 100, 50]);
    expect(applyDrag({ kind: "move", name: "shape:a", a: [0, 0], b: [-98, 0], free: true }, box, ctx).shape.box).toEqual([302, 300, 100, 50]);
    expect(applyDrag({ kind: "resize", name: "shape:a", handle: "e", a: [506, 330], b: [484, 999], shift: false, free: false }, box, ctx).shape.box).toEqual([400, 300, 80, 50]);
    expect(applyDrag({ kind: "resize", name: "shape:a", handle: "e", a: [506, 330], b: [506, 330], shift: false, free: true }, box, ctx).shape.box).toEqual([400, 300, 100, 50]);
  });
});
