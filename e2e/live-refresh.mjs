// Check: what agents write appears in the open editor without a reload, and the view does not move
// (spec/live/streams.md). On its own copy of decks/example: six figure slides, the editor on the fourth. A `folio
// patch` of its note shows within 1.5 s; its figure overwritten in place under the same name with a picture of
// another width shows within 1.5 s; a slide file replaced as unlink then add (how NTFS can report an atomic
// rename) never leaves the rail; and the current slide and the column's scroll are the same after all three.
import { chromium } from "playwright";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { serve, sleep } from "./lib/server.mjs";

const LIMIT_MS = 1500;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const server = await serve({ decks: ["example"] });
const deck = server.deckDir("example");
const browser = await chromium.launch();

try {
  const painter = await browser.newPage();
  const picture = async (width, color) => {
    await painter.setViewportSize({ width, height: 120 });
    await painter.setContent(`<body style="margin:0;background:${color}"></body>`);
    return painter.screenshot();
  };
  mkdirSync(join(deck, "fig"), { recursive: true });
  const ids = ["f01", "f02", "f03", "f04", "f05", "f06"];
  for (const [i, id] of ids.entries()) {
    writeFileSync(join(deck, `fig/${id}.png`), await picture(200 + i, "#1b4f8a"));
    const slide = { root: "s", elements: { s: { type: "note-figure", props: { title: `LIVE ${id}`, note: `Note of ${id}.`, "label:a": "(a) A picture", "fig:a": `fig/${id}.png` }, children: [] } } };
    writeFileSync(join(deck, `slides/${id}.json`), `${JSON.stringify(slide, null, 2)}\n`);
  }
  const meta = JSON.parse(readFileSync(join(deck, "deck.json"), "utf8"));
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ ...meta, order: [...meta.order, ...ids] }, null, 2));
  const total = meta.order.length + ids.length;

  const page = await browser.newPage({ viewport: { width: 1400, height: 560 } });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(`${server.base}/${server.token("example")}/?slide=f04`, { waitUntil: "load" });
  const imgOf = `document.querySelector('main .folio-slide[data-slide="f04"] img[src*="fig/f04.png"]')`;
  await page.waitForFunction(`${imgOf}?.naturalWidth === 203`, null, { timeout: 15000 });
  await page.waitForFunction((n) => document.querySelectorAll("[data-rail-slide]").length === n, total, { timeout: 10000 });
  await sleep(800);
  await page.evaluate(() => {
    const rail = () => document.querySelectorAll("[data-rail-slide]").length;
    window.__railMin = rail();
    new MutationObserver(() => (window.__railMin = Math.min(window.__railMin, rail()))).observe(document.body, { childList: true, subtree: true });
  });
  const view = () => page.evaluate(() => {
    const main = document.querySelector("main");
    let rail = document.querySelector("[data-rail-slide]")?.parentElement;
    while (rail && rail.scrollHeight <= rail.clientHeight) rail = rail.parentElement;
    const current = main?.querySelector(".folio-slide")?.getAttribute("data-slide") ?? null;
    return { current, pan: `${main?.dataset.panX},${main?.dataset.panY}`, railScroll: rail ? Math.round(rail.scrollTop) : 0, url: location.search };
  });
  await page.evaluate(() => {
    let rail = document.querySelector("[data-rail-slide]")?.parentElement;
    while (rail && rail.scrollHeight <= rail.clientHeight) rail = rail.parentElement;
    if (rail) rail.scrollTop = 1e6;
  });
  const before = await view();
  const shownWithin = (probe, arg) => {
    const t0 = Date.now();
    return page.waitForFunction(probe, arg, { timeout: 5000 }).then(() => Date.now() - t0, () => -1);
  };

  const text = `Written by an agent ${Date.now()}`;
  await server.cliAsync(["patch", "decks/example/f04", "-", "--worker", "live"], JSON.stringify([{ op: "replace", path: "/elements/s/props/note", value: text }]));
  const patchMs = await shownWithin((s) => document.querySelector('main .folio-slide[data-slide="f04"]')?.innerText.includes(s), text);
  check("a folio patch of the slide in view shows within 1.5 s", patchMs >= 0 && patchMs <= LIMIT_MS, `${patchMs} ms after the CLI exited`);

  const replaced = await picture(260, "#e8a33d");
  writeFileSync(join(deck, "fig/f04.png"), replaced);
  const figureMs = await shownWithin(`${imgOf}?.naturalWidth === 260`);
  const src = await page.evaluate(`${imgOf}?.getAttribute("src")`);
  check("a figure overwritten in place under the same name shows within 1.5 s", figureMs >= 0 && figureMs <= LIMIT_MS, `${figureMs} ms after the write, src ${src}`);

  const file = join(deck, "slides/f05.json");
  const bytes = readFileSync(file, "utf8").replace("Note of f05.", "Replaced by unlink then add.");
  rmSync(file);
  await sleep(40);
  writeFileSync(file, bytes);
  const replaceMs = await shownWithin(() => document.querySelector('[data-rail-slide="f05"]')?.textContent.includes("Replaced by unlink then add."));
  await sleep(500);
  const railMin = await page.evaluate(() => window.__railMin);
  check("a slide replaced as unlink then add never leaves the rail", replaceMs >= 0 && railMin === total, `rail never below ${railMin} of ${total}, new text after ${replaceMs} ms`);

  const after = await view();
  check("the current slide, the pan and the rail's scroll are unchanged", before.current === "f04" && JSON.stringify(after) === JSON.stringify(before), `${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
} finally {
  await browser.close();
  await server.stop();
}
process.exit(results.length === 4 && results.every(Boolean) ? 0 : 1);
