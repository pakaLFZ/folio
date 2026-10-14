// Browser check for the chrome's spacing: one screen gutter on the left, right and top; thumbnails
// centred in the rail at a constant rhythm; the selected highlight padded equally on every side;
// each thumbnail's hairline on the rail toggle glyph's left edge (the icon's ink, 2/24 of the icon
// in from its box); the first thumbnail's button (its highlight box) one --panel-header-pad below the rail toggle;
// at 1440, the panel's first content (on the Slide tab the Template bank header row: its button's top, its chevron's left)
// one --panel-header-pad below its header buttons and one --panel-pad inside its edge.
// Serves its own copy of decks/example-b. Optional: node e2e/rail-spacing.mjs OUT_DIR for screenshots.
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";
import { settle } from "./lib/page.mjs";
const server = await serve({ decks: ["example-b"] });
const shots = process.argv[2];
const near = (a, b) => Math.abs(a - b) <= 1;
const failures = [];
const expect = (ok, what) => ok || failures.push(what);

/** The edges of every floating pane of glass, the rail's thumbnails and the selected one. */
function measure() {
  const box = (e) => e.getBoundingClientRect();
  const glass = [...document.querySelectorAll(".glass")].map(box).filter((r) => r.width && r.height);
  const rail = box(document.querySelector('nav[aria-label="Slides"]'));
  const thumbs = [...document.querySelectorAll('nav[aria-label="Slides"] [data-thumb]')].map(box);
  const selected = document.querySelector('nav[aria-label="Slides"] [aria-current="page"]');
  const length = (token) => {
    const probe = document.createElement("div");
    probe.style.cssText = `position:absolute;visibility:hidden;width:var(${token})`;
    document.body.append(probe);
    const px = probe.getBoundingClientRect().width;
    probe.remove();
    return px;
  };
  const leaf = (e) => (e.firstElementChild ? leaf(e.firstElementChild) : e);
  const glyph = box(document.querySelector('[data-chrome="rail-toggles"] button svg'));
  const panel = document.querySelector('aside[aria-label="Deck panel"]');
  const body = panel.querySelector('[role="tabpanel"][data-state="active"]');
  const header = body.querySelector("h3 > button[aria-expanded]");
  const first = header ? { top: box(header).top, left: box(header.firstElementChild).left } : box(leaf(body));
  return {
    glyphInk: glyph.left + glyph.width / 12,
    thumbEdges: thumbs.map((t) => t.left - 1),
    railFirst: box(document.querySelector('nav[aria-label="Slides"] button[data-rail-slide]')).top - box(document.querySelector('[data-chrome="rail-toggles"]')).bottom,
    panelFirst: first.top - box(document.querySelector('[data-chrome="panel-actions"]')).bottom,
    panelLeft: first.left - box(panel).left - 1,
    thumbPad: length("--thumb-pad"),
    headerPad: length("--panel-header-pad"),
    panelPad: length("--panel-pad"),
    gutter: { left: Math.min(...glass.map((r) => r.left)), right: innerWidth - Math.max(...glass.map((r) => r.right)), top: Math.min(...glass.map((r) => r.top)) },
    insets: thumbs.map((t) => [t.left - rail.left, rail.right - t.right]),
    gaps: thumbs.slice(1).map((t, i) => t.top - thumbs[i].bottom),
    highlight: ((b, t) => [t.top - b.top, b.right - t.right, b.bottom - t.bottom, t.left - b.left])(box(selected), box(selected.querySelector("[data-thumb]"))),
  };
}

const browser = await chromium.launch();
for (const [w, h] of [[1440, 900], [390, 844]]) {
  const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => failures.push(`pageerror ${e.message}`));
  await page.goto(`${server.base}/${server.token("example-b")}/`, { waitUntil: "load" });
  await page.locator('[data-chrome="mode"]').waitFor();
  await settle(page);
  const railToggle = page.getByRole("button", { name: "Toggle slides" });
  if ((await railToggle.getAttribute("aria-expanded")) !== "true") await railToggle.click();
  await page.locator('nav[aria-label="Slides"] [data-thumb]').first().waitFor();
  await settle(page);
  const m = await page.evaluate(measure);
  console.log(`${w}x${h}`, JSON.stringify(m));
  const { left, right, top } = m.gutter;
  expect(near(left, right) && near(left, top), `${w}: gutters left ${left}, right ${right}, top ${top}`);
  m.insets.forEach(([l, r], i) => expect(near(l, r), `${w}: thumbnail ${i + 1} inset left ${l}, right ${r}`));
  expect(m.gaps.every((g) => near(g, m.gaps[0])), `${w}: thumbnail gaps ${m.gaps.join(",")}`);
  expect(m.highlight.every((p) => near(p, m.highlight[0])), `${w}: highlight padding ${m.highlight.join(",")}`);
  expect(m.gaps.every((g) => near(g, m.highlight[0] * 2)), `${w}: gap ${m.gaps[0]} is not twice the highlight padding ${m.highlight[0]}`);
  m.thumbEdges.forEach((x, i) => expect(near(x, m.glyphInk), `${w}: thumbnail ${i + 1} edge ${x}, toggle glyph ${m.glyphInk}`));
  expect(near(m.railFirst, m.headerPad), `${w}: first thumbnail ${m.railFirst} below the rail toggle, not ${m.headerPad}`);
  if (w >= 900) {
    expect(near(m.panelFirst, m.headerPad), `${w}: panel content ${m.panelFirst} below the header buttons, not ${m.headerPad}`);
    expect(near(m.panelLeft, m.panelPad), `${w}: panel content ${m.panelLeft} inside the panel, not ${m.panelPad}`);
  }
  if (shots) await page.screenshot({ path: `${shots}/rail-spacing-after-${w}.png` });
  await page.close();
}
await browser.close();
await server.stop();
console.log(failures.length ? `FAIL ${failures.join("; ")}` : "PASS gutters, thumbnails centred on the toggle glyph, rhythm, highlight padding and first content below the headers at 1440x900 and 390x844");
process.exit(failures.length ? 1 : 0);
