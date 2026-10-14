// Browser check: the pane toggles never move or resize as the rail and panel open and close; the
// rail's corner holds the rail toggle and, right of it, a Home button that always opens the deck
// list and a Copy button that copies the deck's CLI path; the mode pill stands one gutter past the
// rail's toggles (rail shut) or past the rail (rail open), the visible segmented switch's
// top edge inset equally from each pane's top and side (--corner-x), with no shell (no wrapper with a background or
// border) around it. At 1440x900 and 390x844. A fresh browser opens with the rail shut; an opened rail
// stays open across a reload, its toggle in place. At 1440, each open pane's header row ends at its
// toggle's bottom edge, so its content starts right under it.
// With both panes closed, the rail toggle pill, the mode switch and the panel toggle pill share the
// same top edge (--corner-x) and the same height (--corner-btn), so they read as one row.
// The whole top row (rail toggle, mode switch, panel toggle, the panel's inbox and theme buttons)
// shares one icon centre line (spec/chrome/style.md, "pls align icons", user 2026-10-12). Every
// corner button's hover background sits inset from the pane's edges by --panel-header-pad, never
// touching them, and the space from a pane's top to its button row equals the space from the row
// to the pane's first content (same token both sides; "the margin is not balanced", user 2026-10-12).
// The zoom chip beside the mode switch shares its centre line and only shows while zoomed (spec/chrome/zoom.md).
// The sketch toolbar's centre line matches the panel's tab bar.
// Serves its own copy of decks/example-b. Optional argument: a folder for screenshots.
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";
import { settle } from "./lib/page.mjs";
const shots = process.argv[2];
const server = await serve({ decks: ["example-b"] });
const editor = `${server.base}/${server.token("example-b")}/?slide=s001`;
const browser = await chromium.launch();
const failures = [];
const expect = (ok, what) => ok || failures.push(what);
const rect = (page, sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom }; });
const css = (page, name) => page.evaluate((n) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(n)), name);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const modeSwitch = '[data-chrome="mode"] [role="radiogroup"]';
const iconCenter = (page, sel) => page.locator(sel).first().locator("svg").first().evaluate((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
const iconSize = (page, sel) => page.locator(sel).first().locator("svg").first().evaluate((el) => el.getBoundingClientRect().width);
const contentRect = (page, sel) => page.locator(sel).first().evaluate((el) => {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return { top: r.top + parseFloat(cs.paddingTop), left: r.left + parseFloat(cs.paddingLeft), right: r.right - parseFloat(cs.paddingRight), bottom: r.bottom - parseFloat(cs.paddingBottom) };
});
const shells = (page) => page.locator(modeSwitch).first().evaluate((el) => {
  const found = [];
  for (let up = el.parentElement; up && up !== document.body; up = up.parentElement) {
    const r = up.getBoundingClientRect();
    if (r.width >= innerWidth && r.height >= innerHeight) break;
    const s = getComputedStyle(up);
    const painted = s.backgroundColor !== "rgba(0, 0, 0, 0)" || s.backgroundImage !== "none";
    const bordered = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(s[`border${side}Width`]) > 0 && s[`border${side}Style`] !== "none");
    if (painted || bordered) found.push(`${up.tagName.toLowerCase()}.${up.className}`);
  }
  return found;
});

async function measure(page) {
  return {
    rail: await rect(page, '[data-chrome="rail-toggles"]'),
    panel: await rect(page, '[data-chrome="panel-toggle"] button'),
    mode: await rect(page, modeSwitch),
    railIcon: await iconCenter(page, '[data-chrome="rail-toggles"] button[aria-label="Toggle slides"]'),
    homeIcon: await iconCenter(page, '[data-chrome="rail-toggles"] a[aria-label="All decks"]'),
    home: await rect(page, '[data-chrome="rail-toggles"] a[aria-label="All decks"]'),
    toggle: await rect(page, '[data-chrome="rail-toggles"] button[aria-label="Toggle slides"]'),
    copyIcon: await iconCenter(page, '[data-chrome="rail-toggles"] button[aria-label="Copy deck id"]'),
    copy: await rect(page, '[data-chrome="rail-toggles"] button[aria-label="Copy deck id"]'),
    panelIcon: await iconCenter(page, '[data-chrome="panel-toggle"] button'),
    modeIcon: await iconCenter(page, modeSwitch + " button"),
    inbox: await page.locator('[data-chrome="panel-header-icons"] a').count() ? await rect(page, '[data-chrome="panel-header-icons"] a') : null,
    inboxIcon: await page.locator('[data-chrome="panel-header-icons"] a').count() ? await iconCenter(page, '[data-chrome="panel-header-icons"] a') : null,
    exportIcon: await page.locator('[data-chrome="panel-header-icons"] button[aria-label="Download"]').count() ? await iconCenter(page, '[data-chrome="panel-header-icons"] button[aria-label="Download"]') : null,
    theme: await page.locator('[data-chrome="panel-header-icons"] button[aria-label="Theme"]').count() ? await rect(page, '[data-chrome="panel-header-icons"] button[aria-label="Theme"]') : null,
    toggleWellBg: await page.locator('[data-chrome="panel-toggle"]').first().evaluate((el) => getComputedStyle(el).backgroundColor),
    toggleBox: await rect(page, '[data-chrome="panel-toggle"]'),
    wellBox: await rect(page, '[data-chrome="panel-actions"]'),
    themeIcon: await page.locator('[data-chrome="panel-header-icons"] button[aria-label="Theme"]').count() ? await iconCenter(page, '[data-chrome="panel-header-icons"] button[aria-label="Theme"]') : null,
    glyphs: await Promise.all([
      '[data-chrome="rail-toggles"] button[aria-label="Toggle slides"]',
      '[data-chrome="rail-toggles"] a[aria-label="All decks"]',
      '[data-chrome="rail-toggles"] button[aria-label="Copy deck id"]',
      modeSwitch + ' button',
      '[data-chrome="panel-toggle"] button',
      ...((await page.locator('[data-chrome="panel-header-icons"] a').count()) ? [
        '[data-chrome="panel-header-icons"] button[aria-label="Download"]',
        '[data-chrome="panel-header-icons"] a',
        '[data-chrome="panel-header-icons"] button[aria-label="Theme"]',
      ] : []),
    ].map((sel) => iconSize(page, sel))),
  };
}

async function setOpen(page, name, open) {
  const button = page.getByRole("button", { name });
  if ((await button.getAttribute("aria-expanded")) !== String(open)) await button.click();
  await page.waitForFunction(([n, o]) => document.querySelector(`button[aria-label="${n}"]`)?.getAttribute("aria-expanded") === o, [name, String(open)]);
  await settle(page);
}

async function check(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(editor, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  const gap = await css(page, "--gutter");
  const button = await css(page, "--corner-btn");
  const headerPad = await css(page, "--panel-header-pad");
  const edge = await css(page, "--glass-edge-w");
  const inset = await css(page, "--panel-inset") + edge + headerPad;
  expect((await page.getByRole("link", { name: "Every deck" }).count()) === 0, `${width}: Every deck shown by default`);
  expect((await page.getByRole("link", { name: "All decks" }).count()) === 1, `${width}: Home button missing`);
  expect((await page.getByRole("button", { name: "Copy deck id" }).count()) === 1, `${width}: Copy button missing`);
  const rowMetrics = await page.locator('[data-chrome="rail-toggles"]').first().evaluate((el) => {
    const cs = getComputedStyle(el);
    return { gap: parseFloat(cs.columnGap) || 0, pad: parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight), n: el.children.length };
  });
  const states = {};
  for (const [name, rail, panel] of [["both open", true, true], ["rail closed", false, true], ["panel closed", true, false], ["both closed", false, false]]) {
    await setOpen(page, "Toggle slides", rail);
    await setOpen(page, "Toggle panel", panel);
    states[name] = await measure(page);
    states[name].shells = await shells(page);
    if (rail) states[name].railPane = await rect(page, 'nav[aria-label="Slides"]');
    if (rail) states[name].railHeader = await rect(page, 'nav[aria-label="Slides"] .pane-header');
    if (panel) states[name].panelPane = await rect(page, 'aside[aria-label="Deck panel"]');
    if (panel) states[name].panelHeader = await rect(page, 'aside[aria-label="Deck panel"] .pane-header');
    if (rail && width >= 900) states[name].railThumb = await rect(page, 'nav[aria-label="Slides"] [data-rail-slide]');
    if (panel && width >= 900) states[name].panelFirst = await rect(page, 'aside[aria-label="Deck panel"] .panel-body h3 > button[aria-expanded]');
    if (width >= 900) {
      states[name].railFill = await contentRect(page, '[data-chrome="rail-toggles"] button');
      states[name].panelFill = await contentRect(page, '[data-chrome="panel-toggle"] button');
      if (panel) {
        states[name].inboxFill = await contentRect(page, '[data-chrome="panel-header-icons"] a');
        states[name].themeFill = await contentRect(page, '[data-chrome="panel-header-icons"] button[aria-label="Theme"]');
      }
    }
    if (shots && width === 1440) await page.screenshot({ path: `${shots}/chrome-${name.replace(" ", "-")}.png` });
  }
  const open = states["both open"], railShut = states["rail closed"];
  for (const s of Object.values(states)) {
    expect(same(s.rail, open.rail), `${width}: rail toggles moved`);
    expect(Math.abs(s.rail.w - (s.toggle.w * rowMetrics.n + rowMetrics.gap * (rowMetrics.n - 1) + rowMetrics.pad)) < 0.01, `${width}: rail toggles pill ${s.rail.w} px wide, not ${rowMetrics.n} ${s.toggle.w} px buttons plus gap/padding`);
    expect(s.home.x > s.toggle.x + s.toggle.w - 0.5, `${width}: Home button ${s.home.x} not right of the rail toggle ${s.toggle.x + s.toggle.w}`);
    expect(Math.abs(s.home.y - s.toggle.y) < 0.5 && Math.abs(s.home.h - s.toggle.h) < 0.5, `${width}: Home button box ${JSON.stringify(s.home)} != toggle ${JSON.stringify(s.toggle)}`);
    expect(s.copy.x > s.home.x + s.home.w - 0.5, `${width}: Copy button ${s.copy.x} not right of Home ${s.home.x + s.home.w}`);
    expect(Math.abs(s.copy.y - s.toggle.y) < 0.5 && Math.abs(s.copy.h - s.toggle.h) < 0.5, `${width}: Copy button box ${JSON.stringify(s.copy)} != toggle ${JSON.stringify(s.toggle)}`);
    if (width >= 900 || s.panel.y === open.panel.y) expect(same(s.panel, open.panel), `${width}: panel toggle moved`);
    expect(s.mode.y === open.mode.y, `${width}: mode pill top moved`);
    expect(s.mode.y === inset, `${width}: mode switch top ${s.mode.y} != panes' top ${inset}`);
    expect(s.shells.length === 0, `${width}: mode switch inside a shell: ${s.shells.join(", ")}`);
    if (width >= 900 && s.railHeader) expect(Math.abs(s.railHeader.bottom - s.rail.bottom) < 0.01, `${width}: rail header ends ${s.railHeader.bottom}, toggle ${s.rail.bottom}`);
    if (width >= 900 && s.panelHeader) expect(Math.abs(s.panelHeader.bottom - s.panel.bottom - 2) < 0.01, `${width}: panel header ends ${s.panelHeader.bottom}, toggle ${s.panel.bottom}`);
    // Every top-row box shares one top and one height (the mode switch's own box, not its wrapper row).
    if (width >= 900) {
      expect(Math.abs(s.mode.y - s.rail.y) < 0.01, `${width}: mode switch top ${s.mode.y} != rail toggle top ${s.rail.y}`);
      expect(Math.abs(s.mode.h - button) < 0.01, `${width}: mode switch height ${s.mode.h}, not ${button}`);
      if (s.panelPane) {
        expect(Math.abs(s.inbox.y - inset - 2) < 0.01, `${width}: inbox box top ${s.inbox.y} != well inset ${inset + 2}`);
        expect(Math.abs(s.inbox.h - button + 4) < 0.01, `${width}: inbox box height ${s.inbox.h}, not ${button - 4}`);
        expect(Math.abs(s.theme.y - inset - 2) < 0.01, `${width}: theme box top ${s.theme.y} != well inset ${inset + 2}`);
        expect(Math.abs(s.theme.h - button + 4) < 0.01, `${width}: theme box height ${s.theme.h}, not ${button - 4}`);
      }
      // One icon centre line across the whole row.
      const centres = [s.railIcon, s.homeIcon, s.copyIcon, s.panelIcon, s.modeIcon, s.exportIcon, s.inboxIcon, s.themeIcon].filter((value) => value !== null);
      const spread = Math.max(...centres) - Math.min(...centres);
      expect(spread < 0.5, `${width}: icon centres span ${spread.toFixed(2)} px: ${centres.map((c) => c.toFixed(2)).join(", ")}`);
      expect(s.glyphs.every((size) => Math.abs(size - 16) < 0.5), `${width}: top icon widths ${s.glyphs.join(", ")} instead of 16`);
      // No corner button's painted hover background touches the pane it sits over.
      if (s.railPane) {
        expect(s.railFill.top > s.railPane.y + 0.5, `${width}: rail toggle hover touches the rail's top edge`);
        expect(s.railFill.left > s.railPane.x + 0.5, `${width}: rail toggle hover touches the rail's left edge`);
      }
      if (s.panelPane) {
        expect(s.panelFill.top > s.panelPane.y + 0.5, `${width}: panel toggle hover touches the panel's top edge`);
        expect(s.panelFill.right < s.panelPane.right - 0.5, `${width}: panel toggle hover touches the panel's right edge`);
        expect(s.inboxFill.top > s.panelPane.y + 0.5, `${width}: inbox hover touches the panel's top edge`);
        expect(s.themeFill.top > s.panelPane.y + 0.5, `${width}: theme hover touches the panel's top edge`);
      }
      // The panel toggle sits outside the icon well: a small gap from it, no
      // painted well of its own.
      expect(Math.abs(s.toggleBox.x - s.wellBox.right - gap) < 1, `${width}: panel toggle gap from the well ${(s.toggleBox.x - s.wellBox.right).toFixed(2)} != --gutter ${gap}`);
      expect(s.toggleWellBg === "rgba(0, 0, 0, 0)", `${width}: panel toggle wrapper is painted (${s.toggleWellBg})`);
      // Equal space above the row (pane top to the hover fill's top) and below it (button bottom to the first
      // content), both the same --panel-header-pad token used to inset the hover boxes.
      if (s.railThumb) {
        const above = s.rail.y - s.railPane.y - edge, below = s.railThumb.y - s.rail.bottom;
        expect(Math.abs(above - below) < 1, `${width}: rail margins unbalanced, above ${above.toFixed(2)} below ${below.toFixed(2)}`);
        expect(Math.abs(below - headerPad) < 1, `${width}: rail space below the row ${below.toFixed(2)} != --panel-header-pad ${headerPad}`);
      }
      if (s.panelFirst) {
        const above = inset - s.panelPane.y - edge, below = s.panelFirst.y - s.panel.bottom - 2;
        expect(Math.abs(above - below) < 1, `${width}: panel margins unbalanced, above ${above.toFixed(2)} below ${below.toFixed(2)}`);
        expect(Math.abs(below - headerPad) < 1, `${width}: panel space below the row ${below.toFixed(2)} != --panel-header-pad ${headerPad}`);
      }
      if (s.railThumb && s.panelFirst) expect(Math.abs(s.railThumb.y - s.panelFirst.y) < 1, `${width}: rail's first thumbnail ${s.railThumb.y} and panel's first content ${s.panelFirst.y} do not start at the same y`);
    }
  }
  expect(Math.abs(railShut.mode.x - railShut.rail.right - gap) < 0.01, `${width}: rail shut, mode pill not one gutter past the toggle`);
  expect(Math.abs(open.mode.x - open.railPane.right - gap) < 0.01, `${width}: rail open, mode pill not one gutter past the rail`);
  if (width >= 900) {
    const railInset = open.rail.x - open.railPane.x, panelInset = open.panelPane.right - open.toggleBox.right;
    expect(Math.abs(railInset - panelInset) < 1, `${width}: panel toggle inset from the pane's right edge ${panelInset.toFixed(2)} != rail toggle's inset from the left ${railInset.toFixed(2)}`);
  }
  const closed = states["both closed"];
  expect(Math.abs(closed.rail.y - inset) < 0.01, `${width}: closed rail toggle top ${closed.rail.y}, not ${inset}`);
  expect(width < 900 || Math.abs(closed.panel.y - inset - 2) < 0.01, `${width}: closed panel toggle top ${closed.panel.y}, not ${inset + 2}`);
  expect(Math.abs(closed.mode.y - inset) < 0.01, `${width}: closed mode switch top ${closed.mode.y}, not ${inset}`);
  expect(Math.abs(closed.rail.h - button) < 0.01, `${width}: closed rail toggle height ${closed.rail.h}, not ${button}`);
  expect(Math.abs(closed.panel.h - button + 4) < 0.01, `${width}: closed panel toggle height ${closed.panel.h}, not ${button - 4}`);
  expect(Math.abs(closed.mode.h - button) < 0.01, `${width}: closed mode switch height ${closed.mode.h}, not ${button}`);
  if (width < 900) {
    const mobile = states["both open"];
    expect(mobile.inbox.y >= mobile.panelPane.y + headerPad, `${width}: panel actions are outside the bottom sheet header`);
    expect(mobile.mode.bottom < mobile.inbox.y, `${width}: mode overlaps panel actions`);
  }
  console.log(`${width}x${height}`, JSON.stringify({ gap, states }));
  await page.close();
}

async function remembered(width, height) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(editor, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  const toggle = page.getByRole("button", { name: "Toggle slides" });
  const fresh = await toggle.getAttribute("aria-expanded");
  const railHidden = !(await page.locator('nav[aria-label="Slides"]').isVisible());
  expect(fresh === "false" && railHidden, `${width}: fresh load, rail expanded ${fresh}, hidden ${railHidden}`);
  const before = await rect(page, '[data-chrome="rail-toggles"]');
  await toggle.click();
  await page.reload({ waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  const kept = await toggle.getAttribute("aria-expanded");
  const railShown = await page.locator('nav[aria-label="Slides"]').isVisible();
  expect(kept === "true" && railShown, `${width}: after reload, rail expanded ${kept}, shown ${railShown}`);
  expect(same(before, await rect(page, '[data-chrome="rail-toggles"]')), `${width}: rail toggle moved across the reload`);
  console.log(`${width}x${height}`, JSON.stringify({ fresh, kept }));
  await page.close();
}

/** The zoom chip: hidden at fit, shown and on the switch's centre line after a wheel zoom, gone after the delay. */
async function zoomCheck() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(editor, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  const chip = page.locator('[data-chrome="zoom"]');
  expect((await chip.count()) === 0, "zoom chip present at fit");
  await page.mouse.move(900, 500);
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -400);
  await page.keyboard.up("Control");
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-chrome="zoom"]') ?? document.body).opacity === "1" && !!document.querySelector('[data-chrome="zoom"]'), null, { timeout: 3000 }).catch(() => {});
  expect((await chip.count()) === 1 && (await chip.evaluate((el) => getComputedStyle(el).opacity)) === "1", "zoom chip not shown after a wheel zoom");
  const chipCentre = await iconCenter_text(page);
  const modeY = await page.locator(modeSwitch).first().evaluate((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
  expect(Math.abs(chipCentre - modeY) < 0.5, `zoom chip centre ${chipCentre} != mode switch centre ${modeY}`);
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-chrome="zoom"]')).opacity === "0", null, { timeout: 3000 }).catch(() => {});
  expect((await chip.count()) === 1 && (await chip.evaluate((el) => getComputedStyle(el).opacity)) === "0", "zoom chip did not fade after the delay");
  await page.close();
}

/** The zoom chip's own vertical centre (it has no icon, so the box itself is measured). */
async function iconCenter_text(page) {
  return page.locator('[data-chrome="zoom"]').first().evaluate((el) => { const r = el.getBoundingClientRect(); return (r.top + r.bottom) / 2; });
}

/** The sketch toolbar sits on the panel's tab bar centre line. */
async function toolbarCheck() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(`${editor}&mode=edit`, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="sketch-toolbar"]');
  const tabRect = await page.locator('aside[aria-label="Deck panel"] [role="tablist"]').first().evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const toolRect = await page.locator('[data-chrome="sketch-toolbar"] [role="toolbar"]').first().evaluate((el) => { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom }; });
  const tabCentre = (tabRect.top + tabRect.bottom) / 2, toolCentre = (toolRect.top + toolRect.bottom) / 2;
  expect(Math.abs(tabCentre - toolCentre) < 1.5, `sketch toolbar centre ${toolCentre} (${JSON.stringify(toolRect)}) != tab bar centre ${tabCentre} (${JSON.stringify(tabRect)})`);
  const squares = await page.locator('[data-chrome="sketch-toolbar"] [role="toolbar"] button').evaluateAll((buttons) => buttons.map((button) => {
    const box = button.getBoundingClientRect();
    return [box.width, box.height];
  }));
  expect(squares.length === 9 && squares.every(([w, h]) => Math.abs(w - 32) < 0.5 && Math.abs(h - 32) < 0.5), `sketch buttons are not all 32 px squares: ${JSON.stringify(squares)}`);
  const lowerSizes = await Promise.all([
    '[data-chrome="sketch-toolbar"] [role="toolbar"] button',
    'aside[aria-label="Deck panel"] [role="tablist"] button',
  ].map((sel) => iconSize(page, sel)));
  expect(lowerSizes.every((size) => Math.abs(size - 16) < 0.5), `lower toolbar icon widths ${lowerSizes.join(", ")} instead of 16`);
  await page.close();
}

/** The Home button opens the deck list, the mirror of every other deck's row linking back into it. */
async function homeCheck() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(editor, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  await page.getByRole("link", { name: "All decks" }).click();
  await page.waitForSelector("ul a[href]");
  const onLanding = page.url().endsWith("/") && (await page.locator("h1", { hasText: "folio" }).count()) === 1;
  const deckLink = page.locator("ul a[href]").first();
  const deckHref = onLanding ? await deckLink.getAttribute("href") : null;
  expect(onLanding && !!deckHref, `Home button did not open a deck list with deck links: ${page.url()}`);
  await page.close();
}

/** Copy deck id puts the deck's folder (relative to the workspace root) on the clipboard and flashes a check. */
async function copyDeckIdCheck() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, permissions: ["clipboard-read", "clipboard-write"] });
  await page.goto(editor, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  const button = page.getByRole("button", { name: "Copy deck id" });
  await button.click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip === "decks/example-b", `clipboard held "${clip}", not decks/example-b`);
  const toast = await page.getByRole("status").filter({ hasText: "Copied" }).textContent({ timeout: 2000 }).catch(() => "");
  expect(toast.includes("decks/example-b"), `notice read "${toast}"`);
  const flashed = (await button.locator("svg.lucide-check").count()) === 1;
  expect(flashed, "Copy icon did not flip to a check");
  await page.waitForFunction(() => !document.querySelector('[data-chrome="rail-toggles"] button[aria-label="Copy deck id"] svg.lucide-check'), null, { timeout: 3000 }).catch(() => {});
  const reverted = (await button.locator("svg.lucide-copy").count()) === 1;
  expect(reverted, "Copy icon did not revert after the flash");
  await page.close();
}

/** The rail and panel toggles show no tooltip on hover; the Home and Copy buttons beside them still do. */
async function noToggleTipCheck() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(editor, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  await page.getByRole("button", { name: "Toggle slides" }).hover();
  await page.waitForTimeout(1000);
  expect((await page.getByRole("tooltip").count()) === 0, "rail toggle shows a tooltip on hover");
  await page.mouse.move(0, 0);
  await page.getByRole("button", { name: "Toggle slides" }).click();
  await page.getByRole("button", { name: "Toggle panel" }).hover();
  await page.waitForTimeout(1000);
  expect((await page.getByRole("tooltip").count()) === 0, "panel toggle shows a tooltip on hover");
  await page.mouse.move(0, 0);
  await page.getByRole("link", { name: "All decks" }).hover();
  await page.waitForFunction(() => document.querySelector('[role="tooltip"]'), null, { timeout: 2000 }).catch(() => {});
  expect((await page.getByRole("tooltip").count()) === 1, "Home button lost its tooltip");
  await page.close();
}

/** The rail and panel toggles carry no visible box-shadow, open or shut; the Home button beside them still does. */
async function noToggleShadowCheck() {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto(editor, { waitUntil: "load" });
  await page.waitForSelector('[data-chrome="mode"]');
  const shadow = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).boxShadow);
  const invisible = (css) => css === "none" || [...css.matchAll(/rgba?\([^)]*,\s*([0-9.]+)\)/g)].every((m) => parseFloat(m[1]) === 0);
  const railToggle = '[data-chrome="rail-toggles"] button[aria-label="Toggle slides"]';
  const panelToggle = '[data-chrome="panel-toggle"] button';
  const home = '[data-chrome="rail-toggles"] a[aria-label="All decks"]';
  for (const [rail, panel] of [[false, false], [true, true]]) {
    await setOpen(page, "Toggle slides", rail);
    await setOpen(page, "Toggle panel", panel);
    const railShadow = await shadow(railToggle), panelShadow = await shadow(panelToggle);
    expect(invisible(railShadow), `rail toggle (open=${rail}) has a shadow: ${railShadow}`);
    expect(invisible(panelShadow), `panel toggle (open=${panel}) has a shadow: ${panelShadow}`);
    if (!rail) expect(!invisible(await shadow(home)), "Home button lost its glass shadow when the rail is shut");
  }
  await page.close();
}

await remembered(1440, 900);
await remembered(390, 844);
await check(1440, 900);
await check(390, 844);
await zoomCheck();
await toolbarCheck();
await homeCheck();
await copyDeckIdCheck();
await noToggleTipCheck();
await noToggleShadowCheck();
await browser.close();
await server.stop();
console.log(failures.length ? `FAIL ${failures.join("; ")}` : "PASS chrome toggles fixed, Home button right of the rail toggle and opening the deck list, Copy deck id right of Home and copying the deck's CLI path, mode switch one gutter out at the panes' top with no shell, rail shut by default and remembered, top row icons aligned, hover insets clear of pane edges, margins balanced, zoom chip and sketch toolbar on the row's centre lines, rail/panel toggles carry no hover tooltip");
process.exit(failures.length ? 1 : 0);
