// Browser check for text boxes in the editor (spec/slides/drawing.md, "Text boxes in the editor" and
// "Alignment help"), on its own workspace with one canvas slide on the built-in plain pack and one text box an
// agent added with `folio text add`: the Text box tool opens its popover above it; the options set there (size,
// colour, background, border) go into the next box drawn; a box drawn 2 pt right of the agent's box's left edge
// lands exactly on it; the caret is in the new box and Ctrl+S saves what was typed; with the box selected the
// popover edits it; dragging its edge moves it; Escape then Delete removes its slot and its words. Every step is
// asserted on the slide file on disk.
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
folio("init-deck", "decks/pitch", "--title", "Pitch");
folio("new", "decks/pitch", "--template", "canvas");
const added = folio("text", "add", "decks/pitch/s001", "--box", "100,100,300,60", "--text", "Agent note", "--fill", "light").trim();
check("folio text add prints the new slot", added === "text:a", added);
const props = () => JSON.parse(readFileSync(join(root, "decks/pitch/slides/s001.json"), "utf8")).elements.s.props;
const slots = () => props().overrides?.slots ?? {};

const server = await start(root);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${server.base}/${server.token("pitch")}/?slide=s001&mode=edit`, { waitUntil: "load" });
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
const popover = page.locator('[role="dialog"][aria-label="Text box options"]');

await page.getByRole("radio", { name: "Text box", exact: true }).click();
check("the Text box tool opens its popover, headed Next text box", (await popover.count()) === 1 && (await popover.innerText()).startsWith("Next text box"), await popover.innerText().catch(() => "none"));
await popover.getByLabel("Font size in pt").fill("20");
await popover.getByLabel("Font size in pt").press("Enter");
await popover.getByRole("button", { name: "Text colour: red", exact: true }).click();
await popover.getByRole("button", { name: "Background: light", exact: true }).click();
await popover.getByRole("button", { name: "Border: blue", exact: true }).click();

await drag([102, 250], [300, 320]);
const made = await until(() => slots()["text:b"]);
check("a box drawn 2 pt right of another's left edge snaps onto it", made?.box?.[0] === 100 && made.box[1] === 250, JSON.stringify(made?.box));
check("the next box takes the popover's size, colour, background and border", made?.role === "body" && made.text?.size === 20 && made.text?.color === "red" && made.fill === "light" && made.border?.color === "blue" && made.padding === 4, JSON.stringify(made));
const focused = await until(() => page.evaluate(() => document.activeElement?.closest("[data-slot]")?.getAttribute("data-slot")));
check("the caret is in the new box", focused === "text:b", String(focused));
await page.keyboard.type("Hello box");
await page.keyboard.press("ControlOrMeta+s");
const typed = await until(() => props()["text:b"] === "Hello box");
check("what is typed is saved as the box's words", !!typed, JSON.stringify(props()["text:b"]));
check("with the box selected the popover edits it", (await popover.getAttribute("data-text-options")) === "text:b", await popover.getAttribute("data-text-options"));
await popover.getByLabel("Font size in pt").fill("24");
await popover.getByLabel("Font size in pt").press("Enter");
const resized = await until(() => slots()["text:b"]?.text?.size === 24);
check("the popover writes the selected box's font size", !!resized, JSON.stringify(slots()["text:b"]?.text));

await page.keyboard.press("Escape");
await page.locator("main .folio-slide").click({ position: { x: 5, y: 5 } });
const before = slots()["text:b"].box;
const edge = await page.locator('[data-shape-hit="text:b"]').boundingBox();
await page.mouse.move(edge.x + edge.width / 2, edge.y + 1);
await page.mouse.down();
await page.mouse.move(edge.x + edge.width / 2 + 120, edge.y + 1, { steps: 6 });
await page.mouse.up();
const movedBox = await until(() => (slots()["text:b"]?.box?.[0] > before[0] + 20 ? slots()["text:b"].box : null));
check("dragging the box's edge moves it, the words kept", !!movedBox && movedBox[2] === before[2] && props()["text:b"] === "Hello box", JSON.stringify(slots()["text:b"]?.box));
await page.keyboard.press("Delete");
const gone = await until(() => !slots()["text:b"] && !("text:b" in props()));
check("Delete removes the selected box's slot and words, and the agent's box stays", !!gone && !!slots()["text:a"], JSON.stringify(Object.keys(slots())));

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
