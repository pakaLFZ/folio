import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DeckStore } from "../src/deckstore.js";
import { layoutAdd, layoutRemove, layoutRename, setValue } from "../src/layoutedits.js";
import { planMerge } from "../src/packmerge.js";
import { applyPackChange, editJsonText, openPack, packDirOf, writePack } from "../src/packedit.js";
import { fileURLToPath } from "node:url";

const lecternDir = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));

/** A workspace with a copy of lectern, a small pack "other" and one deck on lectern@1 using note-figure. */
async function workspace() {
  const root = mkdtempSync(join(tmpdir(), "folio-packops-"));
  const templates = join(root, "templates");
  cpSync(lecternDir, join(templates, "lectern"), { recursive: true });
  const other = join(templates, "other");
  mkdirSync(join(other, "images"), { recursive: true });
  mkdirSync(join(other, "hooks", "dots"), { recursive: true });
  writeFileSync(join(other, "images", "rule-864.svg"), "<svg xmlns='http://www.w3.org/2000/svg'/>");
  writeFileSync(join(other, "hooks", "dots", "hook.json"), JSON.stringify({ name: "dots", version: 1, command: ["dots.py"], runtime: "python", inputs: { type: "object" } }));
  writeFileSync(join(other, "hooks", "dots", "dots.py"), "print('dots')\n");
  const box = [25.7, 19.8, 908.7, 29.8];
  writeFileSync(join(other, "pack.json"), JSON.stringify({
    name: "other", version: 1, canvas: { w: 960, h: 540, unit: "pt" },
    roles: { title: { size: 30, lineHeight: 1.2, weight: 700 } },
    backgrounds: { plain: { fill: "#FFFFFF", ink: "#17191C" }, navy: { fill: "#000080", ink: "#FFFFFF" } },
    layouts: { dots: { description: "Dots.", background: "navy", slots: { title: { role: "title", box }, "fig:a": { role: "figure", box: [25.7, 100, 900, 400], hook: "dots" } }, decorations: [{ image: "images/rule-864.svg", box: [849.3, 15, 84.6, 38.3] }] } },
  }, null, 2));
  const deck = DeckStore.create(join(root, "decks", "talk"), "Talk", "lectern@1");
  await deck.newSlide("note-figure", { title: "A", note: "Some text", "set-id": "ID 1234abcd" }, "test");
  return { root, templates, deck, lec: () => openPack(join(templates, "lectern")), other: () => openPack(other) };
}

const text = (dir: string) => readFileSync(join(dir, "pack.json"), "utf8");

describe("folio pack merge", () => {
  it("refuses names both packs define differently, naming the --rename that resolves each", async () => {
    const w = await workspace();
    expect(() => planMerge(w.other(), w.lec(), { rename: {} })).toThrow(/roles\.title: both packs define it differently \(.*\); merge it under another name with --rename roles\.title=<new>/);
  });

  it("copies layouts, styles, backgrounds, hooks and images, keeping the version and the file's LF line endings", async () => {
    const w = await workspace();
    const before = text(join(w.templates, "lectern"));
    const lines = applyPackChange(w.lec(), planMerge(w.other(), w.lec(), { rename: { "roles.title": "other-title" } }), [w.deck]);
    const after = text(join(w.templates, "lectern"));
    const json = JSON.parse(after);
    expect(lines.join("\n")).toMatch(/copied layout dots[\s\S]*version 1 kept/);
    expect(json.version).toBe(1);
    expect(json.roles["other-title"]).toMatchObject({ size: 30 });
    expect(json.backgrounds.navy).toEqual({ fill: "#000080", ink: "#FFFFFF" });
    expect(json.layouts.dots.slots.title.style).toBe("other-title");
    expect(json.layouts.dots.decorations[0].image).toBe("images/other-rule-864.svg");
    expect(existsSync(join(w.templates, "lectern", "images", "other-rule-864.svg"))).toBe(true);
    expect(existsSync(join(w.templates, "lectern", "hooks", "dots", "dots.py"))).toBe(true);
    expect(after.includes("\r")).toBe(false);
    expect(after.startsWith(before.slice(0, before.indexOf('"roles"')))).toBe(true);
    expect((after.match(/416\.0/g) ?? []).length).toBe((before.match(/416\.0/g) ?? []).length);
  });

  it("shares what is the same, and merges only the layouts named", async () => {
    const w = await workspace();
    const self = openPack(join(w.templates, "lectern"));
    const change = planMerge(self, w.lec(), { layouts: ["note-figure"], rename: { "note-figure": "note-figure-copy" } });
    expect(change.lines).toContain("shared backgrounds.plain (the same in both)");
    expect(change.edits.map((e) => e.path.join("."))).toEqual(["layouts.note-figure-copy"]);
  });

  it("refuses another canvas size and an unknown layout", async () => {
    const w = await workspace();
    const other = w.other();
    other.pack!.canvas.w = 720;
    expect(() => planMerge(other, w.lec(), { rename: {} })).toThrow(/720 x 540 pt.*960 x 540 pt/);
    expect(() => planMerge(w.other(), w.lec(), { layouts: ["nope"], rename: {} })).toThrow(/has no layout nope \(layouts: dots\)/);
  });
});

describe("folio pack edit", () => {
  it("adds a copy of a layout and renames it in place, keeping its position", async () => {
    const w = await workspace();
    applyPackChange(w.lec(), layoutAdd(w.lec(), "spare", { layout: "blank" }), [w.deck]);
    const lines = applyPackChange(w.lec(), layoutRename(w.lec(), "spare", "spare-2"), [w.deck]);
    const keys = Object.keys(JSON.parse(text(join(w.templates, "lectern"))).layouts);
    expect(keys.at(-1)).toBe("spare-2");
    expect(lines.join("\n")).toContain("version 1 -> 2: removed layout:spare");
    expect(JSON.parse(readFileSync(join(w.deck.dir, "deck.json"), "utf8")).template).toBe("lectern@2");
  });

  it("refuses to remove or rename a layout a deck uses, naming the slide", async () => {
    const w = await workspace();
    expect(() => applyPackChange(w.lec(), layoutRemove(w.lec(), "note-figure"), [w.deck])).toThrow(/talk\/s001: Layout note-figure is not in pack lectern/);
    expect(() => applyPackChange(w.lec(), layoutRename(w.lec(), "note-figure", "nf"), [w.deck])).toThrow(/would stop rendering/);
    expect(JSON.parse(text(join(w.templates, "lectern"))).version).toBe(1);
  });

  it("archives a removed layout, bumps the version and re-pins the deck", async () => {
    const w = await workspace();
    const lines = applyPackChange(w.lec(), layoutRemove(w.lec(), "blank"), [w.deck]);
    expect(lines).toContain(`re-pinned ${w.deck.dir} to lectern@2`);
    const archived = join(w.templates, "lectern", ".archive");
    const day = readdirSync(archived)[0]!;
    expect(JSON.parse(readFileSync(join(archived, day, "layouts", "blank.json"), "utf8")).description).toBe("An empty page.");
    expect(JSON.parse(text(join(w.templates, "lectern"))).layouts.blank).toBeUndefined();
  });

  it("sets one value in place and refuses a field pack.json does not have", async () => {
    const w = await workspace();
    const before = text(join(w.templates, "lectern"));
    applyPackChange(w.lec(), setValue(w.lec(), "layouts.title.slots.title.box.1=30"), [w.deck]);
    const after = text(join(w.templates, "lectern"));
    expect(JSON.parse(after).layouts.title.slots.title.box).toEqual([48, 30, 800, 300]);
    expect(after.length - before.length).toBe(-1);
    expect(() => setValue(w.lec(), "layouts.title.slots.title.boxx=[1,2,3,4]")).toThrow(/no such field/);
    expect(() => setValue(w.lec(), "roles.note.size=big")).toThrow(/not JSON/);
    expect(() => applyPackChange(w.lec(), setValue(w.lec(), "layouts.title.background=\"navy\""), [w.deck])).toThrow(/not one of the theme's backgrounds/);
  });

  it("refuses a slot role change that empties a filled slot's kind", async () => {
    const w = await workspace();
    expect(() => applyPackChange(w.lec(), setValue(w.lec(), 'layouts.note-figure.slots.set-id.role="figure"'), [w.deck])).toThrow(/set-id of layout note-figure holds content/);
  });

  it("finds packs by name or folder and names the fix when there is none", async () => {
    const w = await workspace();
    expect(packDirOf(w.templates, "lectern")).toBe(join(w.templates, "lectern"));
    expect(() => packDirOf(w.templates, "missing")).toThrow(/folio pack import <file.pptx> --name missing/);
  });
});

describe("writePack", () => {
  it("takes the pack's lock and plans each change from the file on disk, so two writers both land", async () => {
    const w = await workspace();
    const dir = join(w.templates, "lectern");
    await Promise.all(["one", "two"].map((name) => writePack(dir, [w.deck], (handle) => layoutAdd(handle, name, { layout: "blank" }))));
    const json = JSON.parse(text(dir));
    expect([json.layouts.one, json.layouts.two].every(Boolean)).toBe(true);
    expect(json.version).toBe(1);
  });
});

describe("in-place JSON edits", () => {
  it("keep CRLF and the indent when adding, renaming and removing members", () => {
    const crlf = '{\r\n "a": 1.0,\r\n "b": {\r\n  "c": 2\r\n }\r\n}\r\n';
    const out = editJsonText(crlf, [{ op: "set", path: ["b", "d"], value: [1, 2] }, { op: "rename", path: ["b"], to: "e" }, { op: "remove", path: ["e", "c"] }]);
    expect(out).toContain('"a": 1.0');
    expect(out.replace(/\r\n/g, "")).not.toContain("\n");
    expect(JSON.parse(out)).toEqual({ a: 1, e: { d: [1, 2] } });
  });
});
