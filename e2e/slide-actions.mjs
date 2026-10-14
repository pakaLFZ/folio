// Browser check for slide actions: duplicate from the rail's right-click menu, archive with the Delete key
// (moved, not deleted); no "This slide" section, Duplicate/Archive buttons or Insert heading in the panel; a layout
// card showing only its preview and name, inserting a slide of its layout right after the current one and
// selecting it; the Slide tab lists no slot rows and prints no slide id, layout or revision. Also: Delete and
// Backspace do nothing with focus off the rail and no element selected, and a held key archives only once
// (spec/slides/drawing.md, "Elements: copy, cut, paste, delete", user 2026-10-14).
// Serves its own copy of decks/example-b.
import { chromium } from "playwright";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { serve, until } from "./lib/server.mjs";
const server = await serve({ decks: ["example-b"] });
const deck = server.deckDir("example-b");
const orderOf = () => JSON.parse(readFileSync(`${deck}/deck.json`, "utf8")).order;
const layoutOf = (id) => JSON.parse(readFileSync(`${deck}/slides/${id}.json`, "utf8")).elements.s.type;
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${server.base}/${server.token("example-b")}/?slide=s001`, { waitUntil: "load" });
await page.locator('aside[aria-label="Deck panel"]').waitFor();
const openRail = async () => (await page.getByRole("button", { name: "Toggle slides" }).getAttribute("aria-expanded")) === "true" || page.getByRole("button", { name: "Toggle slides" }).click();
await openRail();
await page.locator("nav button[draggable]").first().waitFor();
const shown = JSON.parse(server.cli(["show", "decks/example-b/s001"]));
const panel = await page.locator('aside[aria-label="Deck panel"]').innerText();
const leaks = [/\bSlots\b/, /\b\d+\/\d+\b/, /\bempty\b/, new RegExp(shown.rev.slice(0, 6))].filter((r) => r.test(panel));
console.log("Slide tab free of slot rows and rev text:", leaks.length === 0, leaks.map(String).join(" "));
if (leaks.length) throw new Error(`Slide tab still shows ${leaks.join(", ")}`);
const panelButtons = await page.locator('aside[aria-label="Deck panel"]').getByRole("button", { name: /^(Duplicate|Archive)$/ }).count();
check("no This slide, Insert heading or Duplicate/Archive buttons in the panel", !/^This slide$|^Insert$|after \d+/m.test(panel) && panelButtons === 0, `buttons ${panelButtons}, panel text ${JSON.stringify(panel.slice(0, 80))}`);
await page.locator("nav button[draggable]").first().click({ button: "right" });
await page.getByRole("menuitem", { name: /Duplicate/ }).click();
await until(() => orderOf().length === 3);
await until(async () => (await page.locator("nav button[draggable]").count()) === 3);
const order = orderOf();
const copy = order[1];
check("duplicate", order.length === 3 && layoutOf(copy) === layoutOf("s001"), `order ${order.join(",")}, rail thumbnails ${await page.locator("nav button[draggable]").count()}`);
await page.locator("nav button[draggable]").nth(1).click();
await page.locator("nav button[draggable]").nth(1).and(page.locator('[aria-current="page"]')).waitFor();
const pickers = await page.locator(`aside[aria-label="Deck panel"] [aria-label="Background"]`).count();
check("no background picker", pickers === 0, `background pickers in the panel ${pickers}`);
await page.keyboard.press("Delete");
const day = new Date().toISOString().slice(0, 10);
await until(() => existsSync(`${deck}/slides/.archive/${day}/${copy}.json`) && !orderOf().includes(copy));
const archived = existsSync(`${deck}/slides/.archive/${day}/${copy}.json`);
check("archive", archived && !orderOf().includes(copy), `archived file exists ${archived}, live slides ${readdirSync(`${deck}/slides`).filter((f) => f.endsWith(".json")).join(",")}`);

await page.locator("nav button[draggable]").first().click();
await page.locator("nav button[draggable]").first().and(page.locator('[aria-current="page"]')).waitFor();
await page.locator("main").click({ position: { x: 5, y: 5 } });
await page.waitForFunction(() => !document.activeElement?.closest('nav[aria-label="Slides"]') && !document.activeElement?.closest("[data-slot]"));
const beforeNoop = orderOf();
await page.keyboard.press("Backspace");
await page.keyboard.press("Delete");
await page.waitForTimeout(300);
const afterNoop = orderOf();
check("Backspace and Delete archive nothing with focus off the rail and no element selected", JSON.stringify(afterNoop) === JSON.stringify(beforeNoop), `before ${beforeNoop.join(",")}, after ${afterNoop.join(",")}`);

await page.locator("nav button[draggable]").first().click();
await page.locator("nav button[draggable]").first().and(page.locator('[aria-current="page"]')).waitFor();
const beforeRepeat = orderOf();
const nav = page.locator('nav[aria-label="Slides"]');
await nav.evaluate((el) => el.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })));
await until(() => orderOf().length === beforeRepeat.length - 1);
const afterFirst = orderOf();
await nav.evaluate((el) => {
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true, repeat: true }));
  el.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true, repeat: true }));
});
await page.waitForTimeout(300);
const afterRepeat = orderOf();
check("a held key (repeat=true) archives only one slide", JSON.stringify(afterRepeat) === JSON.stringify(afterFirst), `after first delete ${afterFirst.join(",")}, after repeated keydowns ${afterRepeat.join(",")}`);

const selected = async () => (await page.locator('nav button[aria-current="page"]').getAttribute("aria-label"))?.split(", ")[1];
await page.locator("nav button[draggable]").first().click();
await page.locator("nav button[draggable]").first().and(page.locator('[aria-current="page"]')).waitFor();
const before = orderOf();
const current = await selected();
const layout = "three-figures";
check("cards replace the select", (await page.getByRole("combobox").count()) === 0 && (await page.getByRole("button", { name: "New", exact: true }).count()) === 0, "no layout select, no New button");
const usage = JSON.parse(readFileSync(`${server.root}/templates/lectern/pack.json`, "utf8")).layouts[layout].usage;
const card = page.getByRole("button", { name: `Insert ${layout} slide` });
const cardLabel = await card.evaluate((el) => [...el.children].filter((c) => !c.style.aspectRatio).map((c) => c.innerText).join("").trim());
check("card shows only its preview and the layout name", cardLabel === layout && !(await card.innerText()).includes(usage.when), `label ${JSON.stringify(cardLabel)}, card text ${JSON.stringify(await card.innerText())}`);
await card.hover();
await page.waitForTimeout(1000);
const tips = await page.getByRole("tooltip").count();
check("card has no tooltip", tips === 0, `tooltips ${tips}`);
await page.mouse.move(0, 0);
await page.getByRole("button", { name: `Insert ${layout} slide` }).click();
await page.waitForFunction((n) => document.querySelectorAll("nav button[draggable]").length === n, before.length + 1, { timeout: 5000 }).catch(() => {});
const fresh = () => orderOf().find((s) => !before.includes(s));
await until(async () => fresh() && (await selected()) === fresh());
const after = orderOf();
const inserted = after.find((s) => !before.includes(s));
check("card raises the slide count by 1", after.length === before.length + 1, `${before.length} -> ${after.length}`);
check("new slide has the card's layout", !!inserted && layoutOf(inserted) === layout, `${inserted} is ${inserted && layoutOf(inserted)}`);
check("new slide sits at current + 1", !!inserted && after.indexOf(inserted) === before.indexOf(current) + 1, `${current} at ${before.indexOf(current)}, ${inserted} at ${after.indexOf(inserted)}`);
check("new slide is selected", !!inserted && (await selected()) === inserted, `selected ${await selected()}`);
await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
