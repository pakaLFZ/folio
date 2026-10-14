// Browser check for elements (spec/slides/drawing.md, "Elements: copy, cut, paste, delete"), on its own
// workspace with a three-slide lectern deck: a table selected on s001 and copied with Ctrl+C is pasted with
// Ctrl+V on s002 as an added table 12 pt along; the figure of s002 cut with Ctrl+X is cleared (its slot stays in
// the layout); a shape deleted from the right-click menu is gone; a right drag pans and opens no menu; Ctrl+C
// inside text copies the words, not the element; repeated clicks inside a text box keep it selected, a click on the
// empty slide deselects, and the Region tool stays chosen through single clicks. Every step is asserted on the slide files on disk.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { settle, still } from "./lib/page.mjs";
import { bin, start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
const patch = (slide, props) => {
  const file = join(root, `${slide}.json`);
  writeFileSync(file, JSON.stringify(Object.entries(props).map(([k, v]) => ({ op: "add", path: `/elements/s/props/${k}`, value: v }))));
  folio("patch", `decks/d/${slide}`, file);
};
folio("init-deck", "decks/d", "--template", "lectern@1", "--title", "D");
const table = { columns: ["Path", "Barrier"], rows: [["Path A", "0.67"], ["Path B", "0.74"]] };
folio("new", "decks/d", "--template", "summary-table");
patch("s001", { title: "Barriers", "table:a": table });
folio("new", "decks/d", "--template", "plot-note");
writeFileSync(join(root, "decks/d/plot.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 60"><rect width="100" height="60" fill="#36a"/></svg>');
patch("s002", { title: "A plot", "fig:a": "plot.svg" });
folio("shape", "add", "decks/d/s002", "rect", "--box", "700,420,120,60");
folio("new", "decks/d", "--template", "blank");
folio("text", "add", "decks/d/s003", "--box", "100,100,300,80", "--text", "Words in a box");
const props = (slide) => JSON.parse(readFileSync(join(root, `decks/d/slides/${slide}.json`), "utf8")).elements.s.props;
const slots = (slide) => props(slide).overrides?.slots ?? {};

const server = await start(root);
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: server.base });
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
const editor = `${server.base}/${server.token("d")}/?mode=edit&slide=`;
const mod = process.platform === "darwin" ? "Meta" : "Control";

await page.goto(`${editor}s001`, { waitUntil: "load" });
await still(page);
await page.locator('[data-shape-hit="table:a"]').click({ position: { x: 20, y: 8 } });
check("a click selects a table and frames it with handles, as every slot (2026-10-13)", (await page.locator('[data-shape-selected="table:a"] [data-shape-handle]').count()) === 8, "frame");
await page.keyboard.press(`${mod}+c`);
await page.goto(`${editor}s002`, { waitUntil: "load" });
await still(page);
await page.keyboard.press(`${mod}+v`);
const pasted = await until(() => slots("s002")["table:a"] && props("s002")["table:a"]);
const source = JSON.parse(readFileSync(join(root, "decks/d/slides/s001.json"), "utf8"));
check("Ctrl+V on another slide adds the copied table as an added slot, with its rows", JSON.stringify(pasted) === JSON.stringify(table) && slots("s002")["table:a"].role === "table", JSON.stringify(slots("s002")["table:a"]));
check("the source table is left as it was", JSON.stringify(source.elements.s.props["table:a"]) === JSON.stringify(table), "s001 kept");

await page.locator('[data-shape-hit="fig:a"]').click({ position: { x: 5, y: 5 } });
await page.keyboard.press(`${mod}+x`);
const cut = await until(() => !("fig:a" in props("s002")));
check("Ctrl+X on a figure of the layout clears it; the slot stays in the layout", !!cut && !slots("s002")["fig:a"], JSON.stringify(Object.keys(props("s002"))));

const hit = await page.locator('[data-shape-hit="shape:a"]').boundingBox();
await page.mouse.click(hit.x + hit.width / 2, hit.y + hit.height / 2, { button: "right" });
const menu = page.locator('[role="menu"][aria-label="Element actions"]');
await menu.waitFor({ timeout: 5000 }).catch(() => {});
const rows = await menu.getByRole("menuitem").allInnerTexts().catch(() => []);
check("a right-click on a shape opens Cut, Copy, Paste and Delete with their keys", rows.length === 4 && /^Cut/.test(rows[0]) && /Delete/.test(rows[3]), rows.join(" | "));
await menu.getByRole("menuitem", { name: /Delete/ }).click();
const gone = await until(() => !slots("s002")["shape:a"] && !("shape:a" in props("s002")));
check("Delete from the menu removes the added shape", !!gone, JSON.stringify(Object.keys(slots("s002"))));

await page.locator('main [data-slot="note"]').click({ button: "right", position: { x: 20, y: 5 } });
const clearRow = await menu.getByRole("menuitem").allInnerTexts().catch(() => []);
check("on a slot of the layout the menu says Clear, not Delete", clearRow.some((r) => /^Clear/.test(r)) && !clearRow.some((r) => /^Delete/.test(r)), clearRow.join(" | "));
await page.keyboard.press("Escape");
await settle(page);

const main = page.locator("main");
const panBefore = await main.getAttribute("data-pan-x");
const slide = await page.locator("main .folio-slide").boundingBox();
await page.mouse.move(slide.x + slide.width / 2, slide.y + slide.height / 2);
await page.mouse.down({ button: "right" });
await page.mouse.move(slide.x + slide.width / 2 - 120, slide.y + slide.height / 2, { steps: 8 });
await page.mouse.up({ button: "right" });
await settle(page);
check("a right drag pans and opens no menu", (await main.getAttribute("data-pan-x")) !== panBefore && (await menu.count()) === 0, `pan ${panBefore} -> ${await main.getAttribute("data-pan-x")}`);
await page.keyboard.press("0");

await page.locator('main [data-slot="title"] .folio-text').click();
await page.keyboard.press(`${mod}+a`);
await page.keyboard.press(`${mod}+c`);
const words = await page.evaluate(() => navigator.clipboard.readText());
const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("folio.element-clip") ?? "null")?.name);
check("Ctrl+C inside text copies the words, not the element", words.trim() === "A plot" && kept === "fig:a", `clipboard "${words}", element copy ${kept}`);

await page.goto(`${editor}s003`, { waitUntil: "load" });
await still(page);
const selected = () => page.evaluate(() => [...document.querySelectorAll("[data-element-selected],[data-shape-selected]")].map((e) => e.getAttribute("data-element-selected") ?? e.getAttribute("data-shape-selected")).join(",") || "none");
const inBox = await page.locator('main [data-slot="text:a"] .folio-text').boundingBox();
const stays = [];
for (let i = 0; i < 3; i++) {
  await page.mouse.click(inBox.x + 20 + i * 20, inBox.y + 6);
  await settle(page);
  stays.push(await selected());
}
check("repeated single clicks inside a text box keep it selected (bug 2026-10-13)", stays.every((k) => k === "text:a"), stays.join(" "));
const blank = await page.locator("main .folio-slide").boundingBox();
await page.mouse.click(blank.x + blank.width * 0.8, blank.y + blank.height * 0.8);
await settle(page);
check("a click on the empty slide deselects", (await selected()) === "none", await selected());
await page.getByRole("radio", { name: /^Region/ }).click();
for (const [fx, fy] of [[0.7, 0.7], [0.2, 0.2], [0.6, 0.3]]) await page.mouse.click(blank.x + blank.width * fx, blank.y + blank.height * fy);
await settle(page);
check("the Region tool stays chosen through single clicks on the slide", (await page.locator('[aria-label="Comment tool"] [aria-checked="true"]').getAttribute("title"))?.startsWith("Region"), await page.locator('[aria-label="Comment tool"] [aria-checked="true"]').getAttribute("title"));

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
