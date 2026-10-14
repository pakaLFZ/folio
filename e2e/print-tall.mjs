// Check: a deck whose print page is taller than the browser loads ahead (spec/slides/pdf.md), on its own copy of
// decks/example. Twelve figure slides put pictures thousands of pixels below the first screen; a lazy picture
// there never loaded, so `shot`, `check` and `pdf` of the whole deck timed out after 60 s while one slide took
// a second (2026-10-13). Each must now finish in seconds. A picture made never to
// answer must make the print page fail naming its slide, slot and file, not a bare timeout.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { register } from "tsx/esm/api";
import { bin, serve } from "./lib/server.mjs";

register();
const { openPrintPage } = await import("../packages/server/src/index.ts");

const SLIDES = 12;
const STUCK = "fig/fig-07.png";
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const server = await serve({ decks: ["example"] });
const deck = server.deckDir("example");
const browser = await chromium.launch();

try {
  const painter = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await painter.setContent('<body style="margin:0;background:linear-gradient(135deg,#1b4f8a,#e8a33d)"></body>');
  const png = await painter.screenshot();
  await painter.close();
  mkdirSync(join(deck, "fig"), { recursive: true });
  const ids = Array.from({ length: SLIDES }, (_, i) => `t${String(i + 1).padStart(2, "0")}`);
  ids.forEach((id, i) => {
    const file = `fig/fig-${String(i + 1).padStart(2, "0")}.png`;
    writeFileSync(join(deck, file), png);
    const slide = { root: "s", elements: { s: { type: "note-figure", props: { title: `TALL ${i + 1}`, note: "One picture per slide.", "label:a": "(a) A picture", "fig:a": file }, children: [] } } };
    writeFileSync(join(deck, `slides/${id}.json`), JSON.stringify(slide, null, 2));
  });
  const order = JSON.parse(readFileSync(join(deck, "deck.json"), "utf8"));
  writeFileSync(join(deck, "deck.json"), JSON.stringify({ ...order, order: [...order.order, ...ids] }, null, 2));
  const total = order.order.length + SLIDES;

  const timed = (...args) => {
    const started = Date.now();
    const run = spawnSync("node", [bin, ...args], { cwd: server.root, encoding: "utf8", timeout: 40_000 });
    return { ...run, seconds: (Date.now() - started) / 1000 };
  };
  const shot = timed("shot", "decks/example", "--sheet", "--json");
  const shots = shot.status === 0 ? JSON.parse(shot.stdout).shots.length : 0;
  check(`shot --sheet of all ${total} slides finishes in seconds`, shot.status === 0 && shots === total && shot.seconds < 30, `${shots} shots, exit ${shot.status}, ${shot.seconds.toFixed(1)} s ${shot.stderr.trim().split("\n")[0] ?? ""}`);
  const checked = timed("check", "decks/example", "--json");
  check("check of the whole deck finishes in seconds", checked.status !== null && checked.seconds < 30 && !/Timeout/.test(checked.stderr), `exit ${checked.status}, ${checked.seconds.toFixed(1)} s`);
  const pdf = timed("pdf", "decks/example", "--out", join(server.root, "tall.pdf"));
  check("pdf of the whole deck finishes in seconds", pdf.status === 0 && pdf.seconds < 30, `exit ${pdf.status}, ${pdf.seconds.toFixed(1)} s`);

  const pictures = await openPrintPage(browser, server.base, server.token("example"), undefined, 20_000).then(async ({ page }) => {
    const loaded = await page.evaluate(() => [...document.images].filter((img) => img.closest("[data-slot]")).map((img) => img.complete && img.naturalWidth > 0));
    await page.close();
    return loaded;
  }, (error) => [error.message]);
  check("every picture on the print page has loaded when it is ready", pictures.length >= SLIDES && pictures.every((p) => p === true), `${pictures.filter((p) => p === true).length} of ${pictures.length} ${pictures.find((p) => typeof p === "string") ?? ""}`);

  const stalling = { newPage: async (options) => {
    const page = await browser.newPage(options);
    await page.route(`**/${STUCK}*`, () => {});
    return page;
  } };
  const failure = await openPrintPage(stalling, server.base, server.token("example"), undefined, 4000).then(() => "ready", (error) => error.message);
  check("a picture that never loads is named by slide, slot and file", /not ready after 4 s; still waiting for t07\/fig:a image \S*fig-07\.png$/.test(failure), failure);
} finally {
  await browser.close();
  await server.stop();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
