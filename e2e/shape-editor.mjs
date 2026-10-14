// Browser check for shapes in the editor (spec/slides/drawing.md, "Shapes in the editor"), on its own
// workspace with one canvas slide on the built-in plain pack: the top row holds only Edit and View; the bottom
// row's Shape tool opens a popover pinned above it whose options (a blue fill) shape the next drag; its
// Rectangle kind draws a box by
// dragging, the Ellipse tool with Shift pressed after the press (Shift before it pans) draws a circle (a square box) while the slide is zoomed, the Arrow
// tool draws an arrow with its ends inside its box; a shape dragged with the Cursor moves by the drag in pt;
// an arrow key nudges it 10 pt with Shift; its corner handle resizes it; the Shape section sets its stroke width and a pack colour by name, and offers an arrow no fill; Delete removes one shape (override and prop) and archives no slide.
// Every step is asserted on the slide file on disk.
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
folio("init-deck", "decks/pitch", "--title", "Pitch");
folio("new", "decks/pitch", "--template", "canvas");
const props = () => JSON.parse(readFileSync(join(root, "decks/pitch/slides/s001.json"), "utf8")).elements.s.props;
const slots = () => props().overrides?.slots ?? {};
const near = (got, want, tol = 1.5) => Array.isArray(got) && got.length === want.length && got.every((v, i) => Math.abs(v - want[i]) <= tol);

const server = await start(root);
const token = server.token("pitch");
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
page.on("response", async (r) => r.request().method() === "PATCH" && !r.ok() && console.log("refused", r.status(), (await r.text()).slice(0, 300)));
await page.goto(`${server.base}/${token}/?slide=s001&mode=edit`, { waitUntil: "load" });
await still(page);
const canvas = await page.evaluate(() => {
  const el = document.querySelector("main .folio-slide");
  return { w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
});

/** The screen point of a canvas point, read from the slide's own box at the time of asking. */
async function screen([x, y]) {
  const box = await page.locator("main .folio-slide").boundingBox();
  return [box.x + (x * box.width) / canvas.w, box.y + (y * box.height) / canvas.h];
}
async function drag(a, b, { shift = false } = {}) {
  const [p, q] = [await screen(a), await screen(b)];
  await page.mouse.move(p[0], p[1]);
  await page.mouse.down();
  await page.mouse.move(p[0] + 2, p[1] + 2);
  if (shift) await page.keyboard.down("Shift");
  for (let i = 1; i <= 5; i++) await page.mouse.move(p[0] + ((q[0] - p[0]) * i) / 5, p[1] + ((q[1] - p[1]) * i) / 5);
  await page.mouse.up();
  if (shift) await page.keyboard.up("Shift");
}
const popover = page.locator('[role="dialog"][aria-label="Shape options"]');
async function tool(kind) {
  const shapeTool = page.getByRole("radio", { name: "Shape", exact: true });
  if ((await shapeTool.getAttribute("aria-checked")) !== "true") await shapeTool.click();
  await popover.getByRole("radio", { name: kind, exact: true }).click();
}

check("the top row holds only Edit and View", (await page.locator('[data-chrome="mode"] [role="radio"]').count()) === 2, `${await page.locator('[data-chrome="mode"] [role="radio"]').count()} radios`);
await page.getByRole("radio", { name: "Shape", exact: true }).click();
const pinned = await (async () => {
  const [pop, button] = [await popover.boundingBox(), await page.locator("[data-shape-tool-button]").boundingBox()];
  return pop && button && pop.y + pop.height <= button.y && Math.abs(pop.x + pop.width / 2 - (button.x + button.width / 2)) < 1 ? { pop, button } : null;
})();
check("the Shape tool opens its popover, pinned above its button, headed Next shape", !!pinned && (await popover.innerText()).startsWith("Next shape"), JSON.stringify(pinned));
await popover.getByRole("button", { name: "Fill: blue", exact: true }).click();

await tool("Rectangle");
await drag([100, 100], [300, 200]);
const rect = await until(() => slots()["shape:a"]);
check("a rectangle dragged on the slide is written as slot shape:a with its box", rect?.role === "shape" && near(rect.box, [100, 100, 200, 100]), JSON.stringify(rect));
check("its content is the kind and the popover's fill for the next shape", props()["shape:a"]?.kind === "rect" && props()["shape:a"]?.fill === "blue", JSON.stringify(props()["shape:a"]));
check("after drawing, the popover stays and edits the new shape", (await popover.getAttribute("data-shape-options")) === "shape:a", await popover.getAttribute("data-shape-options"));
check("the new shape is selected, with eight handles", (await page.locator('[data-shape-selected="shape:a"] [data-shape-handle]').count()) === 8, "handles");

await page.keyboard.press("=");
await settle(page);
await tool("Ellipse");
await drag([400, 120], [480, 150], { shift: true });
const circle = await until(() => slots()["shape:b"]);
check("Shift keeps the ellipse in a square box (a circle), drawn while zoomed", props()["shape:b"]?.kind === "ellipse" && near(circle?.box, [400, 120, 80, 80]), JSON.stringify(circle));
await page.keyboard.press("0");
await still(page);

await page.keyboard.press("Shift+L");
await drag([600, 300], [500, 400]);
const arrow = await until(() => slots()["shape:c"] && props()["shape:c"]);
const arrowBox = slots()["shape:c"]?.box;
check("an arrow keeps its ends inside its box, tail first", arrow?.kind === "arrow" && near(arrowBox, [500, 300, 100, 100]) && near(arrow.from, [100, 0]) && near(arrow.to, [0, 100]), JSON.stringify({ box: arrowBox, ...arrow }));

const before = slots()["shape:a"].box;
await page.keyboard.press("Escape");
check("Escape deselects the shape and the popover closes", (await popover.count()) === 0, `${await popover.count()} popovers`);
await drag([200, 150], [240, 190]);
const movedBox = await until(() => (near(slots()["shape:a"]?.box, [before[0] + 40, before[1] + 40, before[2], before[3]]) ? slots()["shape:a"].box : null));
check("dragging a shape with the Cursor moves it by the drag, in pt", !!movedBox, JSON.stringify(slots()["shape:a"]?.box));
await page.keyboard.press("Shift+ArrowRight");
const nudged = await until(() => (near(slots()["shape:a"]?.box, [before[0] + 50, before[1] + 40, before[2], before[3]], 0.2) ? true : null));
check("Shift+ArrowRight nudges the selected shape 10 pt and keeps the slide", !!nudged && new URL(page.url()).searchParams.get("slide") === "s001", JSON.stringify(slots()["shape:a"]?.box));

// The se handle takes the pointer beyond its corner (handle.x, handle.y) and a resize follows the pointer's travel, so the drag carries the corner by target - corner.
const handle = await page.locator('[data-shape-selected="shape:a"] [data-shape-handle="se"]').boundingBox();
const grip = [handle.x + handle.width / 2, handle.y + handle.height / 2];
await page.mouse.move(grip[0], grip[1]);
await page.mouse.down();
const [toX, toY] = await screen([150 + 200 + 20, 140 + 100 + 30]);
await page.mouse.move(toX + grip[0] - handle.x, toY + grip[1] - handle.y, { steps: 5 });
await page.mouse.up();
const grown = await until(() => (near(slots()["shape:a"]?.box, [150, 140, 220, 130]) ? true : null));
check("the corner handle resizes the shape, the opposite corner staying", !!grown, JSON.stringify(slots()["shape:a"]?.box));
await page.getByLabel("Stroke width in pt").fill("3");
await page.getByLabel("Stroke width in pt").press("Enter");
const styled = await until(() => props()["shape:a"]?.strokeWidth === 3);
check("the popover writes the stroke width into the shape's prop", !!styled, JSON.stringify(props()["shape:a"]));
await popover.getByRole("button", { name: "Fill: green", exact: true }).click();
const named = await until(() => props()["shape:a"]?.fill === "green");
check("a pack colour swatch writes the colour by its name", !!named, JSON.stringify(props()["shape:a"]));
await page.keyboard.press("Escape");
const onArrow = await screen([590, 310]);
await page.mouse.click(onArrow[0], onArrow[1]);
await popover.getByRole("button", { name: "Stroke: red", exact: true }).click();
const arrowStyled = await until(() => props()["shape:c"]?.stroke === "red" && props()["shape:c"]);
check("an arrow offers no fill or text and its prop holds only arrow fields", !!arrowStyled && (await popover.getByRole("group", { name: "Fill" }).count()) === 0 && !("fill" in arrowStyled) && !("text" in arrowStyled), JSON.stringify(arrowStyled));

await page.locator('[data-shape-hit="shape:b"]').click({ force: true });
await page.keyboard.press("Delete");
const deleted = await until(() => !slots()["shape:b"] && !("shape:b" in props()));
check("Delete removes the shape's slot and prop", !!deleted, JSON.stringify(Object.keys(props())));
const left = Object.keys(slots()).sort();
check("the other shapes stay and no slide was archived", left.join() === "shape:a,shape:c" && JSON.parse(readFileSync(join(root, "decks/pitch/deck.json"), "utf8")).order.includes("s001"), left.join());

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
