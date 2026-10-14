// Browser check for slot placeholders: a freshly inserted three-figures slide shows each text slot's
// placeholder faintly in the slot's own font and size, and each empty figure a centred prompt with its
// size; the placeholder goes on the first keystroke and comes back when the slot is emptied; it is never
// saved into the slide JSON nor counted for overflow; View mode and the print page show none of it; the
// rail thumbnail shows it. The inserted slide is archived at the end.
// Serves its own copy of decks/example-b.
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { serve, until } from "./lib/server.mjs";
import { settle } from "./lib/page.mjs";
const server = await serve({ decks: ["example-b"] });
const deck = server.deckDir("example-b");
const editor = `${server.base}/${server.token("example-b")}/`;
const orderOf = () => JSON.parse(readFileSync(`${deck}/deck.json`, "utf8")).order;
const slideText = (id) => readFileSync(`${deck}/slides/${id}.json`, "utf8");
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
const writes = [];
page.on("request", (r) => r.method() !== "GET" && writes.push(r.response().catch(() => null)));
await page.goto(`${editor}?slide=s001`, { waitUntil: "load" });
await page.getByRole("button", { name: "Insert three-figures slide" }).waitFor();
const railToggle = page.getByRole("button", { name: "Toggle slides" });
if ((await railToggle.getAttribute("aria-expanded")) !== "true") await railToggle.click();
await page.locator("nav button[data-rail-slide]").first().waitFor();
const before = orderOf();
await page.getByRole("button", { name: "Insert three-figures slide" }).click();
await page.waitForFunction((n) => document.querySelectorAll("nav button[draggable]").length === n, before.length + 1, { timeout: 5000 }).catch(() => {});
const id = await until(() => orderOf().find((s) => !before.includes(s)));
await page.locator(`nav button[data-rail-slide="${id}"][aria-current="page"]`).waitFor({ state: "attached" });
await page.locator('main [data-slot="title"] .folio-text[data-empty]').waitFor();

const title = page.locator('main [data-slot="title"] .folio-text');
const look = () => title.evaluate((el) => {
  const ph = getComputedStyle(el, "::before");
  const own = getComputedStyle(el);
  return { empty: el.hasAttribute("data-empty"), content: ph.content, opacity: Number(ph.opacity), sameFont: ph.fontSize === own.fontSize && ph.fontFamily === own.fontFamily && ph.textTransform === own.textTransform };
});
const fresh = await look();
check("title shows its placeholder", fresh.empty && fresh.content === '"Title of the slide"', `content ${fresh.content}`);
check("placeholder is faint, in the slot's font", fresh.opacity >= 0.35 && fresh.opacity <= 0.45 && fresh.sameFont, JSON.stringify(fresh));
const figure = await page.locator('main [data-slot="fig:a"]').innerText();
check("empty figure shows a prompt and its size", /Figure a/.test(figure) && /290\.9 x 239 pt/.test(figure), JSON.stringify(figure));
const overflowing = await page.locator("main [data-overflow]").count();
check("placeholders are not counted for overflow", overflowing === 0, `${overflowing} slots marked overflowing`);

await title.click();
const caret = await page.evaluate(() => getSelection()?.anchorOffset);
await page.keyboard.type("X");
const typed = await look();
check("first keystroke hides the placeholder", !typed.empty && typed.content === "none", `caret ${caret}, content ${typed.content}`);
await page.keyboard.press("Backspace");
const emptied = await look();
check("emptied slot shows it again", emptied.empty && emptied.content === '"Title of the slide"', `content ${emptied.content}`);
await page.locator("main").click({ position: { x: 5, y: 5 } });
await page.waitForFunction(() => !document.activeElement?.closest('[data-slot="title"]'));
await settle(page);
await Promise.all(writes);
const saved = slideText(id);
check("placeholder never saved", !/Title of the slide|Figure a|One-line caption/.test(saved), saved.replace(/\s+/g, " ").slice(0, 200));

const thumb = await page.locator('nav button[aria-current="page"] [data-placeholder]').filter({ visible: true }).count();
check("rail thumbnail shows placeholders", thumb > 0, `${thumb} placeholders in the current thumbnail`);

await page.locator('[aria-label="Mode"] [title^="Look without"]').click();
await page.locator('[aria-label="Mode"] [title^="Look without"][aria-checked="true"]').waitFor();
await settle(page);
const inView = await page.locator("main [data-placeholder]").count();
const viewText = await page.locator("main").innerText();
check("View shows no placeholder", inView === 0 && !/Figure a|290\.9 x 239/.test(viewText), `${inView} placeholders`);

const print = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await print.goto(`${editor}?print=1&slides=${id}`, { waitUntil: "load" });
await print.locator(".folio-slide").first().waitFor();
await print.evaluate(() => document.fonts.ready);
await settle(print);
const inPrint = await print.locator("[data-placeholder]").count();
const printText = await print.locator("body").innerText();
check("print page shows no placeholder", inPrint === 0 && !/Title of the slide|Figure a/.test(printText), `${inPrint} placeholders`);
await print.close();

await page.locator('[aria-label="Mode"] [title^="Type into"]').click();
await page.locator(`nav button[data-rail-slide="${id}"]`).click();
await page.keyboard.press("Delete");
const day = new Date().toISOString().slice(0, 10);
await until(() => !orderOf().includes(id) && existsSync(`${deck}/slides/.archive/${day}/${id}.json`));
check("inserted slide archived", !orderOf().includes(id), `order ${orderOf().join(",")}`);
await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
