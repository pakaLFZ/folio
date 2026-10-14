// Tables are traced, against a fresh copy of e2e/workspace on a free port. The probe pack's "notes" layout has
// table:a whose layout names table-probe (upper-cases cells); the copy adds an unhooked table:b. Checks: a hooked
// table's `folio trace` prints its record and a regenerate line whose output matches by sha256; table:b read from a
// .table.json written by folio_hook.write_table draws the file live, and `folio trace` reports its hash and source
// script; rewriting the file redraws the table live; an inline table of numbers is the note FOLIO-TAB-002 in
// `folio check` and "untraced: inline table" in `folio trace`, and one of words is not; the PDF's /FolioTrace
// lists both table slots. Usage: node e2e/table-trace.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, python, repo, start, until, workspace } from "./lib/server.mjs";

const ws = workspace({ decks: [], from: join(repo, "e2e/workspace"), name: "table-trace" });
const packFile = join(ws, "templates/probe-pack/pack.json");
const pack = JSON.parse(readFileSync(packFile, "utf8"));
pack.layouts.notes.slots["table:b"] = { role: "table", box: [640, 300, 300, 120], tableStyle: Object.keys(pack.tables)[0] };
writeFileSync(packFile, JSON.stringify(pack, null, 2));
writeFileSync(join(ws, "folio.local.toml"), `[runtimes]\npython = ${JSON.stringify(python)}\n`);

const deckDir = join(ws, "decks/tables");
const cli = (args, cwd = ws) => execFileSync("node", [bin, ...args], { cwd, encoding: "utf8" });
cli(["init-deck", deckDir, "--template", "probe-pack@1", "--title", "Table trace"]);
cli(["new", deckDir, "--template", "notes", "--worker", "t"]);
const writeTable = (rows) => execFileSync(python, ["-c", `import json, sys\nfrom folio_hook import write_table\nwrite_table(sys.argv[1], ["hop", "barrier"], json.loads(sys.argv[2]), script="make_barriers.py", inputs=[sys.argv[3]])`, join(deckDir, "b.table.json"), JSON.stringify(rows), join(deckDir, "deck.json")], { env: { ...process.env, PYTHONPATH: join(repo, "python") } });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

const results = [];
const check = (name, ok, seen) => (results.push(!!ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const server = await start(ws);
const browser = await chromium.launch();
try {
  const t = (await (await fetch(`${server.base}/api/decks`)).json()).decks.find((d) => d.dir === deckDir).token;
  const setSlot = (slot, value) => fetch(`${server.base}/${t}/slides/s001`, { method: "PATCH", headers: { "x-folio-worker": "t" }, body: JSON.stringify([{ op: "add", path: `/elements/s/props/${slot}`, value }]) });
  const traceOf = async (slot) => (await (await fetch(`${server.base}/${t}/trace/s001/${encodeURIComponent(slot)}`)).json());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(`${server.base}/${t}/?slide=s001`, { waitUntil: "load" });
  await page.locator('main [data-slot="note"]').waitFor();

  await setSlot("table:a", { columns: ["gas"], rows: [["co2"]] });
  const hooked = await until(async () => { const x = await traceOf("table:a"); return x.state === "traced" && x.phase === "ok" && x; }, 20000);
  const printed = cli(["trace", `${deckDir}/s001`, "table:a"]);
  const line = /^regenerate: (folio hook run .*)$/m.exec(printed)?.[1];
  check("folio trace prints a table hook's record and regenerate line", hooked && line?.includes("--fresh"), line);
  const elsewhere = mkdtempSync(join(ws, "regen-"));
  const regen = cli(line.split(" ").slice(1).map((w) => w.replace(/^'|'$/g, "")), elsewhere);
  const out = readFileSync(join(elsewhere, `${hooked.trace.key}.json`));
  check("the regenerate line makes the same rows, same sha256", /matches the trace/.test(regen) && sha(out) === hooked.trace.output.sha256 && JSON.parse(out).rows[0][0] === "CO2", regen.trim().split("\n").pop());

  writeTable([["Path A", "0.52 eV"]]);
  await setSlot("table:b", { src: "b.table.json" });
  const cells = () => page.locator('main [data-slot="table:b"] table').evaluate((x) => [...x.querySelectorAll("td")].map((c) => c.textContent)).catch(() => null);
  const firstDrawn = await until(async () => JSON.stringify(await cells()) === JSON.stringify(["Path A", "0.52 eV"]), 10000);
  const fileTrace = await until(async () => { const x = await traceOf("table:b"); return x.file?.matches && x; }, 10000);
  check("a table file is drawn and traced with its hash and source", firstDrawn && fileTrace?.state === "file" && fileTrace.file.source?.script.endsWith("make_barriers.py") && fileTrace.file.sha256 === sha(readFileSync(join(deckDir, "b.table.json"))), JSON.stringify(fileTrace?.file));
  const cliFile = cli(["trace", `${deckDir}/s001`, "table:b"]);
  check("folio trace reports the file, its hash and its source", /^file: b\.table\.json$/m.test(cliFile) && /the file drawn/.test(cliFile) && /^source: .*make_barriers\.py/m.test(cliFile), cliFile.split("\n").slice(0, 3).join(" | "));

  writeTable([["Path B", "0.61 eV"]]);
  const live = await until(async () => JSON.stringify(await cells()) === JSON.stringify(["Path B", "0.61 eV"]), 10000);
  const redrawn = await until(async () => { const x = await traceOf("table:b"); return x.file?.matches && x.file.sha256 === sha(readFileSync(join(deckDir, "b.table.json"))); }, 10000);
  check("rewriting the file redraws the table live and the drawn hash follows", live && redrawn, JSON.stringify(await cells()));

  const pdf = join(ws, "tables.pdf");
  cli(["pdf", deckDir, "--out", pdf]);
  const entry = /\/FolioTrace \((.*?)\)>>/s.exec(readFileSync(pdf, "latin1"))?.[1]?.replace(/\\(.)/g, "$1");
  const slots = entry ? JSON.parse(entry).pages[0].slots : {};
  check("the PDF lists both table slots", slots["table:a"]?.hook === "probe-pack/table-probe@1" && slots["table:b"]?.file === "b.table.json", JSON.stringify(slots));

  await setSlot("table:b", { columns: ["hop", "barrier"], rows: [["Path A", "0.52"]] });
  const numeric = JSON.stringify(JSON.parse(cli(["check", deckDir, "--json"])));
  const untraced = cli(["trace", `${deckDir}/s001`, "table:b"]);
  check("an inline table of numbers is the note FOLIO-TAB-002 and untraced", /"FOLIO-TAB-002"[^}]*"note"|"note"[^}]*"FOLIO-TAB-002"/.test(numeric) && /^untraced: inline table/.test(untraced), untraced.trim());
  await setSlot("table:b", { columns: ["hop", "crossing"], rows: [["Path A", "end-on"]] });
  check("an inline table of words is not", !cli(["check", deckDir, "--json"]).includes("FOLIO-TAB-002"), "no FOLIO-TAB-002");
} finally {
  await browser.close();
  await server.stop();
}
process.exit(results.every(Boolean) ? 0 : 1);
