// Browser check for table slots and below flow, on a fixture pack "table-pack" (lectern's fonts and default table
// style plus a second style "minimal", one layout: a table, a note below it with a 12 pt gap, a figure beside) and a
// deck "tables" written here:
// the table is as tall as its rows (header plus rows x row height), the note starts 12 pt under it and moves down
// one row when a row is added, a slide's tableStyle switches to another named style, a table past its box's
// height and a wrapping cell are warned by folio check, and the PDF carries the cell text as selectable text.
// Serves its own workspace; needs pdftotext on PATH.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const packDir = join(root, "templates/table-pack");
cpSync(join(root, "templates/lectern"), packDir, { recursive: true });
rmSync(join(packDir, "hooks"), { recursive: true, force: true });
const lec = JSON.parse(readFileSync(join(packDir, "pack.json"), "utf8"));
const TABLE_BOX = [25, 100, 500, 300];
const MINIMAL = { description: "No fills: a bold header and thin rules between rows.", size: 14, lineHeight: 1.2, align: "left", header: true, headerWeight: 700, cellPad: [3.6, 7.2, 3.6, 7.2], rule: { color: "#7F7F7F", width: 0.5, outer: false, rows: true, columns: false } };
const NOTE_BOX = [25, 100, 500, 420];
writeFileSync(join(packDir, "pack.json"), JSON.stringify({
  ...lec,
  name: "table-pack",
  usage: null,
  tables: { ...lec.tables, minimal: MINIMAL },
  layouts: {
    "table-note": {
      background: "plain",
      description: "A table, a note under it, a figure beside.",
      slots: {
        title: { role: "title", box: [25, 20, 900, 30], lines: 1 },
        "table:a": { role: "table", box: TABLE_BOX, tableStyle: "default" },
        note: { role: "note", box: NOTE_BOX, below: { slot: "table:a", gap: 12 } },
        "fig:a": { role: "figure", box: [550, 100, 380, 300] },
      },
    },
  },
}, null, 2));
const style = lec.tables.default;
const ROW = style.size * style.lineHeight + style.cellPad[0] + style.cellPad[2];

const deckDir = join(root, "decks/tables");
mkdirSync(join(deckDir, "slides"), { recursive: true });
const rows = (n, text = (i) => `CO_{2} site ${i + 1}`) => Array.from({ length: n }, (_, i) => [text(i), `${(i + 1) * 12} kJ mol^{-1}`]);
const slide = (props) => ({ root: "s", elements: { s: { type: "table-note", props, children: [] } } });
const writeSlide = (id, props) => writeFileSync(join(deckDir, "slides", `${id}.json`), JSON.stringify(slide(props), null, 2));
const columns = ["Adsorption site", "Binding energy"];
writeFileSync(join(deckDir, "deck.json"), JSON.stringify({ id: "7ab1e5007ab1e500", title: "Tables", template: `table-pack@${lec.version}`, order: ["s001", "s002", "s003", "s004"] }, null, 2));
writeSlide("s001", { title: "Inline table", "table:a": { columns, rows: rows(3) }, note: "The note sits under the table." });
writeFileSync(join(deckDir, "sites.table.json"), JSON.stringify({ columns, rows: rows(2) }));
writeSlide("s002", { title: "Table from a file, minimal style", "table:a": { src: "sites.table.json", tableStyle: "minimal" }, note: "Another style." });
writeSlide("s003", { title: "Too many rows", "table:a": { columns, rows: rows(14) }, note: "Pushed out." });
writeSlide("s004", { title: "A wrapping cell", "table:a": { columns, rows: [["A site whose name is far too long to stay on one line of a table column in this box at all", "1"]] } });

const server = await start(root);
const token = server.token("tables");
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));

const geometry = () => page.evaluate(() => {
  const pt = (px) => Math.round((px / (4 / 3)) * 10) / 10;
  const table = document.querySelector('main [data-slot="table:a"] table');
  const note = document.querySelector('main [data-slot="note"]');
  return table && note ? { table: pt(table.offsetHeight), noteTop: pt(note.offsetTop), noteHeight: pt(note.offsetHeight), header: getComputedStyle(table.querySelector("th")).backgroundColor, style: table.parentElement.dataset.tableStyle } : null;
});
await page.goto(`${server.base}/${token}/?slide=s001&mode=view`, { waitUntil: "load" });
const g3 = await until(geometry);
await until(async () => (await (await fetch(`${server.base}/api/streams`)).json()).streams >= 1, 10000);
const close = (a, b) => Math.abs(a - b) < 0.6;
check("table height is header plus rows x row height", !!g3 && close(g3.table, 4 * ROW), `${g3?.table} pt for 3 rows, expected ${4 * ROW}`);
check("note starts 12 pt under the table, bottom fixed", !!g3 && close(g3.noteTop, TABLE_BOX[1] + g3.table + 12) && close(g3.noteTop + g3.noteHeight, NOTE_BOX[1] + NOTE_BOX[3]), JSON.stringify(g3));

writeSlide("s001", { title: "Inline table", "table:a": { columns, rows: rows(4) }, note: "The note sits under the table." });
const g4 = await until(async () => {
  const g = await geometry();
  return g && g.table > g3.table + 1 ? g : null;
});
check("adding a row moves the note down one row", !!g4 && close(g4.noteTop - g3.noteTop, ROW) && close(g4.table, 5 * ROW), `note ${g3?.noteTop} -> ${g4?.noteTop} pt, table ${g4?.table} pt`);
const rgb = (hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;
check("layout's table style by default", g3?.style === "default" && g3.header === rgb(style.headerFill), `${g3?.style} header ${g3?.header}, expected ${rgb(style.headerFill)}`);

await page.goto(`${server.base}/${token}/?slide=s002&mode=view`, { waitUntil: "load" });
const gm = await until(geometry);
check("a slide's tableStyle switches to another named style, rows read from the file", gm?.style === "minimal" && gm.header === "rgba(0, 0, 0, 0)" && close(gm.table, 3 * ROW), JSON.stringify(gm));

const report = JSON.parse(await server.cliAsync(["check", "decks/tables", "--json"]));
const codes = (slideId) => report.warnings.filter((w) => w.location.slide === slideId && w.source === "overflow").map((w) => w.code).sort().join(",");
check("rows within the box raise nothing", codes("s001") === "" && codes("s002") === "", `s001 [${codes("s001")}] s002 [${codes("s002")}]`);
check("a table past its box's height is warned", codes("s003").includes("FOLIO-OVF-003"), `s003 [${codes("s003")}]`);
// The long cell wraps, and the auto column widths it takes squeeze the other header ("Binding energy") onto two
// lines as well: two real wrapping cells, one warning each.
const wraps = report.warnings.filter((w) => w.location.slide === "s004" && w.source === "overflow").map((w) => `${w.code} ${w.args.cell ?? ""}`).sort();
check("each wrapping cell is warned once", wraps.join() === "FOLIO-OVF-004 header, column 2,FOLIO-OVF-004 row 1, column 1", wraps.join());

const out = join(root, "tables.pdf");
await server.cliAsync(["pdf", "decks/tables", "--out", out]);
const text = execFileSync("pdftotext", ["-f", "1", "-l", "1", out, "-"], { encoding: "utf8" });
check("the PDF carries the table text as text", text.includes("Adsorption site") && text.includes("Binding energy") && text.includes("site 4"), text.replace(/\s+/g, " ").slice(0, 120));

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
