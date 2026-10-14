// Browser check for blocks in the editor (spec/slides/blocks.md, "Editor"), on its own workspace with one canvas
// slide on the built-in plain pack. The Text box tool's popover lists the pack's block styles; with Card picked a
// drag draws block:a in style card, the caret is in it and what is typed is saved; with Code and rust picked a
// drag draws block:b holding rust code, a click opens its text area and leaving it saves the code with its
// language; the selected block's popover changes its style; Escape then Delete removes it. With the CPU slowed
// six times, a block and a text box each take every character typed straight after the drag's release. Every
// step is asserted on the slide file on disk.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { still } from "./lib/page.mjs";
import { bin, start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
folio("init-deck", "decks/d", "--title", "Blocks");
folio("new", "decks/d", "--template", "canvas");
const props = () => JSON.parse(readFileSync(join(root, "decks/d/slides/s001.json"), "utf8")).elements.s.props;
const slots = () => props().overrides?.slots ?? {};

const server = await start(root);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${server.base}/${server.token("d")}/?slide=s001&mode=edit`, { waitUntil: "load" });
await still(page);
const canvas = await page.evaluate(() => {
  const el = document.querySelector("main .folio-slide");
  return { w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
});
async function screen([x, y]) {
  const box = await page.locator("main .folio-slide").boundingBox();
  return [box.x + (x * box.width) / canvas.w, box.y + (y * box.height) / canvas.h];
}
async function drag(a, b) {
  const [p, q] = [await screen(a), await screen(b)];
  await page.mouse.move(p[0], p[1]);
  await page.mouse.down();
  await page.mouse.move(q[0], q[1], { steps: 6 });
  await page.mouse.up();
}
const popover = page.locator('[role="dialog"][data-tool-options]');
async function pick(control, option) {
  await popover.getByRole("button", { name: new RegExp(`^${control}:`) }).click();
  await page.getByRole("menuitemradio", { name: option, exact: true }).click();
}

await page.getByRole("radio", { name: "Text box", exact: true }).click();
await pick("Block style", "Card");
check("the Text box tool's popover lists the pack's block styles and heads Next block", (await popover.innerText()).startsWith("Next block"), (await popover.innerText()).split("\n")[0]);
await drag([80, 60], [600, 200]);
const card = await until(() => slots()["block:a"]);
check("a drag with Card picked draws block:a in style card", card?.role === "block" && card.style === "card", JSON.stringify(card));
check("a block drawn in the editor is a draft (spec/slides/drafts.md), dashed and tagged", card?.draft === true && (await until(() => page.locator('main [data-draft="block:a"]').count())) === 1, JSON.stringify(card?.draft));
await until(() => page.evaluate(() => document.activeElement?.closest('[data-slot="block:a"]') !== null));
await page.keyboard.type("Typed into the card");
await page.keyboard.press("ControlOrMeta+s");
const typed = await until(() => props()["block:a"]);
check("the caret is in the new block and what is typed is saved", typed === "Typed into the card", JSON.stringify(typed));

await page.keyboard.press("Escape");
await page.getByRole("radio", { name: "Text box", exact: true }).click();
await pick("Block style", "Code (code)");
await pick("Code language", "rust");
await drag([80, 300], [600, 460]);
const code = await until(() => slots()["block:b"]);
check("a drag with Code and rust picked draws block:b holding rust", code?.style === "code" && props()["block:b"]?.language === "rust", JSON.stringify(props()["block:b"]));
await page.locator('main [data-slot="block:b"] .folio-code').click();
const area = page.getByLabel("Code of block:b");
await area.fill("fn main() {\n    let x = 1;\n}");
await area.press("ControlOrMeta+s");
const saved = await until(() => (props()["block:b"]?.code ? props()["block:b"] : null));
check("the code text area saves the code and keeps its language", saved?.code === "fn main() {\n    let x = 1;\n}" && saved.language === "rust", JSON.stringify(saved));

await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("Escape");
const band = await screen([80, 300]);
await page.mouse.click(band[0] - 4, band[1] - 4);
const selected = await until(async () => (await popover.innerText().catch(() => "")).startsWith("Block b"));
check("selecting the block shows its own popover", !!selected, await popover.innerText().catch(() => "none"));
await pick("Block style", "Card");
const restyled = await until(() => slots()["block:b"]?.style === "card");
check("the popover changes the block's style, its code becoming its text", !!restyled && props()["block:b"] === "fn main() {\n    let x = 1;\n}", JSON.stringify(props()["block:b"]));
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("Delete");
const gone = await until(() => !slots()["block:b"] && !("block:b" in props()));
check("Delete removes the selected block's slot and its content", !!gone, JSON.stringify(Object.keys(slots())));

const cdp = await page.context().newCDPSession(page);
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 6 });
for (const [label, x, prefix] of [["a block", 620, "block:"], ["a text box", 780, "text:"]]) {
  await page.keyboard.press("Escape");
  await page.getByRole("radio", { name: "Text box", exact: true }).click();
  await pick("Block style", prefix === "block:" ? "Card" : "Text box");
  const before = new Set(Object.keys(slots()));
  await drag([x, 300], [x + 120, 400]);
  await page.keyboard.type("Typed at once");
  const slot = await until(() => Object.keys(slots()).find((k) => k.startsWith(prefix) && !before.has(k)), 15000);
  const box = page.locator(`main [data-slot="${slot}"] .folio-text`);
  await until(async () => (await box.count()) && (await box.innerText()).trim().length >= "Typed at once".length - 1, 15000);
  await page.keyboard.press("ControlOrMeta+s");
  const got = await until(() => props()[slot], 15000);
  check(`under a 6x slower CPU, ${label} keeps every character typed straight after the release`, got === "Typed at once", JSON.stringify(got));
}
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
