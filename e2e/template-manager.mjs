// Browser check for the Slide tab's template manager: the Template bank and Templates sections open by default,
// headers holding only their titles and no divider anywhere; every pack in templates/ listed by name alone,
// the deck's own carrying the "In use" check; selecting another pack
// shows its layouts as previews with a note and no insert button, and writes nothing; the deck's cards still
// insert; a collapsed section folds to nothing, is inert, and stays collapsed after a reload. The third section,
// the Vocabulary bank (closed by default), is checked in vocab.mjs.
// Serves its own copy of decks/example-b, with a second pack "plain" (lectern renamed, one layout).
import { chromium } from "playwright";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { settle } from "./lib/page.mjs";
import { start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: ["example-b"] });
const plainDir = join(root, "templates/plain");
cpSync(join(root, "templates/lectern"), plainDir, { recursive: true });
const plain = JSON.parse(readFileSync(join(plainDir, "pack.json"), "utf8"));
const deckLayouts = Object.keys(plain.layouts).length;
writeFileSync(join(plainDir, "pack.json"), JSON.stringify({ ...plain, name: "plain", layouts: { title: plain.layouts.title } }));
const server = await start(root);
const deckJson = () => readFileSync(join(server.deckDir("example-b"), "deck.json"), "utf8");
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));

const listed = (await (await fetch(`${server.base}/api/packs`)).json()).packs.map((p) => `${p.name}:${Object.keys(p.layouts).length}`);
check("GET /api/packs lists both packs", listed.join() === `lectern:${deckLayouts},plain:1`, listed.join());

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${server.base}/${server.token("example-b")}/?slide=s001`, { waitUntil: "load" });
const panel = page.locator('aside[aria-label="Deck panel"]');
const header = (title) => panel.locator("h3 > button[aria-expanded]").filter({ hasText: title });
const headerState = async (title) => [await header(title).getAttribute("aria-expanded"), (await header(title).innerText()).replace(/\s+/g, "")];
const inserts = () => panel.getByRole("button", { name: /^Insert .* slide$/ }).count();
const group = (name) => panel.locator("button[aria-pressed]").filter({ hasText: name });
await page.getByRole("button", { name: "Insert title slide" }).waitFor();
const rows = panel.locator("button[aria-pressed]");
await until(async () => (await rows.count()) === 2);

const bank = await headerState("Template bank");
const templates = await headerState("Templates");
check("both sections open, titles only", bank.join() === "true,Templatebank" && templates.join() === "true,Templates", `${bank} | ${templates}`);
const rules = await panel.locator("section").evaluateAll((els) => els.flatMap((e) => [e, e.querySelector("h3"), e.querySelector("h3 > button")]).map((e) => ["Top", "Bottom"].map((side) => getComputedStyle(e)[`border${side}Width`]).join("/")));
check("no divider between or under the sections", rules.length === 9 && rules.every((r) => r === "0px/0px"), rules.join(" "));
const checks = [await group("lectern").getByRole("img", { name: "In use" }).count(), await group("plain").getByRole("img", { name: "In use" }).count()];
const rowText = (await rows.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
check("deck's pack carries the In use check and is selected, rows show names only", checks.join() === "1,0" && !rowText.some((t) => /layout/.test(t)) && (await group("lectern").getAttribute("aria-pressed")) === "true", `checks ${checks}, rows ${JSON.stringify(rowText)}`);
check("deck's layouts insert", (await inserts()) === deckLayouts, `insert buttons ${await inserts()} of ${deckLayouts} layouts`);

const before = deckJson();
await group("plain").click();
await until(async () => (await panel.locator("[data-layout-preview]").count()) === 1);
const previews = await panel.locator("[data-layout-preview]").count();
const note = await panel.getByText("Slides in this deck use lectern").count();
check("another pack shows previews only", previews === 1 && (await inserts()) === 0 && note === 1, `previews ${previews}, insert buttons ${await inserts()}, note ${note}`);
check("selecting a group writes nothing", deckJson() === before && (await group("plain").getAttribute("aria-pressed")) === "true", "deck.json unchanged");
await group("lectern").click();
await page.getByRole("button", { name: "Insert title slide" }).waitFor();

await header("Template bank").click();
await settle(page);
const folded = await panel.locator('[id][inert]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
await header("Templates").click();
await settle(page);
const tops = await panel.locator("h3 > button").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().top));
check("collapsed headers sit 32 px apart", tops.length === 3 && Math.abs(tops[1] - tops[0] - 32) < 1 && Math.abs(tops[2] - tops[1] - 32) < 1, `header tops ${tops}`);
await header("Templates").click();
await settle(page);
check("collapsed bank folds to nothing and is inert", (await headerState("Template bank"))[0] === "false" && folded.length === 2 && folded.every((h) => h === 0), `inert heights ${folded}`);
await page.reload({ waitUntil: "load" });
await page.getByRole("button", { name: "Insert title slide" }).waitFor();
const kept = [(await headerState("Template bank"))[0], (await headerState("Templates"))[0]];
check("collapse state remembered after reload", kept.join() === "false,true", kept.join());

const order = () => JSON.parse(deckJson()).order.length;
const count = order();
await page.getByRole("button", { name: "Insert note-figure slide" }).click();
const grew = await until(() => order() === count + 1, 5000);
check("a card in the Templates section still inserts", !!grew, `${count} -> ${order()}`);

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
