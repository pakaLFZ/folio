import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { draftsOf, formatOverrideProblem, loadPack, makeSlideSpec, promoteOverrides, resolveOverrides, slideContentWarnings, type Pack } from "../src/index.js";

const raw = JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8"));
const loaded = loadPack(raw);
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack: Pack = loaded.pack;
const arrow = { role: "shape", box: [500, 300, 100, 100], draft: true };
const props = { overrides: { slots: { "shape:a": arrow, "text:a": { role: "body", box: [100, 250, 200, 70], draft: true }, "shape:b": { role: "shape", box: [10, 10, 50, 50] } } }, "shape:a": { kind: "arrow", from: [100, 0], to: [0, 100] }, "text:a": "Move this up", "shape:b": { kind: "rect" } };

describe("drafts", () => {
  it("an added slot takes draft; a layout slot refuses it by path", () => {
    expect(resolveOverrides(pack, "blank", props.overrides).problems).toEqual([]);
    const title = Object.keys(pack.layouts["note-figure"]!.slots)[0]!;
    expect(resolveOverrides(pack, "note-figure", { slots: { [title]: { draft: true } } }).problems.map(formatOverrideProblem)).toEqual([`overrides.slots.${title}.draft: only an added slot can be a draft; ${title} is a slot of layout note-figure`]);
  });
  it("describes each draft with the command that draws it for real and the one that removes it", () => {
    const drafts = draftsOf(pack, makeSlideSpec("blank", props), "<deck>/s006");
    expect(drafts.map((d) => d.slot)).toEqual(["shape:a", "text:a"]);
    expect(drafts[0]).toEqual({ slot: "shape:a", what: "a draft arrow from (600, 300) to (500, 400)", add: "folio shape add <deck>/s006 arrow --from 600,300 --to 500,400", rm: "folio shape rm <deck>/s006 shape:a" });
    expect(drafts[1]!.what).toBe('a draft text box at [100, 250, 200, 70] reading "Move this up"');
    expect(drafts[1]!.rm).toBe("folio text rm <deck>/s006 text:a");
  });
  it("folio check lists each draft as FOLIO-DRF-001, and a final shape not at all", () => {
    const notes = slideContentWarnings({ deck: "d", slide: "s006" }, makeSlideSpec("blank", props), pack, "2026-10-13T00:00:00.000Z").filter((w) => w.code === "FOLIO-DRF-001");
    expect(notes.map((w) => w.location.slot)).toEqual(["shape:a", "text:a"]);
    expect(notes[0]!.severity).toBe("note");
    expect(notes[0]!.message).toMatch(/a draft arrow from \(600, 300\) to \(500, 400\), drawn by the user.*folio shape add <deck>\/s006 arrow --from 600,300 --to 500,400.*folio shape rm <deck>\/s006 shape:a/);
  });
  it("describes a draft block with folio block add and rm", () => {
    const spec = makeSlideSpec("blank", { overrides: { slots: { "block:a": { role: "block", style: "callout", box: [40, 60, 300, 80], draft: true } } }, "block:a": "Check this" });
    const [d] = draftsOf(pack, spec, "<deck>/s002");
    expect(d).toEqual({ slot: "block:a", what: 'a draft callout block at [40, 60, 300, 80] reading "Check this"', add: 'folio block add <deck>/s002 --style callout --box 40,60,300,80 --text "Check this"', rm: "folio block rm <deck>/s002 block:a" });
  });
  it("a slide with drafts is not promoted into a template", () => {
    const result = promoteOverrides(raw, pack, "blank", props, { as: "with-sketch" });
    expect(result.ok ? [] : result.problems).toEqual(["the slide has drafts (shape:a, text:a): a template holds no sketches; draw them for real or remove them first"]);
  });
});
