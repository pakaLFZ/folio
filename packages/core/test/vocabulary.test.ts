import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  applyVocabOp, containsTerm, EMPTY_RESOLVED, foldEdit, loadPack, makeSlideSpec, neverTerms, newBankText, ownResolved, parseBank, renderBank, resolveBank,
  setFrontMatter, slideVocabWarnings, changedTexts, type Pack, type VocabEdit,
} from "../src/index.js";

const packSource = readFileSync(new URL("../../../templates/lectern/vocabulary.md", import.meta.url), "utf8");
const source = `# Vocabulary bank

The words this user wants on a slide.

## Words to use, and their replacements

| Use | Never | Since |
|---|---|---|
| the SC the H passes through | channel | 2026-10-07 |
| rotation (about an axis) | turn, turning, flip, sense | 2026-10-08 |
| opposite (rotation, direction) | counter, reverse | 2026-10-08 |
| with CO₂; with travelling CO₂ (moving guest) | loaded, laden | 2026-10-09 |
| 1 CO₂ (a count of one) | single CO₂, one CO₂ | 2026-10-12, user: "try to consistently use 1 co2" |
| the narrow site | pocket | 2026-10-10, user: "consider change pocket to cavity" |

## Phrasing

- A title names the page's subject.

## Abstract structure

> For one step, every guest moves at once, then the next step begins.

## Content

- A page holding one item centres it.

## Status (log of the user's edits)

- 2026-10-10, slide 735: "pocket" became "the narrow site".
`;
const loaded = loadPack(JSON.parse(readFileSync(new URL("../../../templates/lectern/pack.json", import.meta.url), "utf8")));
if (!loaded.ok) throw new Error(loaded.problems.join("\n"));
const pack: Pack = loaded.pack;
const packBank = ownResolved(parseBank(source), "templates/lectern");

describe("parsing", () => {
  it("reads the Use | Never | Since table and keeps every other section as text", () => {
    const bank = parseBank(source);
    expect(bank.inherits).toBeNull();
    expect(bank.entries).toHaveLength(6);
    expect(bank.entries.at(-1)).toEqual({ use: "the narrow site", never: "pocket", since: '2026-10-10, user: "consider change pocket to cavity"' });
    expect(bank.sections.map((s) => s.heading)).toEqual(["Words to use, and their replacements", "Phrasing", "Abstract structure", "Content", "Status (log of the user's edits)"]);
    expect(bank.sections.find((s) => s.heading === "Abstract structure")!.lines.join("\n")).toContain("> For one step, every guest moves at once");
  });
  it("reads the pack's own bank: an empty table and its sections", () => {
    const bank = parseBank(packSource);
    expect(bank.inherits).toBeNull();
    expect(bank.entries).toEqual([]);
    expect(bank.sections.map((s) => s.heading)).toEqual(["Words to use, and their replacements", "Phrasing", "Content", "Status (log of the user's edits)"]);
    expect(bank.sections.find((s) => s.heading === "Phrasing")!.lines.join("\n")).toContain("An axis label is the quantity, a slash and the unit");
  });
  it("reads the front matter's inherits and drop", () => {
    const bank = parseBank(setFrontMatter(newBankText(["pack", "decks/other"]), { drop: ["pocket", "a, b"] }));
    expect(bank.inherits).toEqual(["pack", "decks/other"]);
    expect(bank.drop).toEqual(["pocket", "a, b"]);
    expect(bank.entries).toEqual([]);
  });
});

describe("resolution", () => {
  const deck = (text: string) => ({ bank: parseBank(text), origin: "decks/d" });
  const other = ownResolved(parseBank(newBankText([]).replace("|---|---|---|", "|---|---|---|\n| cavity | hole | 2026-10-01 |\n| the narrow site | den | 2026-10-01 |")), "decks/other");
  it("puts the deck's own entries first and hides farther entries of the same name", () => {
    const own = deck(newBankText().replace("|---|---|---|", "|---|---|---|\n| The SC the H passes through | pit | 2026-10-13 |"));
    const resolved = resolveBank(own, [packBank]);
    expect(resolved.entries[0]).toMatchObject({ use: "The SC the H passes through", never: "pit", origin: "decks/d" });
    expect(resolved.entries.filter((e) => e.use.toLowerCase() === "the sc the h passes through")).toHaveLength(1);
    expect(resolved.entries).toHaveLength(6);
  });
  it("orders inherited banks nearest first", () => {
    const resolved = resolveBank(deck(newBankText()), [other, packBank]);
    expect(resolved.entries.find((e) => e.use === "the narrow site")!.origin).toBe("decks/other");
    expect(resolved.entries[0]!.use).toBe("cavity");
  });
  it("drops an inherited entry by its Use cell, or one Never term", () => {
    const own = deck(setFrontMatter(newBankText(), { drop: ["opposite (rotation, direction)", "sense"] }));
    const resolved = resolveBank(own, [packBank]);
    expect(resolved.entries.some((e) => e.use.startsWith("opposite"))).toBe(false);
    expect(resolved.entries.find((e) => e.use.startsWith("rotation"))!.never).toBe("turn, turning, flip");
  });
  it("takes a section whole from the nearest bank that writes it; an empty one hides nothing", () => {
    const own = deck(newBankText().replace("## Status", "## Phrasing\n\n- Only this rule.\n\n## Status"));
    const resolved = resolveBank(own, [packBank]);
    expect(resolved.sections.find((s) => s.heading === "Phrasing")!.lines).toEqual(["- Only this rule."]);
    expect(resolved.sections.find((s) => s.heading.startsWith("Status"))!.lines.length).toBeGreaterThan(0);
    expect(renderBank(resolved)).not.toContain("slide 735");
    expect(renderBank(resolved, { log: true })).toContain("slide 735");
  });
});

describe("Never terms", () => {
  it("skips descriptive cells and splits on commas outside brackets", () => {
    expect(neverTerms("(no other name)")).toEqual([]);
    expect(neverTerms("any other name for it")).toEqual([]);
    expect(neverTerms("site ids (C44, C46)")).toEqual([]);
    expect(neverTerms("towards / away from the viewer")).toEqual([]);
    expect(neverTerms("A1, B3 (cavity ids) on a slide")).toEqual(["A1"]);
    expect(neverTerms("partner, facing / diagonal / pocket-sharing partner")).toEqual(["partner"]);
    expect(neverTerms("s/s_end, image number")).toEqual(["s/s_end", "image number"]);
  });
  it("matches whole words, any case, CO₂ against CO2 and multi-word terms across spaces", () => {
    expect(containsTerm("A Pocket opens", "pocket")).toBe(true);
    expect(containsTerm("the pockets", "pocket")).toBe(false);
    expect(containsTerm("pocket-sharing", "pocket")).toBe(true);
    expect(containsTerm("then a single CO2 moves", "single CO₂")).toBe(true);
    expect(containsTerm("then one CO₂ moves", "one CO₂")).toBe(true);
    expect(containsTerm("then 1 CO₂ moves", "one CO₂")).toBe(false);
    expect(containsTerm("the window\n  peak", "window peak")).toBe(true);
    expect(containsTerm("the windows peak", "window peak")).toBe(false);
  });
  it("warns FOLIO-VOC-001 per slot and term, with the bank's word and its date", () => {
    const spec = makeSlideSpec("note-figure", { title: "ABSTRACT", note: "The H crosses a pocket while a single CO_{2} waits." });
    const warnings = slideVocabWarnings({ deck: "d", slide: "s004" }, spec, pack, packBank.entries, "2026-10-13T00:00:00.000Z");
    expect(warnings.map((w) => w.message)).toEqual([
      's004/note uses "single CO₂"; the vocabulary bank says use "1 CO₂ (a count of one)" (2026-10-12, user: "try to consistently use 1 co2").',
      's004/note uses "pocket"; the vocabulary bank says use "the narrow site" (2026-10-10, user: "consider change pocket to cavity").',
    ]);
    expect(warnings.every((w) => w.code === "FOLIO-VOC-001" && w.severity === "warning" && w.location.slot === "note")).toBe(true);
  });
});

describe("changes", () => {
  it("edits an inherited row as the deck's own row, and drops an inherited row it deletes", () => {
    const set = applyVocabOp(null, packBank, { kind: "set", from: "the narrow site", use: "the narrow site", never: "pocket, hole" }, "2026-10-13");
    expect(set.ok && parseBank(set.text).entries).toEqual([{ use: "the narrow site", never: "pocket, hole", since: '2026-10-10, user: "consider change pocket to cavity"' }]);
    const del = applyVocabOp(null, packBank, { kind: "delete", use: "held" }, "2026-10-13");
    expect(del.ok).toBe(false);
    const drop = applyVocabOp(null, packBank, { kind: "delete", use: "with CO₂; with travelling CO₂ (moving guest)" }, "2026-10-13");
    expect(drop.ok && parseBank(drop.text).drop).toEqual(["with CO₂; with travelling CO₂ (moving guest)"]);
    const added = applyVocabOp(null, EMPTY_RESOLVED, { kind: "set", use: "cavity", never: "hole" }, "2026-10-13");
    expect(added.ok && parseBank(added.text).entries).toEqual([{ use: "cavity", never: "hole", since: "2026-10-13" }]);
  });
  it("lists the text slots a write changed", () => {
    const a = makeSlideSpec("note-figure", { title: "T", note: "a pocket" });
    const b = makeSlideSpec("note-figure", { title: "T", note: "a cavity" });
    expect(changedTexts(a, b, pack)).toEqual([{ slot: "note", before: "a pocket", after: "a cavity" }]);
  });
  it("folds a typing burst into one record, and drops a burst that ends where it began", () => {
    const edit = (before: string, after: string, at: string): VocabEdit => ({ deck: "d", slide: "s001", slot: "note", before, after, at, until: at, by: "user", beforeBy: "agent" });
    let records = foldEdit([], edit("a pocket", "a cav", "2026-10-13T10:00:00Z"));
    records = foldEdit(records, edit("a cav", "a cavity", "2026-10-13T10:01:00Z"));
    expect(records).toEqual([{ ...edit("a pocket", "a cavity", "2026-10-13T10:00:00Z"), until: "2026-10-13T10:01:00Z" }]);
    expect(foldEdit(records, edit("a cavity", "a pocket", "2026-10-13T10:02:00Z"))).toEqual([]);
    expect(foldEdit(records, edit("a cavity", "the cavity", "2026-10-13T11:00:00Z"))).toHaveLength(2);
  });
});
