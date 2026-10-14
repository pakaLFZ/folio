import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadPack, makeSlideSpec, namesRemoved, nextVersion, slideBreaks, type Pack } from "../src/index.js";

const raw = () => JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));
const pack = (edit: (json: any) => void = () => {}): Pack => {
  const json = raw();
  edit(json);
  const result = loadPack(json);
  if (!result.ok) throw new Error(result.problems.join("; "));
  return result.pack;
};
const hooks = ["line-plot", "chem-subscripts"];
const slide = (layout: string, props: Record<string, unknown>) => ({ deck: "decks/talk", slide: "s001", spec: makeSlideSpec(layout, props) });

describe("the version rule", () => {
  const before = pack();
  it("keeps the version when a layout is added or a value changes", () => {
    const after = pack((j) => {
      j.layouts["note-figure-2"] = j.layouts["note-figure"];
      j.layouts.title.slots.title.box = [20, 300, 700, 200];
      j.roles.note.size = 15;
      j.backgrounds.navy = { fill: "#000080", ink: "#FFFFFF" };
    });
    expect(namesRemoved(before, after, hooks, hooks)).toEqual([]);
    expect(nextVersion(before, after, hooks, hooks)).toBe(2);
  });
  it("bumps it when a layout is removed or renamed", () => {
    const removed = pack((j) => delete j.layouts.blank);
    expect(namesRemoved(before, removed, hooks, hooks)).toEqual(["layout:blank"]);
    expect(nextVersion(before, removed, hooks, hooks)).toBe(3);
    const renamed = pack((j) => {
      j.layouts.empty = j.layouts.blank;
      delete j.layouts.blank;
    });
    expect(nextVersion(before, renamed, hooks, hooks)).toBe(3);
  });
  it("bumps it when a slot changes role, or a background, table style or hook goes", () => {
    expect(namesRemoved(before, pack((j) => (j.layouts["note-figure"].slots.note.role = "body")), hooks, hooks)).toEqual(["slot:note-figure/note=note"]);
    expect(namesRemoved(before, pack((j) => delete j.backgrounds.khaki), hooks, hooks)).toEqual(["background:khaki"]);
    const noTables = pack((j) => {
      j.tables.plain = j.tables.default;
      for (const l of Object.values<any>(j.layouts)) for (const s of Object.values<any>(l.slots)) if (s.tableStyle) s.tableStyle = "plain";
      delete j.tables.default;
    });
    expect(namesRemoved(before, noTables, hooks, hooks)).toEqual(["table style:default"]);
    expect(namesRemoved(before, before, hooks, ["line-plot"])).toEqual(["hook:chem-subscripts"]);
  });
});

describe("slides that would stop rendering", () => {
  const before = pack();
  const figure = slide("note-figure", { title: "A", note: "Some text", "fig:a": "a.png" });
  it("names the deck and slide whose layout is removed", () => {
    const after = pack((j) => delete j.layouts["note-figure"]);
    const breaks = slideBreaks(before, after, [figure], hooks, hooks);
    expect(breaks).toHaveLength(1);
    expect(breaks[0]).toMatchObject({ deck: "decks/talk", slide: "s001" });
    expect(breaks[0]!.reason).toContain("note-figure");
  });
  it("finds nothing when an unused layout goes or a box moves", () => {
    const after = pack((j) => {
      delete j.layouts.blank;
      j.layouts["note-figure"].slots.note.box = [30, 110, 430, 390];
    });
    expect(slideBreaks(before, after, [figure], hooks, hooks)).toEqual([]);
  });
  it("finds a filled slot that changes kind, a background and a hook the slide names", () => {
    expect(slideBreaks(before, pack((j) => (j.layouts["note-figure"].slots["fig:a"].role = "caption")), [figure], hooks, hooks)).toHaveLength(1);
    const black = slide("note-figure", { title: "A", background: "khaki" });
    expect(slideBreaks(before, pack((j) => delete j.backgrounds.khaki), [black], hooks, hooks)).toHaveLength(1);
    const plotted = slide("note-figure", { "fig:a": { hook: "line-plot", inputs: {} } });
    expect(slideBreaks(before, before, [plotted], hooks, ["chem-subscripts"])[0]!.reason).toContain("line-plot");
  });
  it("does not count a problem the slide already had", () => {
    const broken = slide("no-such-layout", { title: "A" });
    expect(slideBreaks(before, pack((j) => delete j.layouts.blank), [broken], hooks, hooks)).toEqual([]);
  });
});
