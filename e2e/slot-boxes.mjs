// Browser check for layout slots as boxes (spec/slides/drawing.md, "Layout slots as boxes"), on its own
// workspace with one lectern title slide: the title slot selected by its edge shows the frame with eight
// handles and the move and resize cursors; a drag on its edge moves it, a corner handle resizes it, the arrows
// nudge it, each written as overrides.slots.title.box; a reload keeps it; a click inside still types and saves
// with the handles shown; Escape keeps the box selected and a second Escape deselects; Ctrl+Z and Ctrl+Y undo and
// redo the last nudge; "Reset position and size" in the element menu restores the layout's box and keeps the
// slot's other overrides. Light and dark screenshots of the selected slot are left in the workspace.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { settle, still } from "./lib/page.mjs";
import { bin, start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
folio("init-deck", "decks/d", "--template", "lectern@1", "--title", "D");
folio("new", "decks/d", "--template", "title");
folio("override", "decks/d/s001", "slots.author.text.size=14");
const props = () => JSON.parse(readFileSync(join(root, "decks/d/slides/s001.json"), "utf8")).elements.s.props;
const own = (name) => props().overrides?.slots?.[name] ?? {};
const LAYOUT_BOX = JSON.parse(readFileSync(join(root, "templates/lectern/pack.json"), "utf8")).layouts.title.slots.title.box;
{
  const file = join(root, "title.json");
  execFileSync("node", ["-e", `require("fs").writeFileSync(${JSON.stringify(file)}, JSON.stringify([{ op: "add", path: "/elements/s/props/title", value: "STUDY OF ADSORPTION" }]))`]);
  folio("patch", "decks/d/s001", file);
}

const server = await start(root);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
const url = `${server.base}/${server.token("d")}/?slide=s001&mode=edit`;
await page.goto(url, { waitUntil: "load" });
await still(page);
const edge = () => page.locator('[data-shape-hit="title"]').boundingBox();
const handles = () => page.locator('[data-shape-selected="title"] [data-shape-handle]').count();
const selected = () => page.evaluate(() => document.querySelector("[data-shape-selected],[data-element-selected]")?.getAttribute("data-shape-selected") ?? "none");
const typing = () => page.evaluate(() => document.activeElement?.closest("[data-slot]")?.getAttribute("data-slot") ?? null);
async function drag(from, by, steps = 8) {
  await page.mouse.move(from[0], from[1]);
  await page.mouse.down();
  await page.mouse.move(from[0] + by[0], from[1] + by[1], { steps });
  await page.mouse.up();
}

let e = await edge();
await page.mouse.click(e.x + e.width / 2, e.y + 1);
await settle(page);
check("a click on the title's edge selects its box with eight handles and no caret", (await handles()) === 8 && (await typing()) === null, `${await handles()} handles, caret in ${await typing()}`);
const cursors = await page.evaluate(() => [getComputedStyle(document.querySelector('[data-shape-hit="title"]')).cursor, getComputedStyle(document.querySelector('[data-shape-selected="title"] [data-shape-handle="se"]')).cursor, getComputedStyle(document.querySelector('main [data-slot="title"] .folio-text')).cursor]);
check("move cursor on the edge, resize cursor on a corner, no move cursor on the text", cursors[0] === "move" && cursors[1] === "nwse-resize" && cursors[2] !== "move", cursors.join(" "));

const rectOf = (selector) => page.evaluate((sel) => document.querySelector(sel)?.getBoundingClientRect().toJSON() ?? null, selector);
const frame = await rectOf('[data-shape-selected="title"] [data-shape-frame]');
const slotRect = await rectOf('main [data-slot="title"]');
const within = (a, b) => ["x", "y", "width", "height"].every((k) => Math.abs(a[k] - b[k]) <= 1);
check("the frame lies on the slot's own rect, within 1 px", !!frame && !!slotRect && within(frame, slotRect), `${JSON.stringify(frame)} vs ${JSON.stringify(slotRect)}`);

const textBefore = await rectOf('main [data-slot="title"] .folio-text');
await page.mouse.move(e.x + e.width / 4, e.y + 1);
await page.mouse.down();
await page.mouse.move(e.x + e.width / 4 + 50, e.y + 1 + 30, { steps: 6 });
await settle(page);
const textEscaping = await rectOf('main [data-slot="title"] .folio-text');
await page.keyboard.press("Escape");
await page.mouse.up();
await settle(page);
const textCancelled = await rectOf('main [data-slot="title"] .folio-text');
check("Escape during a drag cancels it: nothing written, the content back in place", !own("title").box && Math.abs(textEscaping.x - textBefore.x - 50) <= 2 && within(textCancelled, textBefore), `${JSON.stringify(own("title"))}, ${textBefore.x} -> ${textEscaping.x} -> ${textCancelled.x}`);

e = await edge();
await page.keyboard.down("Alt");
await page.mouse.move(e.x + e.width / 4, e.y + 1);
await page.mouse.down();
await page.mouse.move(e.x + e.width / 4 + 80, e.y + 1 - 60, { steps: 8 });
await settle(page);
const textMid = await rectOf('main [data-slot="title"] .folio-text');
const unwritten = own("title").box === undefined;
await page.mouse.up();
await page.keyboard.up("Alt");
check("mid-drag, before the release, the text has moved by the drag and nothing is written", Math.abs(textMid.x - textBefore.x - 80) <= 2 && Math.abs(textMid.y - textBefore.y + 60) <= 2 && unwritten, `${textBefore.x},${textBefore.y} -> ${textMid.x},${textMid.y}; written ${!unwritten}`);
const moved = await until(() => own("title").box);
check("dragging the edge moves the box, its size kept", !!moved && moved[0] > LAYOUT_BOX[0] + 20 && moved[1] < LAYOUT_BOX[1] - 20 && moved[2] === LAYOUT_BOX[2] && moved[3] === LAYOUT_BOX[3], JSON.stringify(moved));
const left = await page.evaluate(() => parseFloat(document.querySelector('main [data-slot="title"]').style.left));
check("the slot is drawn at the new box", Math.abs(left - moved[0]) < 0.05, `${left} vs ${moved?.[0]}`);

const se = await page.locator('[data-shape-selected="title"] [data-shape-handle="se"]').boundingBox();
const tallBefore = (await rectOf('main [data-slot="title"] .folio-text')).height;
await page.keyboard.down("Alt");
await page.mouse.move(se.x + se.width / 2, se.y + se.height / 2);
await page.mouse.down();
await page.mouse.move(se.x + se.width / 2 - 300, se.y + se.height / 2 + 40, { steps: 8 });
await settle(page);
const tallMid = (await rectOf('main [data-slot="title"] .folio-text')).height;
await page.mouse.up();
await page.keyboard.up("Alt");
check("a resize reflows the text mid-drag", tallMid > tallBefore + 10, `${tallBefore} -> ${tallMid} px`);
const resized = await until(() => (own("title").box?.[2] < moved[2] - 20 ? own("title").box : null));
check("a corner handle resizes both sides, the opposite corner kept", !!resized && resized[0] === moved[0] && resized[1] === moved[1] && resized[3] > moved[3] + 10, JSON.stringify(resized));
const size = await page.evaluate(() => getComputedStyle(document.querySelector('main [data-slot="title"] .folio-text')).fontSize);

await page.keyboard.press("ArrowRight");
await until(() => own("title").box?.[0] === Math.round((resized[0] + 1) * 10) / 10);
await page.keyboard.press("Shift+ArrowDown");
const nudged = await until(() => (own("title").box?.[1] === Math.round((resized[1] + 10) * 10) / 10 ? own("title").box : null));
check("ArrowRight nudges 1 pt and Shift+ArrowDown 10 pt", !!nudged && nudged[0] === Math.round((resized[0] + 1) * 10) / 10, JSON.stringify(own("title").box));
check("the font size is not changed by resizing", (await page.evaluate(() => getComputedStyle(document.querySelector('main [data-slot="title"] .folio-text')).fontSize)) === size && own("title").text === undefined, size);

await page.keyboard.press("ControlOrMeta+z");
const undone = await until(() => (own("title").box?.[1] === Math.round((resized[1]) * 10) / 10 ? own("title").box : null));
check("Ctrl+Z undoes the last nudge", !!undone, JSON.stringify(own("title").box));
await page.keyboard.press("ControlOrMeta+y");
const redone = await until(() => (own("title").box?.[1] === nudged?.[1] ? own("title").box : null));
check("Ctrl+Y redoes it", !!redone, JSON.stringify(own("title").box));

await page.reload({ waitUntil: "load" });
await still(page);
const after = await page.evaluate(() => ["left", "top", "width", "height"].map((k) => parseFloat(document.querySelector('main [data-slot="title"]').style[k])));
check("after a reload the slot keeps its box (the override on disk)", JSON.stringify(after) === JSON.stringify(own("title").box), `${JSON.stringify(after)} vs ${JSON.stringify(own("title").box)}`);

const text = await page.locator('main [data-slot="title"] .folio-text').boundingBox();
await page.mouse.click(text.x + text.width - 4, text.y + text.height / 2);
await page.keyboard.press(process.platform === "darwin" ? "Meta+ArrowDown" : "Control+End");
await page.keyboard.type(" (REVISED)");
check("a click inside the text types into it, with the frame and handles shown", (await typing()) === "title" && (await handles()) === 8, `${await typing()}, ${await handles()} handles`);
await page.screenshot({ path: join(root, "slot-selected-light.png") });
await page.keyboard.press("ControlOrMeta+s");
const saved = await until(() => props().title === "STUDY OF ADSORPTION (REVISED)");
check("the typed text is saved", !!saved, JSON.stringify(props().title));

await page.mouse.click(text.x + 10, text.y + text.height / 2);
await page.keyboard.press("Escape");
await settle(page);
check("Escape leaves the text with the box still selected", (await typing()) === null && (await selected()) === "title", `${await typing()}, ${await selected()}`);
await page.keyboard.press("Enter");
check("Enter puts the caret back in the selected text", (await typing()) === "title", String(await typing()));
await page.keyboard.press("Escape");
await page.keyboard.press("Escape");
await settle(page);
check("a second Escape deselects", (await selected()) === "none", await selected());

e = await edge();
await page.mouse.click(e.x + e.width / 2, e.y + 1, { button: "right" });
const menu = page.locator('[role="menu"][aria-label="Element actions"]');
await menu.getByRole("menuitem", { name: /Reset position and size/ }).click();
const reset = await until(() => !own("title").box);
check("Reset position and size removes only the box override", !!reset && own("author").text?.size === 14, JSON.stringify(props().overrides));
const back = await until(() => page.evaluate((x) => Math.abs(parseFloat(document.querySelector('main [data-slot="title"]').style.left) - x) < 0.05, LAYOUT_BOX[0]));
check("the slot is drawn at the layout's box again", !!back, String(back));

const author = await page.locator('[data-shape-hit="author"]').boundingBox();
await page.mouse.click(author.x + author.width / 4, author.y + 1);
await settle(page);
await page.screenshot({ path: join(root, "slot-beside-overflow-light.png") });
e = await edge();
await page.mouse.click(e.x + e.width / 2, e.y + 1);
await page.evaluate(() => localStorage.setItem("folio-theme", "dark"));
await page.reload({ waitUntil: "load" });
await still(page);
e = await edge();
await page.mouse.click(e.x + e.width / 2, e.y + 1);
await settle(page);
await page.screenshot({ path: join(root, "slot-selected-dark.png") });
console.log(`screenshots: ${join(root, "slot-selected-light.png")} ${join(root, "slot-selected-dark.png")}`);

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
