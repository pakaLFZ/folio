import { describe, expect, it } from "vitest";
import { deckFileKept, exportReadme, hookKeysOf, makeSlideSpec, packDifferences, packFileKept, pathCandidates, slideDetail, undrawnSlots, verifyExport, type Pack } from "../src/index.js";

const keys = new Set(["0123456789abcdef"]);
const plain = { comments: false, cache: true };

describe("deckFileKept", () => {
  it("keeps the deck's own files and its slides", () => {
    for (const p of ["deck.json", "slides/s001.json", "fig/a.png", "fig/a.png.trace.json", "b.table.json", "make_figures.py", "data/x.csv"]) expect(deckFileKept(p, keys, plain)).toBe(true);
  });
  it("leaves out shots, caches, archives, editor files and earlier exports", () => {
    for (const p of [".shots/s001.png", "__pycache__/m.pyc", "x.pyc", "slides/.archive/2026-10-13/s009.json", "notes.md~", ".notes.md.swp", ".DS_Store", "old.folio.zip"]) expect(deckFileKept(p, keys, plain)).toBe(false);
  });
  it("carries comments only when asked", () => {
    expect(deckFileKept("comments/c1.json", keys, plain)).toBe(false);
    expect(deckFileKept("comments/c1/shot-slide.png", keys, { ...plain, comments: true })).toBe(true);
    expect(deckFileKept("comments/.archive/2026-10-13/c2.json", keys, { ...plain, comments: true })).toBe(true);
  });
  it("carries the hook outputs the slot states name and the stored state, never locks, logs or drafts", () => {
    expect(deckFileKept(".folio/hooks/0123456789abcdef.png", keys, plain)).toBe(true);
    expect(deckFileKept(".folio/hooks/0123456789abcdef.json", keys, plain)).toBe(true);
    expect(deckFileKept(".folio/hooks/0123456789abcdef.out.json", keys, plain)).toBe(true);
    expect(deckFileKept(".folio/hooks/ffffffffffffffff.png", keys, plain)).toBe(false);
    for (const p of [".folio/hooks/slots/s001.json", ".folio/warnings/s001.json", ".folio/acks/w1.json", ".folio/tables/b.table.json.json"]) expect(deckFileKept(p, keys, plain)).toBe(true);
    for (const p of [".folio/locks/deck", ".folio/log/2026-10-13.jsonl", ".folio/hooks/log/2026-10-13.jsonl", ".folio/hooks/tmp/x", ".folio/drafts/user/s001.json", ".folio/uploads/u1-a.csv"]) expect(deckFileKept(p, keys, plain)).toBe(false);
  });
  it("carries no cache without it", () => {
    expect(deckFileKept(".folio/hooks/0123456789abcdef.png", keys, { ...plain, cache: false })).toBe(false);
    expect(deckFileKept(".folio/hooks/slots/s001.json", keys, { ...plain, cache: false })).toBe(false);
  });
});

describe("packFileKept", () => {
  it("keeps the pack folder minus dot files, caches and archives", () => {
    expect(packFileKept("fonts/LICENSE-Roboto.txt")).toBe(true);
    expect(packFileKept("hooks/line-plot/draw.py")).toBe(true);
    expect(packFileKept("hooks/line-plot/__pycache__/draw.cpython-312.pyc")).toBe(false);
    expect(packFileKept(".archive/pack.json")).toBe(false);
    expect(packFileKept(".git/HEAD")).toBe(false);
  });
});

describe("hook keys and undrawn slots", () => {
  const states = { s001: { title: { key: "a1", goodKey: "a0", phase: "ok" } }, s002: { "fig:a": { key: "b1", goodKey: null, phase: "failed" } } };
  it("names current and last good keys", () => expect([...hookKeysOf(Object.values(states))].sort()).toEqual(["a0", "a1", "b1"]));
  it("lists the slots not drawn", () => expect(undrawnSlots(states)).toEqual([{ slide: "s002", slot: "fig:a", phase: "failed" }]));
});

describe("slide details", () => {
  const pack = { layouts: { plot: { slots: { title: { role: "title", box: [0, 0, 10, 10] }, "fig:a": { role: "figure", box: [0, 0, 10, 10] }, note: { role: "body", box: [0, 0, 10, 10] } } } } } as unknown as Pack;
  it("finds file paths anywhere in the props, not numbers or prose", () => {
    expect(pathCandidates({ "fig:a": "fig/a.png", "table:b": { src: "b.table.json" }, note: "0.52 eV and more.", n: "0.52" })).toEqual(["b.table.json", "fig/a.png"]);
  });
  it("gives layout, plain title, slot names and the filled ones", () => {
    const spec = makeSlideSpec("plot", { title: "CO_{2} uptake", "fig:a": "fig/a.png", note: "", background: "plain" });
    const d = slideDetail(pack, 2, "s002", spec, null, ["fig/a.png"]);
    expect(d).toEqual({ number: 2, id: "s002", layout: "plot", title: "CO2 uptake", slots: ["title", "fig:a", "note"], filled: ["title", "fig:a"], files: ["fig/a.png"], error: null });
  });
});

describe("verifyExport and packDifferences", () => {
  const manifest = { files: { "deck.json": "aa", "fig/a.png": "bb" } };
  it("passes when every digest matches", () => expect(verifyExport(manifest, { "deck.json": "aa", "fig/a.png": "bb" })).toEqual([]));
  it("names missing, changed and extra files", () => {
    expect(verifyExport(manifest, { "deck.json": "zz", "x.txt": "cc" })).toEqual(["deck.json does not match its sha256 (changed after export)", "fig/a.png is missing", "x.txt is not in the manifest"]);
  });
  it("names where two packs differ", () => {
    expect(packDifferences({ "pack.json": "1", "a.ttf": "2" }, { "pack.json": "9", "b.ttf": "3" })).toEqual(["a.ttf: only in the export", "b.ttf: only in the installed pack", "pack.json: differs"]);
  });
});

describe("exportReadme", () => {
  it("lists every slide and how to open it", () => {
    const text = exportReadme({
      format: 1, folio: "0.1.0", exportedAt: "2026-10-13T00:00:00Z", deck: { id: "x", title: "Deck", folder: "deck", template: "p@1" }, pack: { name: "p", version: 1, folder: "templates/p" },
      options: { comments: false, cache: true, pdf: null }, slides: [{ number: 1, id: "s001", layout: "title", title: "A | B", slots: [], filled: [], files: [], error: null }], warnings: [], notes: [],
    });
    expect(text).toContain("| 1 | s001 | title | A \\| B |");
    expect(text).toContain("folio deck import deck.folio.zip");
  });
});
