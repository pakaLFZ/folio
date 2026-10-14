import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyPromoteEdits, buildCatalog, formatOverrideProblem, loadPack, makeSlideSpec, promoteOverrides, resolveOverrides, slideContentWarnings, slideLayout, slideOverflowWarnings, textSlots, type Pack } from "../src/index.js";

const AT = "2026-10-13T00:00:00.000Z";
const where = { deck: "d", slide: "s010" };
const raw = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));
const loaded = loadPack(raw);
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack: Pack = loaded.pack;
const problems = (overrides: unknown) => resolveOverrides(pack, "blank", overrides).problems.map(formatOverrideProblem);
const headline = { role: "title", box: [60, 200, 840, 80] };

describe("added slots", () => {
  it("adds a full slot to a layout that has none, with the pack's defaults filled in", () => {
    const layout = slideLayout(pack, "blank", { overrides: { slots: { headline } } })!;
    expect(layout.slots.headline).toMatchObject({ ...headline, lines: null, style: null, below: null });
    expect(problems({ slots: { headline } })).toEqual([]);
  });
  it("refuses a partial one by path, naming each missing field and the layout's slots", () => {
    expect(problems({ slots: { headline: { box: [60, 200, 840, 80] } } })).toEqual([
      'overrides.slots.headline.role: "headline" is not a slot of layout blank (slots: ); to add it as a new slot give its full definition, at least "role" and "box"',
    ]);
    expect(problems({ slots: { headline: { role: "title", box: [60, 200, 0, 80] } } })).toEqual([expect.stringMatching(/^overrides\.slots\.headline\.box\.2: Too small/)]);
  });
  it("refuses a name its role cannot have, as the pack would", () => {
    expect(problems({ slots: { picture: { role: "figure", box: [0, 0, 100, 100] } } })).toEqual([expect.stringMatching(/^overrides\.slots\.picture: an added figure slot is named "fig:<x>"/)]);
    expect(problems({ slots: { "fig:a": { role: "note", box: [0, 0, 100, 100] } } })).toEqual([expect.stringMatching(/^overrides\.slots\.fig:a: an added note slot has a lower-case name/)]);
    expect(problems({ slots: { grid: { role: "table", box: [0, 0, 100, 100], tableStyle: "default" } } })).toEqual([expect.stringMatching(/^overrides\.slots\.grid: a table slot is named "table:<letter>"/)]);
  });
  it("checks an added slot's references and refinements like any slot", () => {
    expect(problems({ slots: { "table:a": { role: "table", box: [0, 0, 400, 200] } } })).toEqual([expect.stringMatching(/^overrides\.slots\.table:a\.tableStyle: is missing/)]);
    expect(problems({ slots: { "fig:a": { role: "figure", box: [0, 0, 100, 100], text: { size: 9 } } } })).toEqual(["overrides.slots.fig:a.text: only a text, shape or block slot takes text style fields; slot fig:a is a figure"]);
    expect(problems({ slots: { headline: { ...headline, below: { slot: "nothing" } } } })).toEqual([expect.stringMatching(/^overrides\.slots\.headline\.below\.slot: "nothing" is not a slot/)]);
  });
  it("lets the slide hold content for it, and reports content for a slot that is not there", () => {
    const props = { headline: "A claim", "fig:a": "plot.svg", overrides: { slots: { headline, "fig:a": { role: "figure", box: [60, 300, 400, 200] } } } };
    expect(slideContentWarnings(where, makeSlideSpec("blank", props), pack, AT)).toEqual([]);
    const orphan = slideContentWarnings(where, makeSlideSpec("blank", { headline: "A claim" }), pack, AT);
    expect(orphan.map((w) => w.code)).toEqual(["FOLIO-SPEC-001"]);
  });
  it("measures an added text slot with its role's style and warns past its lines", () => {
    const layout = slideLayout(pack, "blank", { overrides: { slots: { headline: { ...headline, lines: 1, text: { size: 40 } } } } })!;
    expect(textSlots(pack, layout).find((t) => t.name === "headline")!.style.size).toBe(40);
    expect(slideOverflowWarnings(where, pack, layout, [{ slot: "headline", lines: 2, overPt: 0 }], AT).map((w) => w.code)).toEqual(["FOLIO-OVF-001"]);
  });
  it("is carried into a new layout by promote, its text style named in the pack", () => {
    const props = { headline: "A claim", overrides: { slots: { headline: { ...headline, text: { size: 40 } } } } };
    const built = promoteOverrides(raw, pack, "blank", props, { as: "blank-headline" });
    if (!built.ok) throw new Error(built.problems.join("\n"));
    expect(built.edits.layout.value.slots).toEqual({ headline: { ...headline, style: "blank-headline-headline" } });
    expect(built.edits.layout.value.usage).toBeUndefined();
    expect(built.edits.roles["blank-headline-headline"]).toMatchObject({ ...pack.roles.title, size: 40 });
    const after = loadPack(applyPromoteEdits(raw, built.edits));
    expect(after.ok && after.pack.layouts["blank-headline"]!.slots.headline!.role).toBe("title");
  });
  it("is explained in the prompt with an example command", () => {
    expect(buildCatalog(pack).prompt()).toMatch(/Added slots: .*\n.*folio override <deck>\/s010 'slots\.headline=\{"role":"title","box":\[60,200,840,80\]\}'/);
  });
});
