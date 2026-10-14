import { applySlidePatch, loadPack, makeSlideSpec, resolveOverrides, slideLayout, type Pack, type PatchOp, type SlideSpec } from "@folio/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { allItems, boxOps, boxOverridden, geometryOf, resetBoxOps, restoreOps } from "../src/editor/slotBoxes";
import { moved, resized } from "../src/editor/shapeModel";

const loaded = loadPack(JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8")));
if (!loaded.ok) throw new Error("pack");
const pack: Pack = loaded.pack;
const props = (spec: SlideSpec) => spec.elements[spec.root]!.props;
const patched = (spec: SlideSpec, ops: PatchOp[]) => {
  const next = applySlidePatch(spec, ops);
  if (!next.ok) throw new Error("patch");
  return next.spec;
};
const valid = (spec: SlideSpec) => resolveOverrides(pack, spec.elements[spec.root]!.type, props(spec).overrides).problems;
const item = (spec: SlideSpec, name: string) => allItems(pack, spec).find((s) => s.name === name)!;

describe("every slot is a box", () => {
  const spec = makeSlideSpec("plot-table", { title: "Results", overrides: { slots: { "shape:a": { role: "shape", box: [10, 10, 50, 50] }, "text:a": { role: "body", box: [5, 5, 100, 20] } } }, "shape:a": { kind: "rect" } });
  it("lists the layout's slots first, then the added ones, each once", () => {
    const names = allItems(pack, spec).map((s) => s.name);
    expect(names.slice(-2)).toEqual(["shape:a", "text:a"]);
    expect(names).toContain("title");
    expect(names).toContain("fig:a");
    expect(new Set(names).size).toBe(names.length);
  });
  it("takes a text slot by its edge and a figure or table by its body", () => {
    expect(item(spec, "title").text).toBe(true);
    expect(item(spec, "fig:a").text).toBe(false);
    expect(item(spec, "table:b").text).toBe(false);
    expect(item(spec, "title").box).toEqual(slideLayout(pack, "plot-table", props(spec))!.slots.title!.box);
  });
  it("places a slot that flows below another at its drawn box", () => {
    expect(allItems(pack, spec, (name) => (name === "note" ? [1, 2, 3, 4] : null)).find((s) => s.name === "note")!.box).toEqual([1, 2, 3, 4]);
  });
});

describe("moving, resizing and resetting a layout slot", () => {
  const spec = makeSlideSpec("plot-table", { title: "Results", note: "words", overrides: { slots: { title: { text: { size: 30 } } } } });
  it("writes the box as the slot's override, keeping its other overrides", () => {
    const title = item(spec, "title");
    const next = patched(spec, boxOps(pack, spec, moved(title, 20, 10)));
    const own = (props(next).overrides as { slots: Record<string, Record<string, unknown>> }).slots.title!;
    expect(own).toEqual({ text: { size: 30 }, box: [title.box[0] + 20, title.box[1] + 10, title.box[2], title.box[3]] });
    expect(valid(next)).toEqual([]);
    expect(slideLayout(pack, "plot-table", props(next))!.slots.title!.box).toEqual(own.box);
    expect(boxOverridden(pack, next, "title")).toBe(true);
    const back = patched(next, resetBoxOps(next, "title"));
    expect(props(back).overrides).toEqual({ slots: { title: { text: { size: 30 } } } });
    expect(boxOverridden(pack, back, "title")).toBe(false);
  });
  it("frees a slot that flows below another, and its reset restores the flow", () => {
    const note = item(spec, "note");
    const next = patched(spec, boxOps(pack, spec, resized(note, "se", [note.box[0] + note.box[2] - 40, note.box[1] + note.box[3]], false)));
    expect((props(next).overrides as { slots: Record<string, Record<string, unknown>> }).slots.note).toMatchObject({ below: null });
    expect(valid(next)).toEqual([]);
    expect(slideLayout(pack, "plot-table", props(next))!.slots.note!.below).toBeNull();
    const back = patched(next, resetBoxOps(next, "note"));
    expect(slideLayout(pack, "plot-table", props(back))!.slots.note!.below).not.toBeNull();
  });
  it("offers no reset on a slot the layout does not have", () => {
    const added = makeSlideSpec("plot-table", { overrides: { slots: { "text:a": { role: "body", box: [5, 5, 100, 20] } } } });
    expect(boxOverridden(pack, added, "text:a")).toBe(false);
  });
});

describe("undoing a box edit", () => {
  it("restores the box and below as they were, and an arrow's ends", () => {
    const spec = makeSlideSpec("plot-table", { title: "Results", overrides: { slots: { "shape:a": { role: "shape", box: [0, 0, 100, 10] } } }, "shape:a": { kind: "arrow", from: [0, 5], to: [100, 5], stroke: "ink" } });
    const before = { title: geometryOf(spec, "title"), arrow: geometryOf(spec, "shape:a") };
    const title = item(spec, "title");
    let next = patched(spec, boxOps(pack, spec, moved(title, 5, 5)));
    next = patched(next, boxOps(pack, next, resized(item(next, "shape:a"), "e", [50, 5], false)));
    expect(props(next)["shape:a"]).toMatchObject({ to: [50, 5] });
    let back = patched(next, restoreOps(next, "title", before.title));
    back = patched(back, restoreOps(back, "shape:a", before.arrow));
    expect(props(back).overrides).toEqual(props(spec).overrides);
    expect(props(back)["shape:a"]).toEqual(props(spec)["shape:a"]);
  });
});
