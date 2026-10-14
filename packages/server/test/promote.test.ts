import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { backgroundOf, makeSlideSpec, requestedBackground, slideLayout, slideRoot, textSlots, type Pack } from "@folio/core";
import { loadConfig } from "../src/config.js";
import { setJsonMember } from "../src/packedit.js";
import { promoteSlide } from "../src/promote.js";
import { Workspace } from "../src/workspace.js";
import { fileURLToPath } from "node:url";

const nusIcl = fileURLToPath(new URL("../../../templates/lectern", import.meta.url));
const OVERRIDES = { background: "black", slots: { note: { box: [25.7, 160, 439.6, 300], text: { size: 20 } } } };

/** A workspace with lectern and one deck of three note-figure slides; s001 carries overrides. */
function workspace(): { root: string; ws: Workspace } {
  const root = mkdtempSync(join(tmpdir(), "folio-promote-"));
  cpSync(nusIcl, join(root, "templates/lectern"), { recursive: true });
  writeFileSync(join(root, "folio.toml"), '[workspace]\ndecks = "decks"\ntemplates = "templates"\n');
  const deck = join(root, "decks/talk");
  mkdirSync(join(deck, "slides"), { recursive: true });
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ id: "c0ffee00c0ffee00", title: "Talk", template: "lectern@1", order: ["s001", "s002", "s003"] }));
  writeFileSync(join(deck, "slides/s001.json"), JSON.stringify(makeSlideSpec("note-figure", { title: "Moved", note: "Text", background: "smoke", overrides: OVERRIDES })));
  for (const id of ["s002", "s003"]) writeFileSync(join(deck, `slides/${id}.json`), JSON.stringify(makeSlideSpec("note-figure", { title: id })));
  return { root, ws: new Workspace(loadConfig(root)) };
}

/** What a slide renders with: its boxes, text styles and background. */
function look(pack: Pack, props: Record<string, unknown>, layoutName: string) {
  const layout = slideLayout(pack, layoutName, props)!;
  return {
    boxes: Object.fromEntries(Object.entries(layout.slots).map(([n, s]) => [n, s.box])),
    styles: Object.fromEntries(textSlots(pack, layout).map((t) => [t.name, [t.style, t.lineLimit]])),
    background: backgroundOf(pack, layout, requestedBackground(pack, layoutName, props)).name,
  };
}

describe("setJsonMember", () => {
  const text = '{\r\n "a": 720.0,\r\n "layouts": {\r\n  "x": {\r\n   "n": 1\r\n  }\r\n },\r\n "empty": {}\r\n}\r\n';
  it("adds a member in the file's own line endings and indent, leaving every other byte", () => {
    const next = setJsonMember(text, ["layouts"], "y", { n: [1, 2] });
    expect(next).toBe('{\r\n "a": 720.0,\r\n "layouts": {\r\n  "x": {\r\n   "n": 1\r\n  },\r\n  "y": {\r\n   "n": [\r\n    1,\r\n    2\r\n   ]\r\n  }\r\n },\r\n "empty": {}\r\n}\r\n');
  });
  it("replaces a member where it stands, fills an empty object and adds a missing one", () => {
    expect(setJsonMember(text, ["layouts"], "x", 2)).toBe(text.replace('{\r\n   "n": 1\r\n  }', "2"));
    expect(JSON.parse(setJsonMember(text, ["empty"], "k", true)).empty).toEqual({ k: true });
    expect(JSON.parse(setJsonMember(text, ["tables"], "t", 1)).tables).toEqual({ t: 1 });
  });
});

describe("promote a slide's overrides", () => {
  it("saves them as a new layout, moves the slide onto it, and the slide looks the same", async () => {
    const { root, ws } = workspace();
    const before = readFileSync(join(root, "templates/lectern/pack.json"), "utf8");
    const store = ws.findDeck("talk")!;
    const old = look(ws.packOf(store)!.pack, slideRoot(store.readSlide("s001")!.spec!)!.props, "note-figure");
    const outcome = await promoteSlide(ws, store, "s001", { as: "note-figure-low" }, "test");
    expect(outcome).toMatchObject({ ok: true, layout: "note-figure-low", created: true });
    const after = readFileSync(join(root, "templates/lectern/pack.json"), "utf8");
    expect(after.includes("\r")).toBe(false);
    expect(after.startsWith(before.slice(0, before.indexOf('"cover-title"')))).toBe(true);
    const pack = ws.packOf(store)!.pack;
    expect(pack.version).toBe(2);
    expect(pack.layouts["note-figure-low"]!.slots.note).toMatchObject({ box: OVERRIDES.slots.note.box, style: "note-figure-low-note" });
    const root1 = slideRoot(store.readSlide("s001")!.spec!)!;
    expect(root1.layout).toBe("note-figure-low");
    expect(root1.props.overrides).toBeUndefined();
    expect(root1.props.background).toBeUndefined();
    expect(look(pack, root1.props, "note-figure-low")).toEqual(old);
  });
  it("refuses a taken or malformed name, naming the clash, and writes nothing", async () => {
    const { root, ws } = workspace();
    const before = readFileSync(join(root, "templates/lectern/pack.json"), "utf8");
    const store = ws.findDeck("talk")!;
    expect(await promoteSlide(ws, store, "s001", { as: "title" }, "t")).toMatchObject({ ok: false, status: 422, reason: expect.stringMatching(/^layout "title" already exists in pack lectern/) });
    expect(await promoteSlide(ws, store, "s001", { as: "Note Figure" }, "t")).toMatchObject({ ok: false, reason: expect.stringMatching(/is not a layout name: use kebab-case/) });
    expect(readFileSync(join(root, "templates/lectern/pack.json"), "utf8")).toBe(before);
  });
  it("applies them to the layout only when every slide is confirmed, and then every slide of it changes", async () => {
    const { ws } = workspace();
    const store = ws.findDeck("talk")!;
    expect(await promoteSlide(ws, store, "s001", { intoLayout: true }, "t")).toMatchObject({ ok: false, reason: expect.stringMatching(/changes every slide that uses it: 3 slides \(talk\/s001, talk\/s002, talk\/s003\); confirm with "allSlides": true/) });
    expect(await promoteSlide(ws, store, "s001", { intoLayout: true, allSlides: true }, "t")).toMatchObject({ ok: true, created: false, slidesChanged: 3 });
    const pack = ws.packOf(store)!.pack;
    expect(pack.layouts["note-figure"]!.slots.note!.box).toEqual(OVERRIDES.slots.note.box);
    expect(pack.layouts["note-figure"]!.background).toBe("black");
    expect(slideRoot(store.readSlide("s001")!.spec!)!.props.overrides).toBeUndefined();
    expect(look(pack, {}, "note-figure").boxes.note).toEqual(OVERRIDES.slots.note.box);
  });
});
