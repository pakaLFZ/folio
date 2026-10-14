// Hooks on any slot, against a fresh copy of e2e/workspace on a free port. The probe pack's "notes" layout has a
// text slot `note` whose layout names the text-probe hook (upper-cases; FAIL fails, LONG makes six lines, NOTEXT
// answers nothing); the copy also gets lectern's chem-subscripts on its `formula` slot. Checks: text set through
// the HTTP API and the CLI renders the hook's output while the slide keeps the raw text; overflow measures the
// output; a failing hook falls back to the raw text with FOLIO-HOOK-002 and a danger badge; an empty answer is
// FOLIO-HOOK-012; editing in the browser edits the raw text; a table slot whose layout names table-probe (upper-cases
// cells; FAIL fails, GROW adds ten rows) draws the hook's rows, inline or from a .table.json file, its overflow
// (OVF-003) measures the output, and a failure falls back to the raw rows; a hooked caption flowing below the table
// shows its output under the table; a figure hook still draws. Usage: node e2e/hooks-any-slot.mjs
import { chromium } from "playwright";
import { cpSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, python, repo, start, until, workspace } from "./lib/server.mjs";
import { execFileSync } from "node:child_process";

const ws = workspace({ decks: [], from: join(repo, "e2e/workspace") });
const packFile = join(ws, "templates/probe-pack/pack.json");
const pack = JSON.parse(readFileSync(packFile, "utf8"));
pack.layouts.notes.slots.formula.hook = "chem-subscripts";
writeFileSync(packFile, JSON.stringify(pack, null, 2));
cpSync(join(repo, "templates/lectern/hooks/chem-subscripts"), join(ws, "templates/probe-pack/hooks/chem-subscripts"), { recursive: true });
writeFileSync(join(ws, "folio.local.toml"), `[runtimes]\npython = ${JSON.stringify(python)}\n`);

const deckDir = join(ws, "decks/notes");
const cli = (args, input) => execFileSync("node", [bin, ...args], { cwd: ws, input, encoding: "utf8" });
cli(["init-deck", deckDir, "--template", "probe-pack@1", "--title", "Text hooks"]);
cli(["new", deckDir, "--template", "notes", "--worker", "t"]);

const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const server = await start(ws);
const base = server.base;
const browser = await chromium.launch();
try {
  const t = (await (await fetch(`${base}/api/decks`)).json()).decks.find((d) => d.dir === deckDir).token;
  const setSlot = (slot, value) => fetch(`${base}/${t}/slides/s001`, { method: "PATCH", headers: { "x-folio-worker": "t" }, body: JSON.stringify([{ op: "add", path: `/elements/s/props/${slot}`, value }]) });
  const stateOf = async (slot) => (await (await fetch(`${base}/${t}/hooks`)).json()).slides.s001?.[slot];
  const stored = (slot) => JSON.parse(readFileSync(join(deckDir, "slides/s001.json"), "utf8")).elements.s.props[slot];
  const warnings = async () => (await (await fetch(`${base}/${t}/warnings`)).json()).warnings.filter((w) => w.location.slide === "s001" && w.state !== "absent");
  const outputFor = (slot, input) => until(async () => { const s = await stateOf(slot); return s?.phase === "ok" && JSON.stringify(s.output?.input) === JSON.stringify(input) && s; }, 15000);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(`${base}/${t}/?slide=s001`, { waitUntil: "load" });
  const note = page.locator('main [data-slot="note"] .folio-text');
  await note.waitFor();
  await until(async () => (await (await fetch(`${base}/api/streams`)).json()).streams >= 1, 10000);
  const shows = (locator, text) => page.waitForFunction(([sel, s]) => document.querySelector(sel)?.textContent === s, [locator, text], { timeout: 10000 }).then(() => true, () => false);
  const NOTE = 'main [data-slot="note"] .folio-text';

  await setSlot("note", "co2 binds here");
  const done = await outputFor("note", "co2 binds here");
  check("text set through the API runs the hook", done?.output?.output?.text === "CO2 BINDS HERE", JSON.stringify(done?.output));
  check("the slide keeps the raw text", stored("note") === "co2 binds here", JSON.stringify(stored("note")));
  check("the slot renders the hook's output", await shows(NOTE, "CO2 BINDS HERE"), JSON.stringify(await note.textContent()));

  cli(["patch", `${deckDir}/s001`, "-", "--worker", "t"], JSON.stringify([{ op: "add", path: "/elements/s/props/formula", value: "CO2 and H2O at 300 K" }]));
  await outputFor("formula", "CO2 and H2O at 300 K");
  const formula = page.locator('main [data-slot="formula"] .folio-text');
  const subs = await until(async () => { const html = await formula.innerHTML(); return /CO<sub>2<\/sub>/.test(html) && html; }, 10000);
  check("chem-subscripts set through the CLI renders CO_{2} as a subscript", !!subs && /H<sub>2<\/sub>O at 300 K/.test(subs) && stored("formula") === "CO2 and H2O at 300 K", `${subs}; stored ${JSON.stringify(stored("formula"))}`);

  await setSlot("note", "LONG note");
  await outputFor("note", "LONG note");
  const over = await until(async () => (await warnings()).find((w) => w.code === "FOLIO-OVF-001" && w.location.slot === "note"), 10000);
  check("overflow measures the output, not the one-line raw text", !!over && over.args.lines === 6, JSON.stringify(over?.args));

  await setSlot("note", "please FAIL");
  const failed = await until(async () => { const s = await stateOf("note"); return s?.phase === "failed" && s; }, 15000);
  const hookWarn = await until(async () => (await warnings()).find((w) => w.code === "FOLIO-HOOK-002" && w.location.slot === "note"), 5000);
  check("a failing hook raises FOLIO-HOOK-002", !!failed && !!hookWarn, `${failed?.phase}; ${hookWarn?.message}`);
  check("a failing hook falls back to the raw text", await shows(NOTE, "please FAIL"), JSON.stringify(await note.textContent()));
  const badge = await page.locator('main [data-slot="note"] [data-hook-badge]').getAttribute("data-hook-badge").catch(() => null);
  check("the failed slot carries the danger badge in Edit", badge === "failed", String(badge));
  check("the overflow of the old output is gone", !(await warnings()).some((w) => w.code === "FOLIO-OVF-001" && w.location.slot === "note"), "no OVF-001 on note");

  await setSlot("note", "NOTEXT");
  const empty = await until(async () => (await warnings()).find((w) => w.code === "FOLIO-HOOK-012" && w.location.slot === "note"), 15000);
  check("a hook that answers no text is FOLIO-HOOK-012", !!empty, empty?.message ?? "none");

  await setSlot("note", "edit me");
  await outputFor("note", "edit me");
  await shows(NOTE, "EDIT ME");
  await note.click();
  const raw = await note.textContent();
  await page.keyboard.press("End");
  await page.keyboard.type(" now");
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  const saved = await until(() => stored("note") === "edit me now", 5000);
  await outputFor("note", "edit me now");
  check("editing in the browser edits the raw text, and the output follows", raw === "edit me" && !!saved && (await shows(NOTE, "EDIT ME NOW")), `focused ${JSON.stringify(raw)}; stored ${JSON.stringify(stored("note"))}`);

  const TABLE = 'main [data-slot="table:a"] table';
  const cellsOf = () => page.locator(TABLE).evaluate((t) => [...t.querySelectorAll("th, td")].map((c) => c.textContent)).catch(() => null);
  const tableShows = (cells) => until(async () => JSON.stringify(await cellsOf()) === JSON.stringify(cells), 10000);
  const gases = { columns: ["gas", "site"], rows: [["co2", "open metal"]] };
  await setSlot("table:a", gases);
  const tableDone = await outputFor("table:a", gases);
  check("a table set through the API runs its table hook", JSON.stringify(tableDone?.output?.output) === JSON.stringify({ columns: ["GAS", "SITE"], rows: [["CO2", "OPEN METAL"]] }), JSON.stringify(tableDone?.output));
  check("the table slot draws the hook's rows and the slide keeps the raw rows", !!(await tableShows(["GAS", "SITE", "CO2", "OPEN METAL"])) && JSON.stringify(stored("table:a")) === JSON.stringify(gases), `${JSON.stringify(await cellsOf())}; stored ${JSON.stringify(stored("table:a"))}`);

  await setSlot("caption", "under the table");
  await outputFor("caption", "under the table");
  const flowed = await until(async () => {
    const [table, caption] = await Promise.all([page.locator(TABLE).boundingBox(), page.locator('main [data-slot="caption"] .folio-text').boundingBox()]);
    const text = await page.locator('main [data-slot="caption"] .folio-text').textContent();
    return text === "UNDER THE TABLE" && table && caption && caption.y >= table.y + table.height && { table, caption };
  }, 10000);
  check("a hooked caption flowing below the table shows its output under the table", !!flowed, JSON.stringify(flowed));

  const grow = { columns: ["gas", "site"], rows: [["GROW", "x"]] };
  await setSlot("table:a", grow);
  await outputFor("table:a", grow);
  const tall = await until(async () => (await warnings()).find((w) => w.code === "FOLIO-OVF-003" && w.location.slot === "table:a"), 10000);
  check("table overflow measures the hook's eleven rows, not the raw one", !!tall && tall.args.rows === 11, JSON.stringify(tall?.args));

  const bad = { columns: ["gas", "site"], rows: [["FAIL", "x"]] };
  await setSlot("table:a", bad);
  const tableFailed = await until(async () => { const s = await stateOf("table:a"); return s?.phase === "failed" && s; }, 15000);
  const tableWarn = await until(async () => (await warnings()).find((w) => w.code === "FOLIO-HOOK-002" && w.location.slot === "table:a"), 5000);
  check("a failing table hook falls back to the raw rows with FOLIO-HOOK-002", !!tableFailed && !!tableWarn && !!(await tableShows(["gas", "site", "FAIL", "x"])), JSON.stringify(await cellsOf()));
  check("the table overflow of the old output is gone", !!(await until(async () => !(await warnings()).some((w) => w.code === "FOLIO-OVF-003" && w.location.slot === "table:a"), 5000)), "no OVF-003 on table:a");

  writeFileSync(join(deckDir, "sites.table.json"), JSON.stringify({ columns: ["gas"], rows: [["n2"]] }));
  await setSlot("table:a", { src: "sites.table.json" });
  const fromFile = await outputFor("table:a", { columns: ["gas"], rows: [["n2"]] });
  check("a table from a .table.json file runs the hook on the file's rows", !!fromFile && !!(await tableShows(["GAS", "N2"])), JSON.stringify(await cellsOf()));

  await setSlot("fig:a", { hook: "probe", inputs: { label: "still draws" } });
  const fig = await until(async () => { const s = await stateOf("fig:a"); return s?.phase === "ok" && s; }, 15000);
  check("a figure hook still draws", !!fig && fig.ext === "png", JSON.stringify(fig));
} finally {
  await browser.close();
  await server.stop();
}
const failed = results.filter((ok) => !ok).length;
console.log(`${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
