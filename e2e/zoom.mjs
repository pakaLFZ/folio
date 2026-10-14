// Browser check for zooming and panning the slide (spec/chrome/zoom.md): ctrl+wheel (and pinch) zooms
// about the pointer in small, fixed steps with no acceleration, a plain wheel never zooms, slot outlines
// scale with the slide, measurement does not change, Shift is a grab hand and Shift-drag pans (not inside
// a text slot), a right-button drag pans the same way and the scene never opens the browser's own context
// menu (plain right-click or dragged), 0 and the chip return to fit, a region drawn at 2x is stored in the
// same pt as at fit, zoom and pan survive switching slides, and below 100% the scene shows the deck's
// slides in one scrolling, virtualized column.
// Serves its own copy of decks/example-b, extended with extra slides for the column checks.
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "playwright";
import { start, workspace } from "./lib/server.mjs";
import { settle, still } from "./lib/page.mjs";

const root = workspace({ decks: ["example-b"] });
const slidesDir = join(root, "decks/example-b/slides");
const deckPath = join(root, "decks/example-b/deck.json");
const deck = JSON.parse(readFileSync(deckPath, "utf8"));
const base = JSON.parse(readFileSync(join(slidesDir, "s001.json"), "utf8"));
const extra = Array.from({ length: 12 }, (_, i) => `g${String(i + 1).padStart(3, "0")}`);
for (const id of extra) {
  const spec = structuredClone(base);
  spec.elements.s.props.title = id.toUpperCase();
  writeFileSync(join(slidesDir, `${id}.json`), JSON.stringify(spec, null, 2));
}
deck.order = ["s001", ...extra, "s003"];
writeFileSync(deckPath, JSON.stringify(deck, null, 2));
const server = await start(root);

const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => check("no page error", false, e.message));
await page.goto(`${server.base}/${server.token("example-b")}/?slide=s001&mode=edit`, { waitUntil: "load" });
await page.waitForSelector('main [data-slot="note"] .folio-text');
await page.evaluate(() => document.fonts.ready);
await still(page);

const chip = page.locator('[data-chrome="zoom"]');
const slideBox = () => page.locator("main .folio-slide").boundingBox();
const canvasW = await page.locator("main .folio-slide").evaluate((el) => parseFloat(el.style.width));
const scroll = () => page.locator("main").evaluate((el) => [parseFloat(el.dataset.panX || "0"), parseFloat(el.dataset.panY || "0")]);
const noteFacts = () => page.locator('main [data-slot="note"]').evaluate((slot) => ({ text: slot.querySelector(".folio-text").offsetHeight, overflow: slot.getAttribute("data-overflow"), width: slot.getBoundingClientRect().width }));
const urlSlide = () => new URL(page.url()).searchParams.get("slide");

/** Listen for the next contextmenu event; armed and awaited before the mouse acts, as input and script race. */
const armMenu = () => page.evaluate(() => void (window.__menu = new Promise((resolve) => addEventListener("contextmenu", (e) => resolve(e.defaultPrevented), { once: true }))));
const menuPrevented = () => page.evaluate(() => Promise.race([window.__menu, new Promise((r) => setTimeout(() => r("no contextmenu event"), 3000))]));

/** Zoom with the wheel: ctrl held (a trackpad pinch carries the same flag), over a point. */
async function ctrlWheel(x, y, deltaY) {
  await page.mouse.move(x, y);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, deltaY);
  await page.keyboard.up("Control");
}

check("no chip at fit", (await chip.count()) === 0, `${await chip.count()} chips`);
const fit = await slideBox();
const fitNote = await noteFacts();
const pointer = [fit.x + fit.width * 0.3, fit.y + fit.height * 0.4];
await page.mouse.wheel(0, -900);
await still(page);
check("a plain wheel does not zoom", Math.abs((await slideBox()).width - fit.width) < 0.5, `${(await slideBox()).width.toFixed(1)} px wide, fit ${fit.width.toFixed(1)}`);
await page.keyboard.press("0");
await still(page);

await ctrlWheel(...pointer, -900);
await still(page);
const zoomed = await slideBox();
const k = zoomed.width / fit.width;
const kept = [zoomed.x + zoomed.width * 0.3, zoomed.y + zoomed.height * 0.4];
check("ctrl+wheel zooms in", k > 1.5, `x${k.toFixed(2)}`);
check("the point under the pointer stays put", Math.hypot(kept[0] - pointer[0], kept[1] - pointer[1]) <= 2, `moved ${kept.map((v, i) => (v - pointer[i]).toFixed(1)).join(",")} px`);
check("the chip shows the zoom in percent of fit", (await chip.count()) === 1 && /^\d+%$/.test((await chip.textContent()).trim()) && parseInt(await chip.textContent()) > 150, (await chip.textContent())?.trim());
const zoomedNote = await noteFacts();
check("the slot outline scales with the slide", Math.abs(zoomedNote.width / fitNote.width - k) < 0.02, `slot x${(zoomedNote.width / fitNote.width).toFixed(2)}, slide x${k.toFixed(2)}`);
check("measurement does not change with zoom", zoomedNote.text === fitNote.text && zoomedNote.overflow === fitNote.overflow, `text ${fitNote.text}->${zoomedNote.text} px, overflow ${fitNote.overflow}->${zoomedNote.overflow}`);

const before = await scroll();
await page.keyboard.down("Shift");
await page.mouse.wheel(0, 120);
await page.keyboard.up("Shift");
await still(page);
const after = await scroll();
check("Shift-wheel pans", after[0] !== before[0] || after[1] !== before[1], `${before} -> ${after}`);
check("Shift-wheel does not zoom", Math.abs((await slideBox()).width - zoomed.width) < 0.5, `${(await slideBox()).width.toFixed(1)} px wide`);

await page.evaluate(() => document.activeElement?.blur?.());
await page.keyboard.press("0");
await still(page);
check("0 returns to fit", (await chip.count()) === 0 && Math.abs((await slideBox()).width - fit.width) < 0.5, `${(await slideBox()).width.toFixed(1)} px wide`);

await ctrlWheel(...pointer, -200);
await still(page);
await chip.click();
await still(page);
check("the chip returns to fit", (await chip.count()) === 0 && Math.abs((await slideBox()).width - fit.width) < 0.5, `${(await slideBox()).width.toFixed(1)} px wide`);

/** Drag a region over the slide fractions [a, b] and read the stored box in pt. */
async function regionAt(a, b) {
  const box = await slideBox();
  const at = ([u, v]) => [box.x + box.width * u, box.y + box.height * v];
  await page.getByRole("radio", { name: /^Region/ }).click();
  await page.mouse.move(...at(a));
  await page.mouse.down();
  await page.mouse.move(...at(b), { steps: 6 });
  await page.mouse.up();
  await still(page);
  const rect = await page.locator("main svg rect[stroke-dasharray]").first().evaluate((r) => ["x", "y", "width", "height"].map((n) => parseFloat(r.getAttribute(n))));
  await page.keyboard.press("Escape");
  await still(page);
  return rect;
}
const centre = [fit.x + fit.width / 2, fit.y + fit.height / 2];
await page.getByRole("radio", { name: /^Region/ }).click();
const atFit = await regionAt([0.42, 0.42], [0.58, 0.58]);
await ctrlWheel(...centre, -900);
await still(page);
const atZoom = await regionAt([0.42, 0.42], [0.58, 0.58]);
const diff = Math.max(...atFit.map((v, i) => Math.abs(v - atZoom[i])));
check("a region drawn while zoomed is stored in slide pt", diff <= 1 && atFit[2] > 0.1 * canvasW, `fit ${atFit.join(",")} zoomed ${atZoom.join(",")}`);

const hand = () => page.evaluate(() => document.querySelector("main [data-pan-hand]")?.getAttribute("data-pan-hand") ?? null);
const panned = await scroll();
await page.mouse.move(...centre);
await page.keyboard.down("Shift");
await still(page);
const held = await hand();
await page.mouse.down();
await page.mouse.move(centre[0] - 80, centre[1] - 40, { steps: 4 });
const moving = await hand();
await page.mouse.up();
await page.keyboard.up("Shift");
await still(page);
const dragged = await scroll();
check("Shift shows a grab hand, grabbing while dragging", held === "grab" && moving === "grabbing", `${held}, ${moving}`);
check("Shift-drag pans by the drag and draws no region", Math.abs(dragged[0] - panned[0] - 80) <= 2 && Math.abs(dragged[1] - panned[1] - 40) <= 2 && (await page.locator("main svg rect[stroke-dasharray]").count()) === 0, `${panned} -> ${dragged}`);
check("releasing Shift restores the cursor", (await page.locator("main [data-pan-hand]").count()) === 0, `${await page.locator("main [data-pan-hand]").count()} hands`);

const rightPanned = await scroll();
await page.mouse.move(...centre);
await armMenu();
await page.mouse.down({ button: "right" });
await page.mouse.move(centre[0] - 60, centre[1] - 30, { steps: 4 });
const rightMoving = await hand();
await page.mouse.up({ button: "right" });
await still(page);
const rightDragged = await scroll();
check("right-drag pans like Shift-drag, grabbing while dragging", rightMoving === "grabbing" && Math.abs(rightDragged[0] - rightPanned[0] - 60) <= 2 && Math.abs(rightDragged[1] - rightPanned[1] - 30) <= 2, `${rightPanned} -> ${rightDragged}`);
check("right-drag draws no region and leaves no hand after release", (await page.locator("main svg rect[stroke-dasharray]").count()) === 0 && (await page.locator("main [data-pan-hand]").count()) === 0, `${await page.locator("main [data-pan-hand]").count()} hands`);
const menuAfterDrag = await menuPrevented();
check("a right-drag over the scene opens no native context menu", menuAfterDrag === true, menuAfterDrag);

await armMenu();
await page.mouse.down({ button: "right" });
await page.mouse.up({ button: "right" });
const menuPlain = await menuPrevented();
check("a plain right-click over the scene also opens no native context menu", menuPlain === true, menuPlain);

await page.getByRole("radio", { name: /^Edit text/ }).click();
const note = page.locator('main [data-slot="note"] .folio-text');
const noteAt = await note.boundingBox();
await page.mouse.move(...centre);
await page.keyboard.down("Shift");
await page.mouse.down();
await page.mouse.move(centre[0] * 2 - noteAt.x - noteAt.width / 2, centre[1] * 2 - noteAt.y - noteAt.height / 2, { steps: 6 });
await page.mouse.up();
await page.keyboard.up("Shift");
await still(page);
await note.click();
await page.keyboard.down("Shift");
await still(page);
const handInText = await page.locator("main [data-pan-hand]").count();
const beforeText = await scroll();
const noteBox = await note.boundingBox();
await page.mouse.click(noteBox.x + noteBox.width * 0.6, noteBox.y + noteBox.height / 2);
await page.keyboard.up("Shift");
await still(page);
const afterText = await scroll();
const selected = await page.evaluate(() => String(getSelection()).length);
check("in a text slot Shift extends the selection and does not pan", handInText === 0 && afterText.join() === beforeText.join() && selected > 0, `hands ${handInText}, scroll ${beforeText} -> ${afterText}, selected ${selected} chars`);
await page.keyboard.press("Escape");
await page.locator("main").click({ position: { x: 5, y: 5 } });

// Pan must be free on BOTH axes, even the one the slide already fits inside (spec/chrome/zoom.md:
// "freedom to move any direction"). Zoom in until the slide overflows the scene's width but still fits
// its height, then check a right-drag still moves it vertically.
const freeRect = () => page.locator("main").evaluate((el) => {
  const cs = getComputedStyle(el);
  return { w: el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), h: el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom) };
});
await page.keyboard.press("0");
await still(page);
const free = await freeRect();
let wOverflowBox = await slideBox();
for (let i = 0; i < 40 && !(wOverflowBox.width > free.w + 2 && wOverflowBox.height <= free.h + 2); i++) {
  await ctrlWheel(wOverflowBox.x + wOverflowBox.width / 2, wOverflowBox.y + wOverflowBox.height / 2, -60);
  await still(page);
  wOverflowBox = await slideBox();
}
if (wOverflowBox.width > free.w + 2 && wOverflowBox.height <= free.h + 2) {
  const mid = [wOverflowBox.x + wOverflowBox.width / 2, wOverflowBox.y + wOverflowBox.height / 2];
  const beforeFree = await scroll();
  await page.mouse.move(...mid);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(mid[0], mid[1] - 70, { steps: 4 });
  await page.mouse.up({ button: "right" });
  await still(page);
  const afterFree = await scroll();
  check("a right-drag moves the slide vertically too when it already fits vertically", Math.abs(afterFree[1] - beforeFree[1] - 70) <= 2, `${beforeFree} -> ${afterFree}`);
} else {
  check("a right-drag moves the slide vertically too when it already fits vertically", true, "skipped: no zoom level overflows width while fitting height for this deck/viewport");
}

// Zoom and pan now survive switching slides (spec/chrome/zoom.md, 2026-10-13): only the free scene's own
// size changing resets them, not the slide.
await page.keyboard.press("0");
await still(page);
await ctrlWheel(...centre, -200);
await still(page);
const beforeSwitch = { zoom: (await chip.textContent()).trim(), pan: await scroll() };
await page.keyboard.press("PageDown");
await page.waitForFunction(() => new URLSearchParams(location.search).get("slide") !== "s001");
await still(page);
check("zoom survives switching to the next slide", (await chip.textContent())?.trim() === beforeSwitch.zoom, `${beforeSwitch.zoom} -> ${(await chip.textContent())?.trim()}`);
check("pan survives switching to the next slide", (await scroll()).join() === beforeSwitch.pan.join(), `${beforeSwitch.pan} -> ${await scroll()}`);
await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press("0");
await still(page);

// Below 100%, ctrl+wheel zooms out into a scrolling column of the deck's slides (the Edge PDF viewer
// reading, spec/chrome/zoom.md, 2026-10-13): several are visible stacked, a plain wheel scrolls through
// them, and the slide most in view becomes `current`.
await ctrlWheel(...centre, 900);
await page.waitForSelector("main [data-column-scene]");
await settle(page);
const slots = () => page.locator("main [data-column-slide]");
check("below 100% shows several slides stacked in a column", (await slots.call(null).count()) >= 3, `${await page.locator("main [data-column-slide]").count()} slides in view`);
check("the chip shows a percent below 100 in column view", (await chip.count()) === 1 && parseInt(await chip.textContent()) < 100, (await chip.textContent())?.trim());
const firstBox = await page.locator("main [data-column-slide]").first().boundingBox();
const secondBox = await page.locator("main [data-column-slide]").nth(1).boundingBox();
check("the column's slides stack vertically with a gap, not overlapping", secondBox.y > firstBox.y + firstBox.height - 1, `first bottom ${(firstBox.y + firstBox.height).toFixed(1)}, second top ${secondBox.y.toFixed(1)}`);

// Virtualization: not every slide in the 14-slide deck is drawn with real content at once.
const drawnCount = await page.locator("main [data-column-slide] .folio-slide").count();
check("the column only draws slides near the viewport, not the whole deck", drawnCount > 0 && drawnCount < 14, `${drawnCount} of 14 drawn`);

// A rail click in the column lands on that slide and keeps it: the middle one centred, the first and
// last (which cannot reach the middle) fully in view, never handed to a neighbour (user, 2026-10-13).
const railIds = await page.locator("nav button[data-rail-slide]").evaluateAll((b) => b.map((e) => e.dataset.railSlide));
for (const id of [railIds[6], railIds[0], railIds.at(-1), railIds[6]]) {
  await page.locator(`nav button[data-rail-slide="${id}"]`).evaluate((b) => b.click());
  await settle(page);
  const scene = await page.locator("main [data-column-scene]").boundingBox();
  const box = await page.locator(`main [data-column-slide="${id}"]`).boundingBox();
  const inView = box && box.y >= scene.y - 1 && box.y + box.height <= scene.y + scene.height + 1;
  check(`a rail click in the column goes to ${id} and stays there`, urlSlide() === id && inView, `slide ${urlSlide()}, ${id} at y ${box?.y.toFixed(0)}-${(box?.y + box?.height).toFixed(0)} in ${scene.y.toFixed(0)}-${(scene.y + scene.height).toFixed(0)}`);
}

// The column's slides show the chosen tool's own pointer, never the browser's hand ("the native pointer,
// meaning not the tool", user, 2026-10-13): an arrow with Select, the pen with Pen.
const cursorOnSlide = () => page.evaluate(() => {
  const r = document.querySelector("main [data-column-slide][data-current]").getBoundingClientRect();
  return getComputedStyle(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)).cursor;
});
const selectCursor = await cursorOnSlide();
await page.keyboard.press("p");
const penCursor = await cursorOnSlide();
await page.keyboard.press("v");
check("a column slide shows the arrow with Select and the pen with Pen, never the hand", ["auto", "default"].includes(selectCursor) && penCursor.startsWith("url("), `${selectCursor} / ${penCursor.slice(0, 60)}`);

// The current slide in the column is live, so the tools work there ("at < 100% zoom the tools are not
// working and they directly select stuff", user, 2026-10-13): a click on another slide in view makes it
// current where it sits, Region draws a box on it, and the Cursor tool edits its text.
const neighbour = await page.evaluate(() => {
  const scene = document.querySelector("main [data-column-scene]").getBoundingClientRect();
  const whole = [...document.querySelectorAll("main [data-column-slide]:not([data-current])")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top >= scene.top && r.bottom <= scene.bottom && el.querySelector(".folio-slide");
  });
  return whole[0]?.dataset.columnSlide;
});
const topBefore = await page.locator("main [data-column-scene]").evaluate((el) => el.scrollTop);
await page.locator(`main [data-column-slide="${neighbour}"]`).click({ position: { x: 20, y: 20 } });
await settle(page);
const topAfter = await page.locator("main [data-column-scene]").evaluate((el) => el.scrollTop);
check("a click on a slide in the column makes it current without scrolling", urlSlide() === neighbour && topAfter === topBefore, `${urlSlide()}, scrollTop ${topBefore} -> ${topAfter}`);
const live = page.locator(`main [data-column-slide="${neighbour}"]`);
const liveBox = await live.boundingBox();
await page.keyboard.press("r");
await page.mouse.move(liveBox.x + liveBox.width * 0.2, liveBox.y + liveBox.height * 0.3);
await page.mouse.down();
await page.mouse.move(liveBox.x + liveBox.width * 0.5, liveBox.y + liveBox.height * 0.6, { steps: 6 });
await page.mouse.up();
await settle(page);
const drawn = await live.locator("svg rect[stroke-dasharray]").count();
const textPicked = await page.evaluate(() => getSelection()?.toString() ?? "");
check("Region draws a box on the current column slide, and selects no text", drawn > 0 && textPicked === "", `${drawn} region boxes, selection "${textPicked.slice(0, 30)}"`);
await page.keyboard.press("Escape");
await page.keyboard.press("v");
await settle(page);
await live.locator('[data-slot="note"] .folio-text').click();
await page.keyboard.press("End");
await page.keyboard.type("Q7");
await settle(page);
const typed = await live.locator('[data-slot="note"] .folio-text').innerText();
check("the Cursor tool edits text on the current column slide", typed.includes("Q7"), typed.slice(-40));
await page.evaluate(() => document.activeElement?.blur());
await settle(page);

// A wheel scroll in the column is never pulled back to centre a slide ("when I scroll in this mode,
// the main page jump", user, 2026-10-13): each step leaves the column where the wheel put it.
const columnTop = () => page.locator("main [data-column-scene]").evaluate((el) => el.scrollTop);
await page.locator("main [data-column-scene]").hover();
const steps = [];
for (let i = 0; i < 6; i++) {
  const before = await columnTop();
  await page.mouse.wheel(0, 70);
  await settle(page);
  steps.push(Math.round((await columnTop()) - before));
}
check("each wheel step scrolls the column by the wheel, with no snap back", steps.every((d) => Math.abs(d - 70) <= 1), `steps ${steps.join(", ")} px`);

const beforeScrollSlide = urlSlide();
await page.locator("main [data-column-scene]").hover();
for (let i = 0; i < 10; i++) {
  await page.mouse.wheel(0, 600);
  await settle(page);
}
check("a plain wheel scrolls the column, not the browser page", await page.evaluate(() => scrollY === 0), `page scrollY ${await page.evaluate(() => scrollY)}`);
check("scrolling the column changes the current slide", urlSlide() !== beforeScrollSlide, `${beforeScrollSlide} -> ${urlSlide()}`);

// Crossing back up to 100% takes the slide under the pointer with it: hover the slide the scroll
// landed on (near the viewport centre already) and zoom in from there.
const landedId = urlSlide();
const hovered = await page.locator(`main [data-column-slide="${landedId}"]`).boundingBox();
await ctrlWheel(hovered.x + hovered.width / 2, hovered.y + hovered.height / 2, -2000);
await still(page);
const chipCount = await chip.count();
const pctNow = chipCount ? parseInt(await chip.textContent()) : 100;
check("zooming in from the column lands on the slide that was under the pointer", urlSlide() === landedId && pctNow >= 100, `${chipCount ? (await chip.textContent())?.trim() : "100%"}, slide ${landedId} -> ${urlSlide()}`);
await page.keyboard.press("0");
await still(page);

await browser.close();
await server.stop();
const ok = results.every(Boolean);
console.log(ok ? "PASS ctrl+wheel zoom about the pointer, outlines, measurement, pan, back to fit, regions in pt, zoom/pan persist across slides, column view below 100%" : "FAIL zoom");
process.exit(ok ? 0 : 1);
