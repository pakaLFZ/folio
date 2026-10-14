import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatOverrideProblem, lineLimitOf, loadPack, makeSlideSpec, nextTextName, resolveOverrides, slideLayout, textAdd, textSlots, type Pack } from "../src/index.js";

const raw = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));
const loaded = loadPack(raw);
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack: Pack = loaded.pack;
const problems = (overrides: unknown) => resolveOverrides(pack, "blank", overrides).problems.map(formatOverrideProblem);
const box = { role: "body", box: [100, 100, 300, 100] };

describe("a text slot's box style", () => {
  it("takes a fill, a border and padding, the border's fields defaulted", () => {
    const slots = { "text:a": { ...box, fill: "smoke", border: { color: "#cc0000" }, padding: 6 } };
    expect(problems({ slots })).toEqual([]);
    expect(slideLayout(pack, "blank", { overrides: { slots } })!.slots["text:a"]).toMatchObject({ fill: "smoke", border: { color: "#cc0000", width: 1, dash: "solid" }, padding: 6 });
  });
  it("refuses a colour the pack does not know, by path", () => {
    expect(problems({ slots: { "text:a": { ...box, border: { color: "navy" } } } })).toEqual([expect.stringMatching(/^overrides\.slots\.text:a\.border\.color: "navy" is not a colour/)]);
    expect(problems({ slots: { "text:a": { ...box, fill: "navy" } } })).toEqual([expect.stringMatching(/^overrides\.slots\.text:a\.fill: "navy" is not a colour/)]);
  });
  it("refuses a box style on a slot that is not a text slot, and unknown border keys", () => {
    expect(problems({ slots: { "fig:a": { role: "figure", box: [0, 0, 100, 100], fill: "#ffffff" } } })).toEqual([expect.stringMatching(/^overrides\.slots\.fig:a\.fill: only a text slot takes a fill/)]);
    expect(problems({ slots: { "text:a": { ...box, border: { colour: "#000000" } } } })).toEqual([expect.stringMatching(/^overrides\.slots\.text:a\.border: unknown key "colour"/)]);
  });
  it("counts the line limit from the padded box", () => {
    const layout = slideLayout(pack, "blank", { overrides: { slots: { "text:a": { ...box, padding: 10 } } } })!;
    const slot = textSlots(pack, layout).find((t) => t.name === "text:a")!;
    expect(slot.lineLimit).toBe(lineLimitOf({ ...slot.slot, padding: 0 }, slot.style, 80));
  });
});

describe("folio text add", () => {
  it("adds the next free text box with its words, style and box style in one patch", () => {
    const spec = makeSlideSpec("blank", { overrides: { slots: { "text:a": box } } });
    const edit = textAdd(spec, pack, { box: [10, 20, 200, 50], text: "Note", style: { size: 14, weight: 700 }, boxStyle: { fill: "smoke", padding: 4 } });
    expect(edit.ok && edit.name).toBe("text:b");
    expect(edit.ok && edit.ops.map((o) => o.op)).toEqual(["add", "add"]);
    expect(nextTextName(["text:a", "text:b"])).toBe("text:c");
  });
});
