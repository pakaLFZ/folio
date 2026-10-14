import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyPromoteEdits, backgroundOf, buildCatalog, promoteOverrides, promotedSlidePatch, clearOverride, deepMerge, editOverrides, formatOverrideProblem, loadPack, makeSlideSpec, overrideEntries, overridesPatch,
  overrideWriteProblem, requestedBackground, resolveOverrides, slideContentWarnings, slideLayout, slideOverflowWarnings, tableStyleOf, textSlots, type Pack,
} from "../src/index.js";

const AT = "2026-10-13T00:00:00.000Z";
const where = { deck: "d", slide: "s001" };
let rawPack: unknown;
const theme = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));

/** lectern's theme with one layout of our own: a title, a note, a table and a figure. */
function fixturePack(): Pack {
  const json = structuredClone(theme);
  json.tables.minimal = { size: 14, lineHeight: 1.2, cellPad: [3, 6, 3, 6], rule: { color: "#7F7F7F", width: 0.5, outer: false } };
  json.layouts = {
    plainly: {
      background: "plain",
      description: "A note beside a table.",
      slots: {
        title: { role: "title", box: [25, 20, 900, 30], lines: 1 },
        note: { role: "note", box: [25, 100, 400, 200] },
        "table:a": { role: "table", box: [450, 100, 480, 300], tableStyle: "default" },
        "fig:a": { role: "figure", box: [450, 420, 200, 100] },
      },
    },
  };
  rawPack = json;
  const r = loadPack(json);
  if (!r.ok) throw new Error(r.problems.join("\n"));
  return r.pack;
}
const pack = fixturePack();
const template = pack.layouts.plainly!;
const problems = (raw: unknown) => resolveOverrides(pack, "plainly", raw).problems.map(formatOverrideProblem);

describe("deep merge", () => {
  it("merges objects key by key and leaves the inputs unchanged", () => {
    const base = { a: 1, b: { c: 2, d: 3 } };
    expect(deepMerge(base, { b: { d: 4 } })).toEqual({ a: 1, b: { c: 2, d: 4 } });
    expect(base).toEqual({ a: 1, b: { c: 2, d: 3 } });
  });
  it("replaces arrays instead of concatenating them, and lets null replace", () => {
    expect(deepMerge({ box: [1, 2, 3, 4], tags: ["x"] }, { box: [5, 6, 7, 8], tags: ["y"] })).toEqual({ box: [5, 6, 7, 8], tags: ["y"] });
    expect(deepMerge({ below: { slot: "a", gap: 1 } }, { below: null })).toEqual({ below: null });
  });
  it("lays a slot override over the layout: the box replaced, the other fields kept", () => {
    const layout = slideLayout(pack, "plainly", { overrides: { slots: { note: { box: [25, 300, 400, 100], lines: 3 } } } })!;
    expect(layout.slots.note).toMatchObject({ role: "note", box: [25, 300, 400, 100], lines: 3 });
    expect(layout.slots.title).toEqual(template.slots.title);
  });
});

describe("refusals by path", () => {
  it("names a bad value inside a box", () => {
    expect(problems({ slots: { note: { box: [25, 100, -4, 100] } } })).toEqual([expect.stringMatching(/^overrides\.slots\.note\.box\.2: .*>0/)]);
  });
  it("names an unknown key and lists the template's own fields", () => {
    const [p] = problems({ slots: { note: { colour: "red" } } });
    expect(p).toMatch(/^overrides\.slots\.note: unknown key "colour"; an override uses the template's own fields \(known: role, box, .*text, table, block\)/);
  });
  it("names a slot the layout does not have, when it is not a full slot to add", () => {
    const why = '"notes" is not a slot of layout plainly (slots: title, note, table:a, fig:a); to add it as a new slot give its full definition, at least "role" and "box"';
    expect(problems({ slots: { notes: { lines: 2 } } })).toEqual([`overrides.slots.notes.role: ${why}`, `overrides.slots.notes.box: ${why}`]);
  });
  it("names an unknown background and an unknown table style with the known names", () => {
    expect(problems({ background: "navy" })).toEqual([expect.stringMatching(/^overrides\.background: "navy" is not one of the theme's backgrounds \(known: plain/)]);
    expect(problems({ slots: { "table:a": { tableStyle: "loud" } } })).toEqual([expect.stringMatching(/^overrides\.slots\.table:a\.tableStyle: "loud" is not one of the pack's table styles/)]);
  });
  it("refuses text style fields on a table and table fields on a text slot", () => {
    expect(problems({ slots: { "table:a": { text: { size: 20 } }, note: { table: { size: 9 } } } })).toEqual([
      "overrides.slots.table:a.text: only a text, shape or block slot takes text style fields; slot table:a is a table",
      "overrides.slots.note.table: only a table slot takes table style fields; slot note is a note",
    ]);
  });
  it("refuses a below that names no slot, as the pack would", () => {
    expect(problems({ slots: { note: { below: { slot: "fig:z" } } } })).toEqual([expect.stringMatching(/^overrides\.slots\.note\.below\.slot: "fig:z" is not a slot of this layout/)]);
  });
  it("applies nothing of an invalid set, and reports each problem as a spec warning at its JSON path", () => {
    const props = { note: "x", overrides: { background: "black", slots: { note: { box: [0, 0, 0, 1] } } } };
    expect(slideLayout(pack, "plainly", props)).toBe(template);
    expect(requestedBackground(pack, "plainly", props)).toBeNull();
    const warnings = slideContentWarnings(where, makeSlideSpec("plainly", props), pack, AT);
    expect(warnings.map((w) => [w.code, w.args.jsonPath])).toEqual([["FOLIO-SPEC-001", "/elements/s/props/overrides/slots/note/box/2"]]);
  });
  it("accepts a valid set with no warning", () => {
    const props = { overrides: { background: "black", slots: { note: { box: [25, 100, 400, 60], text: { size: 20 } }, "table:a": { table: { rule: { width: 2 } } } } } };
    expect(problems(props.overrides)).toEqual([]);
    expect(slideContentWarnings(where, makeSlideSpec("plainly", props), pack, AT)).toEqual([]);
  });
});

describe("precedence", () => {
  it("an override background wins over the slide's background prop and the layout's", () => {
    const props = { background: "smoke", overrides: { background: "black" } };
    const layout = slideLayout(pack, "plainly", props)!;
    expect(backgroundOf(pack, layout, requestedBackground(pack, "plainly", props)).name).toBe("black");
    expect(backgroundOf(pack, slideLayout(pack, "plainly", { background: "smoke" })!, requestedBackground(pack, "plainly", { background: "smoke" })).name).toBe("smoke");
  });
  it("a table override is laid over the named style, whichever the slide picks", () => {
    const layout = slideLayout(pack, "plainly", { overrides: { slots: { "table:a": { table: { headerFill: "#003d7c", rule: { width: 2 } } } } } })!;
    const slot = layout.slots["table:a"]!;
    const plain = tableStyleOf(pack, slot, null).style;
    expect(plain).toMatchObject({ headerFill: "#003d7c", rule: { ...pack.tables.default!.rule, width: 2 } });
    expect(tableStyleOf(pack, slot, { columns: ["a"], rows: [], tableStyle: "minimal" }).style).toMatchObject({ ...pack.tables.minimal, headerFill: "#003d7c", rule: { ...pack.tables.minimal!.rule, width: 2 } });
  });
  it("a text override is laid over the role style", () => {
    const layout = slideLayout(pack, "plainly", { overrides: { slots: { note: { text: { size: 30, color: "#7a0019" } } } } })!;
    const note = textSlots(pack, layout).find((t) => t.name === "note")!;
    expect(note.style).toMatchObject({ ...pack.roles.note, size: 30, color: "#7a0019" });
  });
});

describe("overflow with an overridden box", () => {
  it("takes the line limit from the overridden box, so the same text warns", () => {
    const pitch = pack.roles.note!.size * pack.roles.note!.lineHeight;
    const measured = [{ slot: "note", lines: 4, overPt: 0 }];
    expect(slideOverflowWarnings(where, pack, template, measured, AT)).toEqual([]);
    const small = slideLayout(pack, "plainly", { overrides: { slots: { note: { box: [25, 100, 400, pitch * 2] } } } })!;
    expect(slideOverflowWarnings(where, pack, small, measured, AT).map((w) => [w.code, w.args.limit])).toEqual([["FOLIO-OVF-001", 2]]);
  });
});

describe("override paths", () => {
  const overrides = { background: "black", slots: { note: { box: [1, 2, 3, 4], text: { size: 20 } }, "table:a": { table: { rule: { width: 2 } } } } };
  it("lists every leaf by dotted path, arrays as one value", () => {
    expect(overrideEntries(overrides)).toEqual([
      { path: "background", value: "black" },
      { path: "slots.note.box", value: [1, 2, 3, 4] },
      { path: "slots.note.text.size", value: 20 },
      { path: "slots.table:a.table.rule.width", value: 2 },
    ]);
  });
  it("clears a path and removes objects left empty", () => {
    expect(clearOverride(overrides, "slots.table:a.table.rule.width")).toEqual({ background: "black", slots: { note: overrides.slots.note } });
    expect(editOverrides(overrides, { clearAll: true, set: { "slots.note.lines": 2 } })).toEqual({ slots: { note: { lines: 2 } } });
  });
  it("stores as one add, and removes the prop when nothing is left", () => {
    const spec = makeSlideSpec("plainly", { overrides });
    expect(overridesPatch(spec, {})).toEqual([{ op: "remove", path: "/elements/s/props/overrides" }]);
    expect(overridesPatch(makeSlideSpec("plainly", {}), {})).toEqual([]);
    expect(overridesPatch(spec, { background: "plain" })).toEqual([{ op: "add", path: "/elements/s/props/overrides", value: { background: "plain" } }]);
  });
  it("refuses a write that makes the overrides invalid, and not one that leaves them as they were", () => {
    const before = makeSlideSpec("plainly", { overrides: { slots: { note: { box: [0, 0, 0, 1] } } } });
    expect(overrideWriteProblem(pack, makeSlideSpec("plainly", {}), before)).toMatch(/^overrides\.slots\.note\.box\.2: /);
    expect(overrideWriteProblem(pack, before, makeSlideSpec("plainly", { note: "x", overrides: { slots: { note: { box: [0, 0, 0, 1] } } } }))).toBeNull();
  });
});

describe("prompt", () => {
  it("tells agents overrides exist, win over the template, and should be rare", () => {
    const prompt = buildCatalog(pack).prompt();
    expect(prompt).toMatch(/Overrides: .* an override wins over the template/);
    expect(prompt).toMatch(/Prefer the template: override only when a slide truly needs a change/);
  });
});

describe("promote", () => {
  const props = { "table:a": { columns: ["a"], rows: [] }, overrides: { slots: { "table:a": { box: [450, 90, 480, 200], table: { headerFill: "#003d7c" } } } } };
  it("bakes a table override into a new named table style the slot names, so the pack stays valid", () => {
    const built = promoteOverrides(rawPack, pack, "plainly", props, { as: "plainly-blue" });
    if (!built.ok) throw new Error(built.problems.join("\n"));
    expect(built.edits.tables["plainly-blue-table-a"]).toMatchObject({ ...pack.tables.default, headerFill: "#003d7c" });
    expect(built.edits.layout.value.slots).toMatchObject({ "table:a": { box: [450, 90, 480, 200], tableStyle: "plainly-blue-table-a" } });
    expect(loadPack(applyPromoteEdits(rawPack, built.edits)).ok).toBe(true);
  });
  it("refuses to apply a table override when the slide's value picks its own style, and to apply nothing", () => {
    const picked = { ...props, "table:a": { columns: ["a"], rows: [], tableStyle: "minimal" } };
    expect(promoteOverrides(rawPack, pack, "plainly", picked, { into: true })).toEqual({ ok: false, problems: [expect.stringMatching(/^overrides\.slots\.table:a\.table: the slide's value of table:a picks its own tableStyle/)] });
    expect(promoteOverrides(rawPack, pack, "plainly", {}, { into: true })).toEqual({ ok: false, problems: ["the slide has no overrides: there is nothing to apply to its layout"] });
  });
  it("moves the slide onto the new layout with its overrides and background prop gone", () => {
    const spec = makeSlideSpec("plainly", { background: "smoke", overrides: { background: "black" } });
    expect(promotedSlidePatch(spec, "plainly-dark")).toEqual([
      { op: "remove", path: "/elements/s/props/overrides" },
      { op: "remove", path: "/elements/s/props/background" },
      { op: "replace", path: "/elements/s/type", value: "plainly-dark" },
    ]);
  });
});
