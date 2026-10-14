// Browser check for dragging the rail and the panel by their inner edges: live width, the slide
// refitted between them, thumbnails following the rail, the mode switch one gutter past the rail,
// toggles unmoved, the limits and the 320 px scene floor, arrow keys, double-click reset,
// persistence across a reload, and no grip below 900 px.
// Serves its own copy of decks/example-b.
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";
import { still } from "./lib/page.mjs";
const server = await serve({ decks: ["example-b"] });
const near = (a, b, tol = 1) => Math.abs(a - b) <= tol;
const failures = [];
const expect = (ok, what) => ok || failures.push(what);
const DECK = `${server.base}/${server.token("example-b")}/`;

/** Every box the check compares, read in one pass. */
function measure() {
  const box = (sel) => {
    const e = document.querySelector(sel);
    return e ? e.getBoundingClientRect().toJSON() : null;
  };
  return {
    rail: box('nav[aria-label="Slides"]'),
    panel: box('aside[aria-label="Deck panel"]'),
    slide: box("main .folio-slide"),
    thumb: box('nav[aria-label="Slides"] [data-thumb]'),
    mode: box('[data-chrome="mode"] [role="radiogroup"], [data-chrome="mode"] > *'),
    railToggle: box('[data-chrome="rail-toggles"] button'),
    panelToggle: box('[data-chrome="panel-toggle"] button'),
    thumbInset: ((token) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(${token})`;
    document.body.append(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px;
  })("--thumb-inset"),
    grips: [...document.querySelectorAll('[role="separator"].pane-resizer')].map((g) => ({ side: g.dataset.side, now: Number(g.getAttribute("aria-valuenow")), min: Number(g.getAttribute("aria-valuemin")), max: Number(g.getAttribute("aria-valuemax")), box: g.getBoundingClientRect().toJSON() })),
  };
}

async function drag(page, side, dx) {
  const g = (await page.evaluate(measure)).grips.find((x) => x.side === side).box;
  const x = g.x + g.width / 2;
  const y = g.y + g.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(x + (dx * i) / 10, y);
  await page.mouse.up();
  await still(page);
  return page.evaluate(measure);
}

function checkGeometry(m, label) {
  expect(m.slide.left >= m.rail.right - 1 && m.slide.right <= m.panel.left + 1, `${label}: slide ${m.slide.left}-${m.slide.right} not between rail ${m.rail.right} and panel ${m.panel.left}`);
  expect(near(m.mode.left, m.rail.right + 12), `${label}: mode switch at ${m.mode.left}, rail ends ${m.rail.right}`);
  expect(near(m.thumb.width, m.rail.width - 2 * m.thumbInset), `${label}: thumbnail ${m.thumb.width} for rail ${m.rail.width}, inset ${m.thumbInset}`);
  expect(m.panel.left - m.rail.right >= 319, `${label}: scene ${m.panel.left - m.rail.right} < 320`);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => failures.push(`pageerror ${e.message}`));
await page.goto(DECK, { waitUntil: "load" });
await page.evaluate(() => (localStorage.clear(), localStorage.setItem("folio.rail", "open")));
await page.reload({ waitUntil: "load" });
await page.locator('nav[aria-label="Slides"] [data-thumb]').first().waitFor();
await still(page);
const start = await page.evaluate(measure);
expect(start.grips.length === 2, `grips: ${start.grips.length}`);
expect(near(start.rail.width, 196) && near(start.panel.width, 328), `initial widths ${start.rail.width}, ${start.panel.width}`);
const slideW0 = start.slide.width;

let m = await drag(page, "rail", 100);
expect(near(m.rail.width, 296), `rail after +100: ${m.rail.width}`);
expect(m.slide.width < slideW0, `slide did not refit: ${m.slide.width} vs ${slideW0}`);
checkGeometry(m, "rail +100");
m = await drag(page, "panel", -100);
expect(near(m.panel.width, 428), `panel after -100: ${m.panel.width}`);
checkGeometry(m, "panel +100");
for (const k of ["railToggle", "panelToggle"]) expect(near(m[k].x, start[k].x) && near(m[k].y, start[k].y) && near(m[k].width, start[k].width), `${k} moved: ${JSON.stringify(m[k])} from ${JSON.stringify(start[k])}`);

m = await drag(page, "rail", 400);
expect(near(m.rail.width, 400) || near(m.panel.left - m.rail.right, 320), `rail past max: ${m.rail.width}, scene ${m.panel.left - m.rail.right}`);
checkGeometry(m, "rail at max");
m = await drag(page, "panel", 600);
expect(near(m.panel.width, 280), `panel past min: ${m.panel.width}`);
m = await drag(page, "panel", -600);
expect(near(m.panel.left - m.rail.right, 320) || near(m.panel.width, 560), `panel past max: ${m.panel.width}, scene ${m.panel.left - m.rail.right}`);
checkGeometry(m, "panel at max");

await page.locator('.pane-resizer[data-side="rail"]').dblclick();
await still(page);
m = await page.evaluate(measure);
expect(near(m.rail.width, 196), `rail after double-click: ${m.rail.width}`);
await page.locator('.pane-resizer[data-side="rail"]').focus();
const before = await page.evaluate(() => new URL(location.href).searchParams.get("slide"));
await page.keyboard.press("ArrowLeft");
await page.keyboard.press("ArrowLeft");
await still(page);
m = await page.evaluate(measure);
expect(near(m.rail.width, 164), `rail after two ArrowLeft: ${m.rail.width}`);
expect(m.grips.find((g) => g.side === "rail").now === Math.round(m.rail.width), `aria-valuenow ${m.grips[0].now}`);
expect(before === (await page.evaluate(() => new URL(location.href).searchParams.get("slide"))), "arrow on the grip changed the slide");
const kept = { rail: m.rail.width, panel: m.panel.width };

await page.waitForFunction((w) => ["rail", "panel"].every((side) => Math.abs(Number(localStorage.getItem(`folio.${side}-w`)) - w[side]) <= 1), kept, { timeout: 5000 }).catch(() => failures.push(`widths not stored: ${kept.rail}, ${kept.panel}`));
await page.reload({ waitUntil: "load" });
await page.locator('nav[aria-label="Slides"] [data-thumb]').first().waitFor();
await still(page);
m = await page.evaluate(measure);
expect(near(m.rail.width, kept.rail) && near(m.panel.width, kept.panel), `after reload ${m.rail.width}, ${m.panel.width}; kept ${kept.rail}, ${kept.panel}`);

await page.setViewportSize({ width: 390, height: 844 });
await still(page);
m = await page.evaluate(measure);
expect(m.grips.length === 0, `grips below 900 px: ${m.grips.length}`);
expect(near(m.rail.width, 196), `rail sheet width below 900 px: ${m.rail.width}`);
await page.evaluate(() => localStorage.clear());
await browser.close();
await server.stop();
console.log(failures.length ? `FAIL ${failures.join("; ")}` : "PASS live resize, refit, thumbnails, mode switch, toggles, limits, keys, reset, persistence, narrow");
process.exit(failures.length ? 1 : 0);
