// Deck export and import, CLI only, in isolated workspaces under scratch/e2e. The fixture deck "example" (s002's
// fig:a drawn by lectern's line-plot hook, titles through chem-subscripts) gets a plot-table slide reading a
// .table.json file. Checks: `folio deck export --pdf` writes example.folio.zip holding the deck, the pack, the drawn
// hook figure, the table file, the PDF, a manifest (slides with layout, title, slots; sha256 per file) and a README;
// a second export is numbered, never replacing the first; the zip imports into an empty folder (no templates, no
// Python) and `folio check` there reports no error code the source did not, with no hook failure; the imported deck
// prints with the same page count; a tampered file is refused by name and nothing is written; an installed pack
// with other files is refused by name, and --pack-as installs the exported one under another name.
// Usage: node e2e/deck-export.mjs
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, repo, workspace } from "./lib/server.mjs";

const results = [];
const check = (name, ok, detail) => (results.push(!!ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const folio = (args, cwd) => {
  const r = spawnSync("node", [bin, ...args], { cwd, encoding: "utf8", timeout: 240_000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
};
const pages = (bytes) => (bytes.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
const activeWarnings = (cwd, deck) => {
  const r = spawnSync("node", [bin, "check", deck, "--json"], { cwd, encoding: "utf8", timeout: 240_000 });
  return JSON.parse(r.stdout).warnings.filter((w) => w.state !== "absent");
};

const src = workspace({ decks: ["example"], name: "deck-export" });
const deckDir = join(src, "decks/example");
writeFileSync(join(deckDir, "vals.table.json"), JSON.stringify({ columns: ["hop", "barrier"], rows: [["Path A", "0.52 eV"], ["Path B", "0.61 eV"]] }, null, 2));
folio(["new", deckDir, "--template", "plot-table", "--worker", "t", "--props", JSON.stringify({ title: "Barriers", "table:b": { src: "vals.table.json" } })], src);

const out = join(src, "out");
mkdirSync(out);
let r = folio(["deck", "export", deckDir, "--dir", out, "--pdf"], src);
const zip = join(out, "example.folio.zip");
check("export --pdf writes example.folio.zip", r.code === 0 && existsSync(zip), r.out.trim().split("\n").join(" | "));
r = folio(["deck", "export", deckDir, "--dir", out], src);
check("a second export is numbered, the first kept", r.code === 0 && existsSync(join(out, "example-1.folio.zip")), readdirSync(out).join(", "));
r = folio(["deck", "export", deckDir, "--out", zip], src);
check("--out onto an existing file is refused", r.code === 2 && /already exists/.test(r.out), r.out.trim());

const listing = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n");
const manifest = JSON.parse(execFileSync("unzip", ["-p", zip, "manifest.json"], { encoding: "utf8" }));
const has = (re) => listing.some((p) => re.test(p));
check("the zip holds deck, pack, hook figure, table file, PDF and README", has(/^templates\/lectern\/pack\.json$/) && has(/^templates\/lectern\/fonts\/LICENSE-/) && has(/^decks\/example\/\.folio\/hooks\/[0-9a-f]{16}\.png$/) && has(/^decks\/example\/vals\.table\.json$/) && has(/^example\.pdf$/) && has(/^README\.md$/), `${listing.length - 1} entries`);
const s3 = manifest.slides[2];
check("the manifest has every page's details and every file's sha256", manifest.slides.length === 3 && s3.layout === "plot-table" && s3.title === "Barriers" && s3.slots.includes("table:b") && s3.files.includes("vals.table.json") && Object.keys(manifest.files).length === listing.filter(Boolean).length - 1, `${manifest.slides.map((s) => `${s.id} ${s.layout}`).join(", ")}; ${Object.keys(manifest.files).length} digests`);
const srcPdf = Buffer.from(execFileSync("unzip", ["-p", zip, "example.pdf"]));

const before = activeWarnings(src, deckDir);
const fresh = mkdtempSync(join(repo, "scratch/e2e", "deck-export-into-"));
r = folio(["deck", "import", zip, "--into", fresh], fresh);
check("import into an empty folder installs the deck and the pack", r.code === 0 && existsSync(join(fresh, "templates/lectern/pack.json")) && existsSync(join(fresh, "decks/example/deck.json")) && !existsSync(join(fresh, "folio.local.toml")), r.out.trim().split("\n").slice(-3).join(" | "));
const after = activeWarnings(fresh, "decks/example");
const errors = (ws) => new Set(ws.filter((w) => w.severity === "error").map((w) => `${w.code} ${w.location.slide}/${w.location.slot ?? ""}`));
const newErrors = [...errors(after)].filter((e) => !errors(before).has(e));
const hookTrouble = after.filter((w) => /^FOLIO-HOOK/.test(w.code));
check("folio check after import: no new errors, no hook ran or failed without Python", newErrors.length === 0 && hookTrouble.length === 0 && after.length === before.length, `${before.length} warnings before, ${after.length} after; new errors: ${newErrors.join(", ") || "none"}; hook warnings: ${hookTrouble.map((w) => w.code).join(", ") || "none"}`);
r = folio(["pdf", "decks/example", "--out", join(fresh, "imported.pdf")], fresh);
const importedPages = existsSync(join(fresh, "imported.pdf")) ? pages(readFileSync(join(fresh, "imported.pdf"))) : -1;
check("the imported deck prints the same number of pages", r.code === 0 && importedPages === pages(srcPdf) && importedPages === 3, `${pages(srcPdf)} exported, ${importedPages} imported`);

const tamper = mkdtempSync(join(repo, "scratch/e2e", "deck-export-tamper-"));
const bad = join(tamper, "bad.folio.zip");
execFileSync("cp", [zip, bad]);
mkdirSync(join(tamper, "decks/example"), { recursive: true });
writeFileSync(join(tamper, "decks/example/vals.table.json"), JSON.stringify({ columns: ["hop", "barrier"], rows: [["Path A", "9.999 eV"]] }));
execFileSync("zip", ["-q", bad, "decks/example/vals.table.json"], { cwd: tamper });
r = folio(["deck", "import", bad, "--into", fresh, "--name", "tampered"], fresh);
check("a tampered file is refused by name, nothing written", r.code === 2 && r.out.includes("decks/example/vals.table.json does not match its sha256") && !existsSync(join(fresh, "decks/tampered")), r.out.trim().split("\n").slice(0, 2).join(" | "));

r = folio(["deck", "import", zip, "--into", fresh], fresh);
check("an existing deck folder is refused, naming --name", r.code === 2 && r.out.includes("--name"), r.out.trim());
const packFile = join(fresh, "templates/lectern/pack.json");
writeFileSync(packFile, readFileSync(packFile, "utf8").replace('"name": "lectern"', '"name": "lectern", "description": "edited"'));
r = folio(["deck", "import", zip, "--into", fresh, "--name", "again"], fresh);
check("an installed pack with other files is refused, naming them", r.code === 2 && r.out.includes("pack.json: differs") && r.out.includes("--pack-as") && !existsSync(join(fresh, "decks/again")), r.out.trim().split("\n").slice(0, 2).join(" | "));
r = folio(["deck", "import", zip, "--into", fresh, "--name", "again", "--pack-as", "lectern-x"], fresh);
const pinned = existsSync(join(fresh, "decks/again/deck.json")) ? JSON.parse(readFileSync(join(fresh, "decks/again/deck.json"), "utf8")) : {};
const listed = folio(["slide", "list", "decks/again"], fresh);
check("--pack-as installs the pack under another name, re-pins the deck and gives it a fresh id", r.code === 0 && pinned.template === "lectern-x@2" && pinned.id !== manifest.deck.id && listed.code === 0 && listed.out.includes("plot-table"), `${pinned.template}, id ${pinned.id}; ${r.out.trim().split("\n").filter((l) => /id/.test(l)).join(" ")}`);

process.exit(results.every(Boolean) ? 0 : 1);
