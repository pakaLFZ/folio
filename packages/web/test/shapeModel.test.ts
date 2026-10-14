import { applySlidePatch, type SlideSpec } from "@folio/core";
import { describe, expect, it } from "vitest";
import { contentOps, deleteOps, drawnShape, endDragged, insertOps, moved, nextShapeName, placeOps, propsOf, resized, shapesOf, snap45, type Shape } from "../src/editor/shapeModel";

const slide = (props: Record<string, unknown> = {}): SlideSpec => ({ root: "s", elements: { s: { type: "canvas", props, children: [] } } }) as SlideSpec;

function patched(spec: SlideSpec, ops: ReturnType<typeof insertOps>): SlideSpec {
  const next = applySlidePatch(spec, ops);
  if (!next.ok) throw new Error("patch failed");
  return next.spec;
}

describe("drawing a shape", () => {
  it("a drag spans the box from either corner", () => {
    expect(drawnShape("rect", [100, 80], [40, 20], false)).toEqual({ box: [40, 20, 60, 60], content: { kind: "rect" } });
  });
  it("Shift keeps a square box on the side of the drag", () => {
    expect(drawnShape("ellipse", [100, 100], [130, 110], true)?.box).toEqual([100, 100, 30, 30]);
    expect(drawnShape("ellipse", [100, 100], [70, 90], true)?.box).toEqual([70, 70, 30, 30]);
  });
  it("an arrow keeps its ends in the box, tail first", () => {
    expect(drawnShape("arrow", [200, 50], [100, 90], false)).toEqual({ box: [100, 50, 100, 40], content: { kind: "arrow", from: [100, 0], to: [0, 40] } });
  });
  it("a flat line still has a box of at least 1 pt", () => {
    expect(drawnShape("line", [10, 10], [90, 10], false)).toEqual({ box: [10, 10, 80, 1], content: { kind: "line", from: [0, 0], to: [80, 0] } });
  });
  it("Shift snaps an arrow to 45 degrees", () => {
    expect(snap45([0, 0], [100, 8])).toEqual([100.3, 0]);
    const [x, y] = snap45([0, 0], [50, 47]);
    expect(Math.abs(x - y)).toBeLessThan(0.11);
  });
  it("a drag under 4 pt draws nothing", () => {
    expect(drawnShape("rect", [10, 10], [12, 12], false)).toBeNull();
  });
});

describe("names", () => {
  it("takes the first letter free in overrides and props", () => {
    expect(nextShapeName({})).toBe("shape:a");
    expect(nextShapeName({ overrides: { slots: { "shape:a": { role: "shape", box: [0, 0, 1, 1] } } }, "shape:b": { kind: "rect" } })).toBe("shape:c");
    const all = Object.fromEntries([..."abcdefghijklmnopqrstuvwxyz"].map((l) => [`shape:${l}`, {}]));
    expect(nextShapeName(all)).toBe("shape:aa");
  });
});

describe("writes", () => {
  it("insert writes the slot, a draft unless asked final, and its content in one patch", () => {
    const spec = slide({ title: "T" });
    const ops = insertOps(spec, "shape:a", [10, 20, 30, 40], { kind: "ellipse" });
    const after = propsOf(patched(spec, ops));
    expect(after.overrides).toEqual({ slots: { "shape:a": { role: "shape", box: [10, 20, 30, 40], draft: true } } });
    expect(propsOf(patched(spec, insertOps(spec, "shape:a", [10, 20, 30, 40], { kind: "ellipse" }, false))).overrides).toEqual({ slots: { "shape:a": { role: "shape", box: [10, 20, 30, 40] } } });
    expect(after["shape:a"]).toEqual({ kind: "ellipse" });
    expect(after.title).toBe("T");
  });
  it("a move rewrites only the box, keeping the other overrides", () => {
    const spec = slide({ overrides: { background: "smoke", slots: { "shape:a": { role: "shape", box: [10, 20, 30, 40] } } }, "shape:a": { kind: "rect", fill: "#ff0000" } });
    const shape = shapesOf(propsOf(spec))[0]!;
    const ops = placeOps(spec, moved(shape, 5, -2));
    expect(ops).toHaveLength(1);
    expect(propsOf(patched(spec, ops)).overrides).toEqual({ background: "smoke", slots: { "shape:a": { role: "shape", box: [15, 18, 30, 40] } } });
  });
  it("only the fields a kind takes are written", () => {
    const spec = slide({});
    const [op] = contentOps(spec, "shape:a", { kind: "arrow", fill: "red", text: "x", radius: 3, heads: "both", from: [0, 0], to: [10, 0], stroke: "ink" });
    expect((op as { value: unknown }).value).toEqual({ kind: "arrow", heads: "both", from: [0, 0], to: [10, 0], stroke: "ink" });
    const [rect] = contentOps(spec, "shape:b", { kind: "ellipse", radius: 3, heads: "end", from: [0, 0], fill: null, style: undefined });
    expect((rect as { value: unknown }).value).toEqual({ kind: "ellipse", fill: null });
  });
  it("delete removes the slot and the prop, and the overrides when nothing is left", () => {
    const spec = slide({ title: "T", overrides: { slots: { "shape:a": { role: "shape", box: [10, 20, 30, 40] } } }, "shape:a": { kind: "rect" } });
    expect(propsOf(patched(spec, deleteOps(spec, "shape:a")))).toEqual({ title: "T" });
  });
});

describe("resizing and ends", () => {
  const box: Shape = { name: "shape:a", box: [100, 100, 40, 20], content: { kind: "rect" } };
  const arrow: Shape = { name: "shape:b", box: [0, 0, 100, 50], content: { kind: "arrow", from: [0, 0], to: [100, 50] } };
  it("a corner handle moves its corner; the opposite one stays", () => {
    expect(resized(box, "se", [160, 150], false).box).toEqual([100, 100, 60, 50]);
    expect(resized(box, "nw", [90, 95], false).box).toEqual([90, 95, 50, 25]);
  });
  it("an edge handle moves one edge only", () => {
    expect(resized(box, "e", [200, 999], false).box).toEqual([100, 100, 100, 20]);
  });
  it("Shift on a corner keeps the proportions", () => {
    expect(resized(box, "se", [180, 110], true).box).toEqual([100, 100, 80, 40]);
  });
  it("resizing an arrow scales its ends", () => {
    expect(resized(arrow, "se", [200, 100], false).content).toMatchObject({ from: [0, 0], to: [200, 100] });
  });
  it("an end drag moves that end and re-boxes the arrow", () => {
    const after = endDragged(arrow, "to", [-50, 20], false);
    expect(after.box).toEqual([-50, 0, 50, 20]);
    expect(after.content).toMatchObject({ from: [50, 0], to: [0, 20] });
  });
});
