// Browser check: an old ?mode=comment link opens in Edit (two mode segments); in Edit the sketch toolbar is centred on the deck display area (between
// the rail and the panel, as the scene fits the slide) with the rail and panel each open or shut,
// and carries no shell (no painted wrapper around the button group). At 390x844 it is centred on
// the screen and stands above the bottom sheet. Serves its own copy of decks/example-b.
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";
import { settle } from "./lib/page.mjs";
const server = await serve({ decks: ["example-b"] });
const browser = await chromium.launch();
const failures = [];
const expect = (ok, what) => ok || failures.push(what);
const group = '[data-chrome="sketch-toolbar"] [role="toolbar"]';
const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, right: r.right, bottom: r.bottom }; });
const shells = (page) => page.locator(group).first().evaluate((el) => {
  const found = [];
  for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
    const s = getComputedStyle(up);
    const painted = s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.backgroundImage !== "none";
    const bordered = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none");
    if (painted || bordered) found.push(`${up.tagName.toLowerCase()}.${up.className}`);
  }
  return found;
});

async function setOpen(page, name, open) {
  const button = page.getByRole("button", { name });
  if ((await button.getAttribute("aria-expanded")) !== String(open)) await button.click();
  await page.waitForFunction(([n, o]) => [...document.querySelectorAll("button[aria-expanded]")].some((b) => b.getAttribute("aria-label") === n && b.getAttribute("aria-expanded") === String(o)), [name, open]);
  await settle(page);
}

async function open(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(`${server.base}/${server.token("example-b")}/?slide=s001&mode=comment`, { waitUntil: "load" });
  await page.waitForSelector(group);
  const modes = await page.locator('[data-chrome="mode"] [aria-label="Mode"] [role="radio"]').count();
  if (modes !== 2 || (await page.locator('[data-chrome="mode"] [aria-label="Mode"] [role="radio"]').first().getAttribute("aria-checked")) !== "true") failures.push(`?mode=comment at ${width}: ${modes} mode segments, Edit not checked`);
  return page;
}

async function wide() {
  const page = await open(1440, 900);
  for (const [rail, panel] of [[true, true], [false, true], [true, false], [false, false]]) {
    await setOpen(page, "Toggle slides", rail);
    await setOpen(page, "Toggle panel", panel);
    const left = rail ? (await rect(page, 'nav[aria-label="Slides"]')).right : 0;
    const right = panel ? (await rect(page, 'aside[aria-label="Deck panel"]')).x : 1440;
    const bar = await rect(page, group);
    const off = bar.x + bar.w / 2 - (left + right) / 2;
    expect(Math.abs(off) < 1, `1440: rail ${rail} panel ${panel}, toolbar centre ${off.toFixed(1)} px off the scene's centre`);
    const shell = await shells(page);
    expect(shell.length === 0, `1440: toolbar inside a shell: ${shell.join(", ")}`);
  }
  await page.close();
}

async function phone() {
  const page = await open(390, 844);
  await setOpen(page, "Toggle panel", true);
  const bar = await rect(page, group);
  const sheet = await rect(page, 'aside[aria-label="Deck panel"]');
  expect(Math.abs(bar.x + bar.w / 2 - 195) < 1, `390: toolbar centre ${bar.x + bar.w / 2}, not the screen's 195`);
  expect(bar.bottom <= sheet.y, `390: toolbar bottom ${bar.bottom} below the sheet's top ${sheet.y}`);
  await page.close();
}

await wide();
await phone();
await browser.close();
await server.stop();
console.log(failures.length ? `FAIL ${failures.join("; ")}` : "PASS ?mode=comment lands in Edit; sketch toolbar centred on the deck display area, no shell, above the phone sheet");
process.exit(failures.length ? 1 : 0);
