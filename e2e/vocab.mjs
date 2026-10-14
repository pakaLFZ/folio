// Check for the vocabulary bank (spec/slides/vocabulary.md), on its own copy of decks/example: the deck has no
// bank and inherits the lectern pack's; a slide with "pocket" gets FOLIO-VOC-001 in folio check; `folio vocab add`
// adds a word and its warning follows; a text edit in the editor is recorded in `folio vocab edits` with who
// wrote the text before; `folio prompt` ends with the bank; the Slide tab's Vocabulary bank section is closed by
// default and opens on a word of the lectern bank; a Never cell edited there writes the deck's own file and the
// warning follows; a word added there lands in the file; an inherited word deleted there becomes a drop line
// while the pack's file stays byte for byte. A slide whose only finding is FOLIO-VOC-001 has no red rail dot
// (user: "vocab check dont leave reddot on page"); an overflowing slide keeps its dot.
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: ["example"] });
const server = await start(root);
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const folio = (...args) => server.cli(args);
const deckBank = join(server.deckDir("example"), "vocabulary.md");
const packBankFile = join(root, "templates/lectern/vocabulary.md");
const packBank = readFileSync(packBankFile, "utf8");
const token = server.token("example");
const vocabWarnings = async (slide) => (await (await fetch(`${server.base}/${token}/warnings`)).json()).warnings.filter((w) => w.code === "FOLIO-VOC-001" && w.location.slide === slide && w.state !== "absent");
const terms = async (slide) => (await vocabWarnings(slide)).map((w) => w.args.term).sort().join(",");

const shown = JSON.parse(folio("vocab", "show", "decks/example", "--json"));
check("a deck without a bank inherits its pack's", !existsSync(deckBank) && shown.files.map((f) => f.origin).join() === "templates/lectern" && shown.resolved.entries.length === 18 && shown.resolved.entries.every((e) => e.origin === "templates/lectern"), `${shown.files.map((f) => f.origin)}, ${shown.resolved.entries.length} words`);

const slide = folio("new", "decks/example", "--template", "note-figure", "--worker", "agent-w1", "--props", JSON.stringify({ title: "POCKETS", note: "The H crosses the pocket through a gap." })).split(" ")[0];
const checked = JSON.parse(folio("check", "decks/example", "--json")).warnings.filter((w) => w.code === "FOLIO-VOC-001" && w.location.slide === slide);
check("folio check warns FOLIO-VOC-001 on a Never word", checked.length === 1 && checked[0].location.slot === "note" && checked[0].message === `${slide}/note uses "pocket"; the vocabulary bank says use "the narrow site" (2026-10-10, user: "consider change pocket to cavity").`, checked.map((w) => w.message).join(" | "));

const before = await terms(slide);
const added = folio("vocab", "add", "decks/example", "--use", "window", "--never", "gap, opening", "--quote", "it is a window", "--slide", slide);
const after = await until(async () => ((await terms(slide)) === "gap,pocket" ? "gap,pocket" : null), 5000);
const row = readFileSync(deckBank, "utf8").split("\n").find((l) => l.startsWith("| window |"));
check("folio vocab add writes a dated row and its warning follows", before === "pocket" && after === "gap,pocket" && /^\| window \| gap, opening \| \d{4}-\d\d-\d\d, slide s\d+, user: "it is a window" \|$/.test(row ?? ""), `${added.trim()}; warnings ${before} -> ${after}`);

const prompt = folio("prompt", "decks/example");
const vocabulary = prompt.slice(prompt.indexOf("## Vocabulary"));
check("folio prompt ends with the resolved bank, without the edit log", prompt.includes("## Vocabulary") && vocabulary.includes("| window | gap, opening |") && vocabulary.includes("| the narrow site | pocket |") && vocabulary.includes("### Phrasing") && vocabulary.includes("### Abstract structure") && !vocabulary.includes("slide 735"), `${vocabulary.length} characters from ## Vocabulary`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${server.base}/${token}/?slide=${slide}`, { waitUntil: "load" });
const dotOnCurrent = () => page.locator('[aria-current="page"] [aria-label="has warnings"]').count();
await page.locator('main [data-slot="note"] .folio-text').waitFor();
const vocabOnly = (await vocabWarnings(slide)).length > 0 && (await (await fetch(`${server.base}/${token}/warnings`)).json()).warnings.filter((w) => w.location.slide === slide && w.state !== "absent" && w.kind === "fail" && w.source !== "vocabulary").length === 0;
await page.waitForTimeout(800);
const vocabDot = await dotOnCurrent();
await page.goto(`${server.base}/${token}/?slide=s002`, { waitUntil: "load" });
const overflowDot = await until(async () => ((await dotOnCurrent()) === 1 ? 1 : null), 8000);
check("a slide whose only finding is FOLIO-VOC-001 has no rail dot; an overflowing slide still has one", vocabOnly && vocabDot === 0 && overflowDot === 1, `${slide}: VOC only ${vocabOnly}, dots ${vocabDot}; s002 dots ${overflowDot}`);
await page.goto(`${server.base}/${token}/?slide=${slide}`, { waitUntil: "load" });
const note = page.locator('main [data-slot="note"] .folio-text');
await note.click();
await page.keyboard.press("End");
await page.keyboard.type(" Then it stops");
await page.locator("main").click({ position: { x: 5, y: 5 } });
await page.keyboard.press("Escape");
const edits = await until(() => JSON.parse(folio("vocab", "edits", "decks/example", "--json")).find((e) => e.slide === slide && e.slot === "note"), 8000);
check("a text edit in the editor is recorded with who wrote the text before", !!edits && edits.before === "The H crosses the pocket through a gap." && edits.after.endsWith("Then it stops") && edits.beforeBy === "agent-w1" && edits.by === "user", JSON.stringify(edits));

const panel = page.locator('aside[aria-label="Deck panel"]');
const header = panel.locator("h3 > button[aria-expanded]").filter({ hasText: "Vocabulary bank" });
const closed = await header.getAttribute("aria-expanded");
await header.click();
const word = panel.locator('[data-vocab-word="the narrow site"]');
const opened = await word.waitFor({ timeout: 5000 }).then(() => true, () => false);
check("the Slide tab's Vocabulary bank is closed by default and opens on a word of the pack's bank", closed === "false" && opened && (await word.locator("[data-origin]").innerText()) === "pack", `aria-expanded ${closed}, word shown ${opened}`);

await word.getByRole("button", { name: /^Never: pocket/ }).click();
const field = word.getByRole("textbox", { name: "Never" });
await field.fill("pocket, crosses");
await field.press("Enter");
const crossed = await until(async () => ((await terms(slide)) === "crosses,gap,pocket" ? true : null), 5000);
const overridden = readFileSync(deckBank, "utf8").includes("| the narrow site | pocket, crosses |");
await word.locator('[data-origin="deck"]').waitFor({ timeout: 5000 }).catch(() => null);
check("a Never cell edited in the editor writes the deck's own row and the warning follows", !!crossed && overridden && readFileSync(packBankFile, "utf8") === packBank && (await word.locator("[data-origin]").innerText()) === "deck", `warnings ${await terms(slide)}; deck row ${overridden}`);

await panel.getByRole("textbox", { name: "New word: use" }).fill("travel");
await panel.getByRole("textbox", { name: "New word: never" }).fill("stops");
await panel.getByRole("button", { name: "Add word" }).click();
const travelled = await until(async () => ((await terms(slide)) === "crosses,gap,pocket,stops" ? true : null), 5000);
check("a word added in the editor lands in the deck's file and warns", !!travelled && /^\| travel \| stops \| \d{4}-\d\d-\d\d \|$/m.test(readFileSync(deckBank, "utf8")), await terms(slide));

const held = panel.locator('[data-vocab-word="with CO₂; with travelling CO₂ (moving guest)"]');
await held.hover();
await held.getByRole("button", { name: /^Drop / }).click();
await page.getByRole("button", { name: /^Confirm: Drop / }).click();
const dropped = await until(() => /^drop: \[.*with CO₂; with travelling CO₂ \(moving guest\)/m.test(readFileSync(deckBank, "utf8")), 5000);
const gone = await until(async () => (await held.count()) === 0, 5000);
check("deleting an inherited word writes a drop line; the pack's bank is untouched", !!dropped && !!gone && readFileSync(packBankFile, "utf8") === packBank, readFileSync(deckBank, "utf8").split("\n").slice(0, 4).join(" / "));

await browser.close();
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
