import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadHookDef, loadPack, makeSlideSpec, overflowWarnings, slideContentWarnings, slideWriteProblems, slideWriteRefusal, validateHookInputs, type HookInputs } from "../src/index.js";

const read = (path: string) => JSON.parse(readFileSync(new URL(`../../../templates/lectern/${path}`, import.meta.url), "utf8"));
const loaded = loadPack(read("pack.json"));
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack = loaded.pack;
const linePlot = loadHookDef(read("hooks/line-plot/hook.json"));
if (!linePlot.ok) throw new Error(linePlot.problems.join("\n"));
const hooks: HookInputs = { "line-plot": linePlot.hook, "chem-subscripts": { name: "chem-subscripts", inputs: {}, output: "text" } };
const slide = (props: Record<string, unknown>) => makeSlideSpec("plot-table", props);
const lines = (props: Record<string, unknown>) => slideWriteProblems(slide(props), pack, hooks).map((p) => `${p.jsonPath}: ${p.reason}`);

describe("slide write problems", () => {
  it("refuses bad list indentation and title lists with a repair", () => {
    expect(lines({ caption: "- okay\n - wrong" })).toContain('/elements/s/props/caption: line 2: list indentation must be 0, 2, or 4 spaces (levels 1–3); repair the leading spaces');
    expect(lines({ title: "- heading" })).toContain('/elements/s/props/title: lists are not allowed in title slots; remove the list marker');
  });
  it("lists the layout's slots for an unknown prop", () => {
    expect(lines({ foo: "bar" })).toEqual([
      '/elements/s/props/foo: "foo" is not a slot of layout plot-table; its slots: title, subtitle, label:a, fig:a, table-label:b, table:b, note, set-id, caption; also background, overrides',
    ]);
  });
  it("says how many cells a table row needs", () => {
    expect(lines({ "table:b": { columns: ["a"], rows: [["1", "2"]] } })).toEqual(['/elements/s/props/table:b/rows/0: row 1 has 2 cells; the table has 1 columns ("a"), so every row has 1 cells']);
  });
  it("names a wrong slot value's shape with an example, and hook show for a hooked figure", () => {
    const [text] = lines({ title: 3 });
    expect(text).toMatch(/^\/elements\/s\/props\/title: .*expected string.*; title is a title slot: text or null, e.g. "Results"$/);
    const [figure] = lines({ "fig:a": 3 });
    expect(figure).toContain('fig:a is a figure slot: a file path relative to the deck');
  });
  it("lists a hook's allowed inputs for an unknown key, with folio hook show", () => {
    const call = { hook: "line-plot", inputs: { series: [{ name: "x", x: [1, 2], y: [1, 2] }], colour: "red" } };
    expect(lines({ "fig:a": call })).toEqual([
      '/elements/s/props/fig:a/inputs/colour: "colour" is not an input of this hook; allowed: title, x_label, y_label, series, y_zero, style; folio hook show lectern/line-plot prints an example',
    ]);
  });
  it("lists the figure hooks for an unknown or non-figure hook", () => {
    expect(lines({ "fig:a": { hook: "nope", inputs: {} } })).toEqual(['/elements/s/props/fig:a/hook: hook "nope" is not in pack lectern; figure hooks: line-plot (folio hook list)']);
    expect(lines({ "fig:a": { hook: "chem-subscripts", inputs: {} } })[0]).toContain('hook "chem-subscripts" makes text, not a figure');
  });
  it("names an unknown layout with the pack's layouts", () => {
    expect(slideWriteProblems(makeSlideSpec("nope", {}), pack, hooks)[0]!.reason).toMatch(/^layout "nope" is not in pack lectern; layouts: title, /);
  });
});

describe("slide write refusal", () => {
  it("refuses only the problems a write adds", () => {
    const broken = slide({ foo: "bar" });
    expect(slideWriteRefusal(pack, hooks, null, slide({ title: "A" }))).toBeNull();
    expect(slideWriteRefusal(pack, hooks, slide({}), broken)).toMatch(/^\/elements\/s\/props\/foo: /);
    expect(slideWriteRefusal(pack, hooks, broken, slide({ foo: "bar", title: "A" }))).toBeNull();
    expect(slideWriteRefusal(pack, hooks, broken, slide({ foo: "bar", baz: 1 }))).toMatch(/^\/elements\/s\/props\/baz: /);
  });
  it("accepts a prop for a slot the slide's overrides add, and lists that slot for a misspelt one", () => {
    const overrides = { slots: { "note:extra": { role: "note", box: [25, 400, 300, 40] } } };
    expect(slideWriteRefusal(pack, hooks, null, slide({ overrides, "note:extra": "Added by the slide" }))).toBeNull();
    const refused = slideWriteRefusal(pack, hooks, null, slide({ overrides, "note:extar": "typo" }));
    expect(refused).toMatch(/^\/elements\/s\/props\/note:extar: "note:extar" is not a slot of layout plot-table; its slots: .*, caption, note:extra; also background, overrides$/);
  });
  it("puts each problem on its own line", () => {
    expect(slideWriteRefusal(pack, hooks, null, slide({ foo: 1, bar: 2 }))!.split("\n")).toHaveLength(2);
  });
});

describe("the same wording in folio check", () => {
  it("reports FOLIO-SPEC-001 with the allowed slots", () => {
    const [w] = slideContentWarnings({ deck: "d", slide: "s001" }, slide({ foo: "bar" }), pack, "");
    expect(w!.message).toContain('"foo" is not a slot of layout plot-table; its slots: title,');
  });
  it("words hook inputs by what is allowed", () => {
    const schema = read("hooks/line-plot/hook.json").inputs;
    expect(validateHookInputs(schema, {})).toEqual([{ jsonPath: "/series", reason: '"series" is required, e.g. [{"name":"","x":[0,1],"y":[0,1]}]' }]);
    expect(validateHookInputs(schema, { series: [{ name: "a", x: [1], y: [1, 2] }] })[0]).toEqual({ jsonPath: "/series/0/x", reason: "must NOT have fewer than 2 items, e.g. [0,1]" });
    expect(validateHookInputs(schema, { series: [], style: "fancy" }).map((i) => i.reason)).toContain('must be one of "research", "plain"');
    expect(validateHookInputs(schema, { series: [{ name: "a", x: [1, 2], y: [1, 2], w: 1 }] })[0]!.reason).toBe('"w" is not a key here; allowed: name, x, y, accent, markers');
  });
  it("quotes where an overflowing slot wrapped", () => {
    const limits = [{ slot: "title", limit: 2, size: 64, wrap: true }];
    const [w] = overflowWarnings({ deck: "d", slide: "s" }, [{ slot: "title", lines: 3, overPt: 0, lineTexts: ["AGENTS WRITE THE", "DECK", "(AGENT-WRITTEN SLIDES)"] }], limits, "");
    expect(w!.message).toBe('Slot title holds 3 lines at 64 pt; limit is 2. It wraps as: "AGENTS WRITE THE" / "DECK" / "(AGENT-WRITTEN SLIDES)".');
    const long = overflowWarnings({ deck: "d", slide: "s" }, [{ slot: "title", lines: 8, overPt: 0, lineTexts: ["a", "b", "c", "d", "e", "f", "g", "h"] }], limits, "");
    expect(long[0]!.message).toBe('Slot title holds 8 lines at 64 pt; limit is 2. It ends: "b" / "c" / "d" / "e" / "f" / "g" / "h".');
  });
});
