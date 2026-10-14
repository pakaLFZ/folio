import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applySlidePatch, arrowParts, buildCatalog, headLength, loadPack, makeSlideSpec, nextShapeName, resolveShape, shapeAdd, shapeRemove, shapeTextBox,
  shapeTextSlots, slideLayout, slideOverflowWarnings, slideRoot, slideWriteRefusal, type Pack, type RefinedSlot, type SlideSpec,
} from "../src/index.js";

const AT = "2026-10-13T00:00:00.000Z";
const raw = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));
const loaded = loadPack(raw);
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack: Pack = loaded.pack;
const box = { role: "shape", box: [100, 100, 200, 80] };
const slide = (shape: unknown, extra: Record<string, unknown> = {}): SlideSpec => makeSlideSpec("blank", { overrides: { slots: { "shape:a": { ...box, ...extra } } }, "shape:a": shape });
const refusal = (shape: unknown) => slideWriteRefusal(pack, {}, null, slide(shape));
const slotOf = (spec: SlideSpec) => slideLayout(pack, "blank", slideRoot(spec)!.props)!.slots["shape:a"] as RefinedSlot;
const drawn = (shape: unknown, extra: Record<string, unknown> = {}) => resolveShape(pack, slotOf(slide(shape, extra)), shape, "#000000")!;

describe("shape content", () => {
  it("accepts each kind with its own fields", () => {
    for (const shape of [{ kind: "rect", fill: "#f5f5f5", radius: 6, text: "Step 1" }, { kind: "ellipse", stroke: "red", dash: "dot" }, { kind: "arrow", from: [0, 40], to: [200, 40], heads: "both" }, { kind: "line", stroke: null }]) {
      expect(refusal(shape)).toBeNull();
    }
  });
  it("refuses fields the kind does not take, by path, with its fields and an example", () => {
    expect(refusal({ kind: "arrow", text: "hi" })).toMatch(/^\/elements\/s\/props\/shape:a\/text: an arrow takes no "text"; its fields are style, stroke, .* e\.g\. \{"kind": "arrow"/);
    expect(refusal({ kind: "rect", heads: "end" })).toMatch(/shape:a\/heads: a rect takes no "heads"/);
  });
  it("refuses a colour that is not a hex, ink or the pack's, naming the pack's colours", () => {
    expect(refusal({ kind: "rect", fill: "crimson" })).toMatch(/shape:a\/fill: "crimson" is not a colour: .*\(magenta, red, orange, green, smoke, rose\)/);
  });
  it("refuses an unknown kind, style or key", () => {
    expect(refusal({ kind: "star" })).toMatch(/"star" is not a shape kind; kind is rect, ellipse, arrow, line \(a circle is an ellipse in a square box\)/);
    expect(refusal({ kind: "rect", style: "loud" })).toMatch(/"loud" is not one of the pack's shape styles \(known: default, accent\)/);
    expect(refusal({ kind: "rect", colour: "#000" })).toMatch(/unknown key "colour"/);
  });
});

describe("shape styles", () => {
  it("takes the neutral default: no fill, an ink stroke of 1.25 pt", () => {
    expect(drawn({ kind: "rect" })).toMatchObject({ fill: "none", stroke: "#000000", strokeWidth: 1.25, dash: "solid", radius: 0 });
  });
  it("lets the slide's fields win over the slide's style, over the slot's style, over default", () => {
    expect(drawn({ kind: "rect" }, { style: "accent" })).toMatchObject({ stroke: "#C23A1E", strokeWidth: 2 });
    expect(drawn({ kind: "rect", style: "default" }, { style: "accent" })).toMatchObject({ stroke: "#000000", strokeWidth: 1.25 });
    expect(drawn({ kind: "rect", style: "accent", stroke: "green", strokeWidth: 3 })).toMatchObject({ stroke: "#2E7650", strokeWidth: 3 });
  });
  it("defaults an arrow to the box's left-middle to right-middle with a head at the end", () => {
    expect(drawn({ kind: "arrow" })).toMatchObject({ from: [0, 40], to: [200, 40], heads: "end", fill: "none" });
  });
  it("refuses at pack load a bad shape style colour, a misnamed shape slot, an unknown style and a hook", () => {
    const bad = structuredClone(raw);
    bad.shapes.loud = { stroke: "crimson" };
    bad.layouts.blank.slots = { arrow: { role: "shape", box: [0, 0, 10, 10] }, "shape:b": { role: "shape", box: [0, 0, 10, 10], style: "nope", hook: "x" } };
    const result = loadPack(bad);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.problems).toEqual(expect.arrayContaining([
      expect.stringMatching(/^shapes\.loud\.stroke: "crimson" is not a colour/),
      'layouts.blank.slots.arrow: a shape slot is named "shape:<letter>", like "shape:a"; rename the slot',
      "layouts.blank.slots.shape:b.hook: a shape slot takes no hook; remove the field",
      'layouts.blank.slots.shape:b.style: "nope" is not one of the pack\'s shape styles (known: default, accent, loud)',
    ]));
  });
});

describe("shape geometry", () => {
  it("scales arrow heads with the stroke and stops the line at the head's base", () => {
    const parts = arrowParts([0, 0], [100, 0], 2, "end");
    expect(headLength(2)).toBe(10);
    expect(parts.line).toEqual([[0, 0], [90, 0]]);
    expect(parts.heads).toEqual([[[100, 0], [90, 4], [90, -4]]]);
    expect(arrowParts([0, 0], [100, 0], 2, "both").heads).toHaveLength(2);
    expect(arrowParts([0, 0], [100, 0], 2, "none").line).toEqual([[0, 0], [100, 0]]);
  });
  it("puts a rect's text inside its padding and an ellipse's in its inscribed rectangle", () => {
    expect(shapeTextBox("rect", 200, 80, 2)).toEqual([8, 8, 184, 64]);
    const [x, y, w, h] = shapeTextBox("ellipse", 100, 100, 2);
    expect([x, y, w, h].map((n) => Math.round(n * 10) / 10)).toEqual([14.6, 14.6, 70.7, 70.7]);
  });
});

describe("shape text", () => {
  it("is measured against the lines its text box holds, as a text slot", () => {
    const spec = slide({ kind: "rect", text: "Step 1" });
    const props = slideRoot(spec)!.props;
    const layout = slideLayout(pack, "blank", props)!;
    const [text] = shapeTextSlots(pack, layout, props);
    expect(text).toMatchObject({ name: "shape:a", lineLimit: Math.floor((80 - 2 * 7.5 + 0.5) / (text!.style.size * text!.style.lineHeight)) });
    expect(text!.style).toMatchObject({ align: "center", anchor: "middle" });
    const warnings = slideOverflowWarnings({ deck: "d", slide: "s010" }, pack, layout, [{ slot: "shape:a", lines: 9, overPt: 0 }], AT, props);
    expect(warnings.map((w) => [w.code, w.args.limit])).toEqual([["FOLIO-OVF-001", text!.lineLimit]]);
  });
  it("takes the slot's text override over the style", () => {
    const spec = slide({ kind: "ellipse", text: "x" }, { text: { size: 9 } });
    const props = slideRoot(spec)!.props;
    expect(shapeTextSlots(pack, slideLayout(pack, "blank", props)!, props)[0]!.style.size).toBe(9);
  });
});

describe("folio shape add and rm", () => {
  const empty = makeSlideSpec("blank", {});
  it("names the next free shape slot", () => {
    expect(nextShapeName(["shape:a", "shape:b", "title"])).toBe("shape:c");
  });
  it("adds the slot and its content in one patch that the write check accepts", () => {
    const edit = shapeAdd(empty, pack, { kind: "circle", box: [10, 20, 50], fields: { fill: "smoke" } });
    expect(edit).toMatchObject({ ok: true, name: "shape:a" });
    if (!edit.ok) return;
    const after = applySlidePatch(empty, edit.ops);
    expect(after.ok).toBe(true);
    if (!after.ok) return;
    expect(slideRoot(after.spec)!.props).toEqual({ overrides: { slots: { "shape:a": { role: "shape", box: [10, 20, 50, 50] } } }, "shape:a": { kind: "ellipse", fill: "smoke" } });
    expect(slideWriteRefusal(pack, {}, empty, after.spec)).toBeNull();
    const second = shapeAdd(after.spec, pack, { kind: "arrow", from: [100, 100], to: [200, 150] });
    expect(second).toMatchObject({ ok: true, name: "shape:b" });
    if (!second.ok) return;
    const both = applySlidePatch(after.spec, second.ops);
    if (!both.ok) throw new Error(both.reason);
    expect(slideRoot(both.spec)!.props["shape:b"]).toEqual({ kind: "arrow", from: [12, 12], to: [112, 62] });
    const removed = shapeRemove(both.spec, pack, "shape:a");
    if (!removed.ok) throw new Error(removed.reason);
    const left = applySlidePatch(both.spec, removed.ops);
    if (!left.ok) throw new Error(left.reason);
    expect(Object.keys(slideRoot(left.spec)!.props).sort()).toEqual(["overrides", "shape:b"]);
  });
  it("refuses a circle in a box that is not square, and a rect without a box", () => {
    expect(shapeAdd(empty, pack, { kind: "circle", box: [0, 0, 40, 50] })).toMatchObject({ ok: false, reason: expect.stringMatching(/a circle is an ellipse in a square box/) });
    expect(shapeAdd(empty, pack, { kind: "rect" })).toMatchObject({ ok: false, reason: "a rect needs --box x,y,w,h" });
    expect(shapeRemove(empty, pack, "shape:z")).toMatchObject({ ok: false, reason: '"shape:z" is not a shape slot of this slide (shapes: none)' });
  });
});

describe("folio prompt", () => {
  it("teaches shapes with one command and the pack's styles and colours", () => {
    const prompt = buildCatalog(pack).prompt();
    expect(prompt).toContain('folio shape add <deck>/s010 rect --box 100,120,200,80 --fill "#f5f5f5" --text "Step 1"');
    expect(prompt).toContain("Styles: default, accent;");
    expect(prompt).toContain("or magenta, red, orange, green, smoke");
  });
});
