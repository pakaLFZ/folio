import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  backgroundOf, buildCatalog, columnAlign, flowBoxes, layoutPropsSchema, loadPack, makeSlideSpec, slideContentWarnings, slideOverflowWarnings,
  tableHeight, tableRowHeight, tableRowsThatFit, tableStyleOf, type Pack,
} from "../src/index.js";

const AT = "2026-10-13T00:00:00.000Z";
const where = { deck: "d", slide: "s001" };
const lectern = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));

/** lectern with a second table style and one extra layout: a table, a note below it, a figure at the side. */
function fixtureJson() {
  const json = structuredClone(lectern);
  json.tables.minimal = { description: "No fills: a bold header and thin rules between rows.", size: 14, lineHeight: 1.2, align: "left", header: true, headerWeight: 700, cellPad: [3.6, 7.2, 3.6, 7.2], rule: { color: "#7F7F7F", width: 0.5, outer: false, rows: true, columns: false } };
  json.layouts["table-note"] = {
    background: "smoke",
    description: "A table with a note under it.",
    slots: {
      title: { role: "title", box: [25, 20, 900, 30], lines: 1 },
      "table:a": { role: "table", box: [25, 100, 500, 300], tableStyle: "default" },
      note: { role: "note", box: [25, 100, 500, 400], below: { slot: "table:a", gap: 12 } },
      "fig:a": { role: "figure", box: [550, 100, 380, 300] },
    },
  };
  return json;
}
const load = (json: unknown): Pack => {
  const r = loadPack(json);
  if (!r.ok) throw new Error(r.problems.join("\n"));
  return r.pack;
};
const problemsOf = (edit: (json: ReturnType<typeof fixtureJson>) => void) => {
  const json = fixtureJson();
  edit(json);
  const r = loadPack(json);
  return r.ok ? [] : r.problems;
};
const pack = load(fixtureJson());
const layout = pack.layouts["table-note"]!;
const style = pack.tables.default!;

describe("layout backgrounds", () => {
  it("refuses a pack that still carries defaultBackground, saying to move it onto each layout", () => {
    expect(problemsOf((j) => (j.defaultBackground = "plain"))).toEqual(['defaultBackground: is no longer read: there is no pack-wide background. Remove it and give every layout "background": "<name>"']);
  });
  it("refuses a layout without a background, naming the layout and the known names", () => {
    expect(problemsOf((j) => delete j.layouts.title.background)).toEqual([
      `layouts.title.background: is missing; every layout names its background: add "background": "<name>" with one of the theme's backgrounds (known: plain, smoke, khaki, black)`,
    ]);
  });
  it("refuses an unknown background name", () => {
    expect(problemsOf((j) => (j.layouts.title.background = "navy"))).toEqual([`layouts.title.background: "navy" is not one of the theme's backgrounds (known: plain, smoke, khaki, black)`]);
  });
  it("takes the slide's own background over the layout's, and nothing else", () => {
    expect(backgroundOf(pack, layout, null).name).toBe("smoke");
    expect(backgroundOf(pack, layout, "nope").name).toBe("smoke");
    const black = backgroundOf(pack, layout, "black");
    expect([black.name, black.ink]).toEqual(["black", "#FFFFFF"]);
    expect(backgroundOf(pack, pack.layouts.title!, undefined).name).toBe("plain");
  });
});

describe("table slots at pack load", () => {
  it("refuses a table slot without a style, or with an unknown one, naming the known styles", () => {
    expect(problemsOf((j) => delete j.layouts["table-note"].slots["table:a"].tableStyle)).toEqual([
      "layouts.table-note.slots.table:a.tableStyle: is missing; a table slot names one of the pack's table styles (known: default, minimal)",
    ]);
    expect(problemsOf((j) => (j.layouts["table-note"].slots["table:a"].tableStyle = "fancy"))).toEqual([
      `layouts.table-note.slots.table:a.tableStyle: "fancy" is not one of the pack's table styles (known: default, minimal)`,
    ]);
  });
  it("says to add tables when the pack has none", () => {
    expect(problemsOf((j) => delete j.tables)[0]).toMatch(/the pack declares no table styles; add "tables"/);
  });
  it("refuses a table style on a slot that is not a table, and a table slot not named table:<letter>", () => {
    expect(problemsOf((j) => (j.layouts["table-note"].slots.note.tableStyle = "default"))).toEqual([
      'layouts.table-note.slots.note.tableStyle: only a table slot names a table style; remove it or make the role "table"',
    ]);
    expect(problemsOf((j) => (j.layouts.title.slots.grid = { role: "table", box: [0, 0, 10, 10], tableStyle: "default" }))).toEqual([
      'layouts.title.slots.grid: a table slot is named "table:<letter>", like "table:a"; rename the slot',
    ]);
  });
  it("refuses a below that names no slot of the layout, and a cycle", () => {
    expect(problemsOf((j) => (j.layouts["table-note"].slots.note.below.slot = "table:z"))).toEqual([
      'layouts.table-note.slots.note.below.slot: "table:z" is not a slot of this layout (slots: title, table:a, note, fig:a)',
    ]);
    const cycle = problemsOf((j) => (j.layouts["table-note"].slots["table:a"].below = { slot: "note", gap: 0 }));
    expect(cycle).toContain("layouts.table-note.slots.table:a.below.slot: the slots table:a -> note -> table:a sit below each other in a cycle; one of them must keep its own top");
    expect(cycle).toHaveLength(2);
    expect(problemsOf((j) => (j.layouts["table-note"].slots.note.below = { slot: "note", gap: 0 }))[0]).toMatch(/note -> note sit below each other in a cycle/);
  });
});

describe("table height", () => {
  it("is the header plus one line per row", () => {
    expect(tableRowHeight(style)).toBeCloseTo(14 * 1.25 + 9);
    expect(tableHeight(style, 3)).toBeCloseTo(4 * 26.5);
    expect(tableHeight({ ...style, header: false }, 3)).toBeCloseTo(3 * 26.5);
  });
  it("counts the rows that fit a box", () => {
    expect(tableRowsThatFit(style, 300)).toBe(10);
    expect(tableRowsThatFit(style, 26.5)).toBe(0);
    expect(tableRowsThatFit({ ...style, header: false }, 53)).toBe(2);
  });
  it("aligns per column when the style gives an array", () => {
    const perColumn = { ...style, align: ["left", "right"] as ("left" | "right")[] };
    expect([0, 1, 2].map((i) => columnAlign(perColumn, i))).toEqual(["left", "right", "left"]);
    expect(columnAlign(style, 5)).toBe("left");
  });
});

describe("table values on a slide", () => {
  const check = (value: unknown) => slideContentWarnings(where, makeSlideSpec("table-note", { "table:a": value }), pack, AT);
  it("accepts rows inline or a .table.json file", () => {
    expect(check({ columns: ["a", "b"], rows: [["1", "2"]] })).toEqual([]);
    expect(check({ src: "results.table.json", tableStyle: "minimal" })).toEqual([]);
  });
  it("names a row of the wrong length, a bad file name and an unknown style", () => {
    expect(check({ columns: ["a", "b"], rows: [["1"]] }).map((w) => w.args.reason).join()).toMatch(/row 1 has 1 cells; the table has 2 columns/);
    expect(check({ src: "results.json" }).map((w) => w.args.reason).join()).toMatch(/src must name a "<subject>\.table\.json" file/);
    expect(check({ columns: ["a"], rows: [], tableStyle: "fancy" }).map((w) => w.args.reason).join()).toMatch(/tableStyle "fancy" is not one of the pack's table styles \(known: default, minimal\)/);
  });
  it("takes the slide's tableStyle over the slot's", () => {
    const slot = layout.slots["table:a"]!;
    expect(tableStyleOf(pack, slot, null).name).toBe("default");
    expect(tableStyleOf(pack, slot, { columns: ["a"], rows: [], tableStyle: "minimal" }).name).toBe("minimal");
    expect(tableStyleOf(pack, slot, { src: "x.table.json", tableStyle: "fancy" }).name).toBe("default");
    expect(layoutPropsSchema(pack, layout).safeParse({ "table:a": { columns: ["a"], rows: [["x"]], color: "red" } }).success).toBe(false);
  });
});

describe("below flow", () => {
  it("puts the note under the table's rendered bottom plus the gap, its bottom fixed", () => {
    const boxes = flowBoxes(layout, { "table:a": 96 });
    expect(boxes.note).toEqual([25, 100 + 96 + 12, 500, 500 - 208]);
    expect(boxes["table:a"]).toEqual([25, 100, 500, 300]);
    expect(boxes["fig:a"]).toEqual([550, 100, 380, 300]);
  });
  it("moves the note down as rows are added", () => {
    const top = (rows: number) => flowBoxes(layout, { "table:a": tableHeight(style, rows) }).note![1];
    expect(top(4) - top(3)).toBeCloseTo(tableRowHeight(style));
  });
  it("uses the box bottom of a slot not yet measured, and follows chains", () => {
    expect(flowBoxes(layout, {}).note![1]).toBe(100 + 300 + 12);
    const chained = { ...layout, slots: { ...layout.slots, caption: { ...layout.slots.note!, box: [25, 0, 500, 520] as [number, number, number, number], below: { slot: "note", gap: 4 } } } };
    expect(flowBoxes(chained, { "table:a": 50, note: 34 }).caption).toEqual([25, 100 + 50 + 12 + 34 + 4, 500, 520 - 200]);
  });
  it("leaves a squeezed slot with zero height or less", () => {
    expect(flowBoxes(layout, { "table:a": 400 }).note![3]).toBe(500 - 512);
  });
});

describe("table and flow overflow", () => {
  const warn = (measured: Parameters<typeof slideOverflowWarnings>[3]) => slideOverflowWarnings(where, pack, layout, measured, AT);
  it("warns when the table is taller than its box", () => {
    const w = warn([{ slot: "table:a", lines: 0, overPt: 0, table: { heightPt: 312, rows: 12, wrapped: [] } }]);
    expect(w.map((x) => [x.code, x.message])).toEqual([["FOLIO-OVF-003", "Table table:a is 312 pt tall with 12 rows; its box holds 300 pt."]]);
    expect(warn([{ slot: "table:a", lines: 0, overPt: 0, table: { heightPt: 288, rows: 11, wrapped: [] } }])).toEqual([]);
  });
  it("warns once per wrapped cell, with a fingerprint per cell", () => {
    const w = warn([{ slot: "table:a", lines: 0, overPt: 0, table: { heightPt: 120, rows: 3, wrapped: [{ cell: "row 2, column 1", lines: 2 }, { cell: "header, column 2", lines: 3 }] } }]);
    expect(w.map((x) => x.message)).toEqual(["Table table:a: row 2, column 1 wraps onto 2 lines; every table row is one line.", "Table table:a: header, column 2 wraps onto 3 lines; every table row is one line."]);
    expect(new Set(w.map((x) => x.id)).size).toBe(2);
  });
  it("warns when a flowed slot is left with no height, and takes a flowed text's limit from its laid-out height", () => {
    expect(warn([{ slot: "note", lines: 0, overPt: 0, boxPt: -12 }]).map((x) => x.message)).toEqual(["Slot note sits below table:a and is left -12 pt tall."]);
    const pitch = 15 * 1.45;
    expect(warn([{ slot: "note", lines: 6, overPt: 0, boxPt: 5 * pitch }]).map((x) => x.code)).toEqual(["FOLIO-OVF-001"]);
    expect(warn([{ slot: "note", lines: 6, overPt: 0 }])).toEqual([]);
  });
});

describe("prompt", () => {
  it("describes a table slot and the note below it", () => {
    const prompt = buildCatalog(pack).prompt();
    expect(prompt).toContain('- `table:a` (table, 500 pt wide, at most 10 rows of one line at 14 pt under a header row, style default): {"columns": [...], "rows": [[...], ...]} with one string per cell, or {"src": "<subject>.table.json"} relative to the deck; "tableStyle" may pick "minimal"');
    expect(prompt).toMatch(/- `note` \(note, 15 pt, at most 18 lines, starts 12 pt below table:a, so it loses lines as that grows\)/);
  });
});
