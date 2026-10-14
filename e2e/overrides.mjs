// Slot tops are read from offsetTop, a whole CSS pixel (0.75 pt), so positions are compared within one pixel.
// Overrides and promoting them into a template are CLI/HTTP only (no browser Overrides section,
// spec/slides/overrides.md); this check drives them over the HTTP API and only uses the browser to confirm
// the page still renders what the API wrote, and that the Slide tab shows no overrides UI at all.
// On its own copy of decks/example (slide s002 is note-figure with a note past its line limit):
// a box override set through the HTTP API moves the note in the page, and the overflow warning recomputes with
// the overridden box's line limit; clearing it through the API returns the note to the template's position;
// an invalid override is refused naming its path; promoting "as a new layout" over HTTP adds a layout that the
// template manager shows at once, moves the slide onto it with its overrides gone and the note where the
// override put it, and keeps pack.json in LF; promoting "into the layout" over HTTP says how many slides
// change and writes the layout.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settle } from "./lib/page.mjs";
import { start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: ["example"] });
const server = await start(root);
const token = server.token("example");
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const api = async (path, body) => {
  const res = await fetch(`${server.base}/${token}/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return { status: res.status, body: await res.json() };
};
const slideFile = () => JSON.parse(readFileSync(join(server.deckDir("example"), "slides/s002.json"), "utf8"));
const packFile = () => readFileSync(join(root, "templates/lectern/pack.json"), "utf8");
const noteLimit = async () => (await api("warnings")).body.warnings.find((w) => w.code === "FOLIO-OVF-001" && w.location.slot === "note")?.args.limit ?? null;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${server.base}/${token}/?slide=s002`, { waitUntil: "load" });
const panel = page.locator('aside[aria-label="Deck panel"]');
const ONE_PX = 0.75;
const at = (top, y) => top !== null && Math.abs(top - y) <= ONE_PX;
const noteTop = () => page.evaluate(() => {
  const note = document.querySelector('main [data-slot="note"]');
  return note ? Math.round((note.offsetTop / (4 / 3)) * 10) / 10 : null;
});
const templateTop = await until(noteTop);
const templateLimit = await until(noteLimit);
check("the template's note overflows", templateLimit !== null, `top ${templateTop} pt, limit ${templateLimit}`);

check("the Slide tab shows no overrides section", (await panel.locator("section[data-overrides]").count()) === 0, "no section[data-overrides] before any override exists");

const BOX = [25.7, 200, 439.6, 120];
const set = await api("slides/s002/overrides", { set: { "slots.note.box": BOX } });
check("a box override is accepted", set.status === 200 && set.body.entries.length === 1, `${set.status} ${JSON.stringify(set.body.entries)}`);
const moved = await until(async () => at(await noteTop(), BOX[1]));
check("the note moves to the overridden box in the page", !!moved, `top ${templateTop} -> ${await noteTop()} pt`);
const newLimit = await until(async () => {
  const limit = await noteLimit();
  return limit !== null && limit < templateLimit ? limit : null;
});
check("the overflow warning recomputes with the overridden box's limit", newLimit !== null, `limit ${templateLimit} -> ${newLimit}`);
check("the Slide tab still shows no overrides section with an override set", (await panel.locator("section[data-overrides]").count()) === 0, "overrides UI stays out of the browser");

const cleared = await api("slides/s002/overrides", { clearAll: true });
check("clearing it over the API succeeds", cleared.status === 200 && cleared.body.entries.length === 0, `${cleared.status} ${JSON.stringify(cleared.body.entries)}`);
const back = await until(async () => at(await noteTop(), templateTop));
check("the note returns to the template's position", !!back && slideFile().elements.s.props.overrides === undefined, `top ${await noteTop()} pt`);

const bad = await api("slides/s002/overrides", { set: { "slots.note.box": [25.7, 200, -1, 120] } });
check("an invalid override is refused by path", bad.status === 422 && /overrides\.slots\.note\.box\.2: /.test(bad.body.detail) && slideFile().elements.s.props.overrides === undefined, `${bad.status} ${bad.body.detail}`);

await api("slides/s002/overrides", { set: { "slots.note.box": BOX } });
const saved = await api("slides/s002/promote", { as: "note-figure-low" });
check("promoting as a new layout over HTTP succeeds", saved.status === 200 && saved.body.created === true && saved.body.layout === "note-figure-low", `${saved.status} ${JSON.stringify(saved.body)}`);
const card = await until(async () => (await panel.getByRole("button", { name: "Insert note-figure-low slide" }).count()) === 1, 8000);
const promoted = slideFile().elements.s;
check("the template manager shows the new layout at once", !!card, `card ${card ? "shown" : "missing"}`);
check("the slide uses it, without overrides, and the note stays put", promoted.type === "note-figure-low" && promoted.props.overrides === undefined && !!(await until(async () => at(await noteTop(), BOX[1]))), `${promoted.type}, top ${await noteTop()} pt`);
check("pack.json keeps its LF line endings", !packFile().includes("\r") && packFile().includes('"note-figure-low"'), "no CR added");

await api("slides/s002/overrides", { set: { "slots.note.box": [25.7, 220, 439.6, 120] } });
const counted = await api("slides/s002/overrides");
check("the overrides route says how many slides the layout reaches", counted.status === 200 && counted.body.layoutSlides.length === 1, `${counted.status} ${JSON.stringify(counted.body.layoutSlides)}`);
const applied = await api("slides/s002/promote", { intoLayout: true, allSlides: true });
check("promoting into the template over HTTP says how many slides changed", applied.status === 200 && applied.body.slidesChanged === 1, `${applied.status} ${JSON.stringify(applied.body)}`);
const landed = await until(() => JSON.parse(packFile()).layouts["note-figure-low"].slots.note.box[1] === 220 && slideFile().elements.s.props.overrides === undefined);
await settle(page);
check("the layout takes the override and the slide's overrides are gone", !!landed && at(await noteTop(), 220), `box y ${JSON.parse(packFile()).layouts["note-figure-low"].slots.note.box[1]}, top ${await noteTop()} pt`);

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
