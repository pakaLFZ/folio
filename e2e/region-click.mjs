// Region tool over a picture (spec/comments/region-comments.md, 2026-10-14): a press-and-drag never
// starts the browser's own native image drag, and a single click takes the picture's slot and opens
// the bubble, exactly as a click on any other slot does; both hold in the single-slide scene and in
// the column view below 100% zoom. Serves its own copy of decks/example.
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";
import { settle, still } from "./lib/page.mjs";

const server = await serve({ decks: ["example"] });
const token = server.token("example");
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => check("no page error", false, e.message));
await page.goto(`${server.base}/${token}/?slide=s002`, { waitUntil: "load" });
await still(page);
await page.keyboard.press("r");
await page.getByRole("radio", { name: /^Region/, checked: true }).waitFor({ timeout: 3000 });

// fig:a's box in the lectern pack is [464, 140, 448, 338] of the 960x540 canvas.
const FIG = { x: 464, y: 140, w: 448, h: 338 };
const bubble = page.locator('[role="dialog"][aria-label="New comment"]');
const regions = () => page.locator("main svg rect[stroke-dasharray]").count();
const watchDragstart = (p) => p.evaluate(() => (window.__drags = 0, addEventListener("dragstart", () => window.__drags++, { capture: true })));
const dragCount = (p) => p.evaluate(() => window.__drags ?? 0);
const closeBubble = async (p) => {
  await p.keyboard.press("Escape");
  await bubble.waitFor({ state: "detached", timeout: 2000 }).catch(() => {});
  await p.keyboard.press("r");
  await p.getByRole("radio", { name: /^Region/, checked: true }).waitFor({ timeout: 2000 });
};

/** Run both checks (a press-drag draws a region with no native drag; a click takes the figure's slot) against a point inside the figure, scaled to `box`. */
async function runAt(p, box, label) {
  const s = box.width / 960;
  const pt = (x, y) => [box.x + x * s, box.y + y * s];
  await watchDragstart(p);
  const before = await regions();
  await p.mouse.move(...pt(FIG.x + 40, FIG.y + 40));
  await p.mouse.down();
  await p.mouse.move(...pt(FIG.x + 70, FIG.y + 40), { steps: 6 });
  await p.mouse.up();
  await settle(p);
  check(`${label}: a press-and-drag over the figure starts no native drag`, (await dragCount(p)) === 0, `dragstart events ${await dragCount(p)}`);
  check(`${label}: a press-and-drag over the figure draws a region`, (await regions()) === before + 1, `regions ${before} -> ${await regions()}`);
  await closeBubble(p);

  await watchDragstart(p);
  const beforeClick = await regions();
  await p.mouse.click(...pt(FIG.x + FIG.w / 2, FIG.y + FIG.h / 2));
  await bubble.waitFor({ timeout: 2000 });
  check(`${label}: a single click starts no native drag`, (await dragCount(p)) === 0, `dragstart events ${await dragCount(p)}`);
  const box2 = await p.locator("main svg rect[stroke-dasharray]").first().boundingBox();
  const want = { x: box.x + FIG.x * s, y: box.y + FIG.y * s, width: FIG.w * s, height: FIG.h * s };
  const close = (a, b) => Math.abs(a - b) < 1.5;
  check(`${label}: a single click on the figure takes its own slot box`, (await regions()) === beforeClick + 1 && close(box2.x, want.x) && close(box2.y, want.y) && close(box2.width, want.width) && close(box2.height, want.height), `got ${JSON.stringify(box2)}, want ${JSON.stringify(want)}`);
  await closeBubble(p);
}

const slide = await page.locator("main .folio-slide").boundingBox();
await runAt(page, slide, "at 100%");

// Zoom out into the scrolling column view, then redo both checks on the current slide there.
await page.mouse.move(slide.x + slide.width / 2, slide.y + slide.height / 2);
await page.keyboard.down("Control");
await page.mouse.wheel(0, 900);
await page.keyboard.up("Control");
await page.waitForSelector("main [data-column-scene]");
await settle(page);
const chip = page.locator('[data-chrome="zoom"]');
check("below 100% shows the column view", (await chip.count()) === 1 && parseInt(await chip.textContent()) < 100, (await chip.textContent())?.trim());
const current = page.locator("main [data-column-slide][data-current]");
const currentBox = await current.boundingBox();
await runAt(page, currentBox, "at 50% (column view)");

await browser.close();
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
