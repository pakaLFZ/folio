import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { loadPackDir } from "@folio/server";
import { importPptx } from "../src/pptx/importpptx.js";
import { writePptx } from "../src/pptx/write.js";
import { fileURLToPath } from "node:url";

const fixture = fileURLToPath(new URL("./fixtures/fixture.pptx", import.meta.url));
const lecternDir = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));
const templates = () => mkdtempSync(join(tmpdir(), "folio-import-"));
const packOf = (dir: string) => JSON.parse(readFileSync(join(dir, "pack.json"), "utf8"));

describe("folio pack import <file.pptx>", () => {
  const dir = templates();
  const result = importPptx(fixture, "fx", dir, true);
  const pack = packOf(result.dir);
  const report = readFileSync(join(result.dir, "import-report.md"), "utf8");

  it("writes a draft that passes folio pack check", () => {
    expect(result.ok).toBe(true);
    expect(loadPackDir(result.dir).ok).toBe(true);
    expect(pack).toMatchObject({ name: "fx", version: 1, canvas: { w: 960, h: 540, unit: "pt" }, fontFallback: "Calibri, sans-serif" });
  });

  it("reads each master layout's placeholders as slots with roles, boxes and styles", () => {
    expect(Object.keys(pack.layouts)).toEqual(expect.arrayContaining(["title-slide", "title-and-content", "title-only", "picture-with-caption", "blank"]));
    expect(pack.layouts["title-only"].slots.title).toEqual({ role: "title", box: [43.2, 25.2, 633.6, 82.8] });
    expect(pack.layouts["picture-with-caption"].slots["fig:a"].role).toBe("figure");
    expect(pack.roles.title).toMatchObject({ size: 44, align: "center", anchor: "middle" });
  });

  it("folds a variant layout into a background and keeps logos and the wordmark as decorations", () => {
    expect(pack.layouts["title-only-black"]).toBeUndefined();
    expect(pack.backgrounds).toEqual({ plain: { fill: "#FFFFFF", ink: "#000000" }, black: { fill: "#000000", ink: "#FFFFFF" } });
    expect(pack.layouts["title-slide"].decorations).toEqual([{ text: "ACME LAB", style: "wordmark", box: [20, 20, 300, 40] }, { image: "images/logo.png", box: [880, 20, 60, 30] }]);
    expect(pack.roles.wordmark).toMatchObject({ font: "Roboto", size: 32, weight: 700 });
  });

  it("reads the table style and proposes one layout for the two slides of the same structure", () => {
    expect(pack.tables.default).toMatchObject({ size: 12, headerFill: "#000000", headerInk: "#FFFFFF", headerWeight: 700, rule: { outer: true, rows: true, columns: false, width: 1 } });
    const proposal = pack.layouts["title-only-s1"];
    expect(proposal.description).toContain("slide 1, 2");
    expect(Object.fromEntries(Object.entries<any>(proposal.slots).map(([k, v]) => [k, v.role]))).toEqual({ title: "title", "label:a": "label", note: "note", caption: "caption", "fig:a": "figure", "table:a": "table" });
    expect(proposal.slots.title.box).toEqual([37.2, 23.6, 885.6, 32.8]);
    expect(proposal.slots.note.below).toEqual({ slot: "table:a", gap: 37 });
    expect(proposal.slots["table:a"]).toMatchObject({ tableStyle: "default", box: [490, 103, 440, 260] });
  });

  it("reports every guess with the command that settles it", () => {
    expect(report).toMatch(/text box "TextBox 7" .* is a guessed note: several lines of small text; if wrong: folio pack edit fx set layouts\.title-only-s1\.slots/);
    expect(report).toContain("Carlito (SIL OFL 1.1, metric-compatible with Calibri)");
    expect(report).toMatch(/footer, date and slide-number placeholders are left out/);
    expect(report).toContain("title-only-s1: from slides 1, 2");
    expect(report).toContain("folio pack edit fx layout rename title-only-s1 <name>");
  });

  it("never overwrites a pack, and names the fix", () => {
    expect(() => importPptx(fixture, "fx", dir, false)).toThrow(/already exists; import under another name with --name <new>, then copy layouts in with folio pack merge <new> fx/);
    expect(() => importPptx(fixture, "Bad Name", dir, false)).toThrow(/not a pack name.*--name bad-name/);
    expect(() => importPptx(fixture, undefined, dir, false)).toThrow(/--name/);
    const notPptx = join(dir, "notes.pptx");
    writeFileSync(notPptx, "plain text");
    expect(() => importPptx(notPptx, "notes", dir, false)).toThrow(/not a pptx/);
  });
});

describe("folio pack export --pptx", () => {
  /** Export a pack folder as a pptx, import it back, and return both packs. */
  const roundTrip = (source: string) => {
    const loaded = loadPackDir(source);
    if (!loaded.ok) throw new Error(loaded.problems.join("; "));
    const dir = templates();
    const file = join(dir, "out.pptx");
    writeFileSync(file, writePptx(loaded.loaded.pack, source));
    return { before: packOf(source), after: packOf(importPptx(file, "back", dir, false).dir) };
  };

  it("imports back to the same layouts, slot boxes and roles, backgrounds and table style (lectern)", () => {
    const { before, after } = roundTrip(lecternDir);
    expect(Object.keys(after.layouts)).toEqual(Object.keys(before.layouts));
    for (const [name, layout] of Object.entries<any>(before.layouts)) {
      expect(Object.keys(after.layouts[name].slots).sort()).toEqual(Object.keys(layout.slots).sort());
      for (const [slot, value] of Object.entries<any>(layout.slots)) expect([name, slot, after.layouts[name].slots[slot].role, after.layouts[name].slots[slot].box]).toEqual([name, slot, value.role, value.box]);
      expect(after.layouts[name].background).toBe(layout.background);
    }
    expect(after.backgrounds).toEqual(before.backgrounds);
    expect(after.tables.default).toMatchObject({ headerFill: "#EFEDE7", headerInk: "#17191C", size: 14, rule: before.tables.default.rule });
    expect(after.layouts.title.decorations).toHaveLength(before.layouts.title.decorations.length);
  }, 30_000); // zips and unzips the pack's fonts: about 2 s alone, past the 5 s default under a full parallel run
});
