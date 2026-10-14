import { applySlidePatch, loadPack, type Pack, type SlideSpec } from "@folio/core";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { propsOf } from "../src/editor/shapeModel";
import { fontFamilies, insertTextOps, lookOf, lookOps, nextTextBoxName, textBoxesOf, withChange } from "../src/editor/textBoxModel";

const loaded = loadPack(JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8")));
if (!loaded.ok) throw new Error("pack");
const pack: Pack = loaded.pack;
const slide = (props: Record<string, unknown> = {}): SlideSpec => ({ root: "s", elements: { s: { type: "blank", props, children: [] } } }) as SlideSpec;
const patched = (spec: SlideSpec, ops: Parameters<typeof applySlidePatch>[1]) => {
  const next = applySlidePatch(spec, ops);
  if (!next.ok) throw new Error("patch");
  return next.spec;
};

describe("text boxes", () => {
  it("insert writes a body slot with the box and only the look's fields", () => {
    const spec = slide();
    const name = nextTextBoxName(spec);
    const after = propsOf(patched(spec, insertTextOps(spec, pack, name, [10, 20, 200, 50], { size: 14, fill: "smoke" })));
    expect(name).toBe("text:a");
    expect((after.overrides as { slots: Record<string, unknown> }).slots["text:a"]).toEqual({ role: "body", box: [10, 20, 200, 50], text: { size: 14 }, fill: "smoke", padding: 4, draft: true });
    expect(textBoxesOf(after).map((t) => t.name)).toEqual(["text:a"]);
  });
  it("a look change sets and clears fields at their paths in one patch", () => {
    const spec = slide({ overrides: { background: "smoke", slots: { "text:a": { role: "body", box: [0, 0, 100, 40], text: { size: 14 }, fill: "smoke", padding: 4 } } } });
    const look = withChange(lookOf(propsOf(spec), "text:a"), { size: undefined, color: "magenta", border: { color: "ink", width: 2, dash: "dash" } });
    const after = propsOf(patched(spec, lookOps(spec, "text:a", look)));
    expect(after.overrides).toEqual({ background: "smoke", slots: { "text:a": { role: "body", box: [0, 0, 100, 40], text: { color: "magenta" }, fill: "smoke", padding: 4, border: { color: "ink", width: 2, dash: "dash" } } } });
  });
  it("a background or border on an unpadded box brings 4 pt of padding", () => {
    expect(withChange({}, { border: { color: "ink", width: 1, dash: "solid" } }).padding).toBe(4);
    expect(withChange({ padding: 2 }, { fill: "smoke" }).padding).toBe(2);
    expect(withChange({}, { fill: null }).padding).toBeUndefined();
  });
  it("offers the pack's font families", () => {
    expect(fontFamilies(pack)).toEqual(["Liberation Sans", "Roboto", "Liberation Mono"]);
  });
});
