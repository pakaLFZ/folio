// Check: folio shot (spec/slides/shots.md) on its own copy of decks/example, headless, no server.
// One PNG per slide at 960 px under <deck>/.shots/ with its .gitignore; --slides ids and id ranges, --pages
// positions and ranges, --width and --out honoured; --changed shoots only what changed and keeps the rest;
// --warned only slides with warnings or errors (--notes adds notes); sheets paginate (--per-sheet) and are
// listed with their slide range; --marks paints red where the overflowing slot is and nothing red on a
// note-only slide (s002's six warnings include three FOLIO-VOC-001 from the lectern vocabulary bank); the sheet labels a note-only slide "1 note" in grey; --json matches folio check --json;
// a removed slide's picture goes; the wall time is printed.
import { chromium } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, workspace } from "./lib/server.mjs";

const root = workspace({ decks: ["example"] });
const deckDir = join(root, "decks/example");
const shots = join(deckDir, ".shots");
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
const shotJson = (...args) => JSON.parse(folio("shot", "decks/example", "--json", ...args));
const shotIds = (...args) => shotJson(...args).shots.map((s) => s.slide).join();
const pngs = (dir) => readdirSync(dir).filter((f) => f.endsWith(".png")).sort().join(" ");
const size = (file) => {
  const png = readFileSync(file);
  return { w: png.readUInt32BE(16), h: png.readUInt32BE(20) };
};
const writeDeck = (order) => {
  const deck = JSON.parse(readFileSync(join(deckDir, "deck.json"), "utf8"));
  writeFileSync(join(deckDir, "deck.json"), JSON.stringify({ ...deck, order }, null, 2));
};

const started = Date.now();
const plain = folio("shot", "decks/example");
const seconds = (Date.now() - started) / 1000;
const s002 = readFileSync(join(shots, "s002.png"));
const sizes = ["s001", "s002"].map((id) => size(join(shots, `${id}.png`)));
check("one PNG per slide at 960 x 540 under <deck>/.shots/", sizes.every((s) => s.w === 960 && s.h === 540), JSON.stringify(sizes));
check("the folder ignores itself in git", readFileSync(join(shots, ".gitignore"), "utf8").trim() === "*", readdirSync(shots).join(" "));
check("the paths, the warnings and the wall time are printed", /decks\/example\/\.shots\/s002\.png/.test(plain) && /FOLIO-OVF-001/.test(plain) && /shot 2 of 2 slides at 960 px in [\d.]+ s/.test(plain), plain.split("\n").at(-2));
console.log(`      folio shot, 2 slides, whole command: ${seconds.toFixed(1)} s`);

const out = join(root, "only");
folio("shot", "decks/example", "--slides", "s002", "--width", "640", "--out", out);
check("--slides, --width and --out are honoured", pngs(out) === "s002.png" && JSON.stringify(size(join(out, "s002.png"))) === '{"w":640,"h":360}', `${pngs(out)} ${JSON.stringify(size(join(out, "s002.png")))}`);

copyFileSync(join(shots, "s001.png"), join(deckDir, "plain.png"));
const plainSlide = { root: "s", elements: { s: { type: "note-figure", props: { title: "PLAIN", subtitle: "A picture no hook made", note: "Short note.", "label:a": "(a) A plain picture", "fig:a": "plain.png" }, children: [] } } };
writeFileSync(join(deckDir, "slides/s003.json"), JSON.stringify(plainSlide, null, 2));
writeDeck(["s001", "s002", "s003"]);
check("--slides takes an id range in deck order", shotIds("--slides", "s002-s003") === "s002,s003", shotIds("--slides", "s003-s002"));
check("--pages takes positions and ranges", shotIds("--pages", "1,3") === "s001,s003" && shotIds("--pages", "2-3") === "s002,s003", shotIds("--pages", "1,3"));
const badPage = spawnSync("node", [bin, "shot", "decks/example", "--pages", "9"], { cwd: root, encoding: "utf8" });
check("a page the deck does not have is refused by name", badPage.status === 2 && /--pages 9 .*1-3/.test(badPage.stderr), badPage.stderr.trim());

const s003Plain = folio("shot", "decks/example", "--slides", "s003") && readFileSync(join(shots, "s003.png"));
folio("shot", "decks/example");
const unchanged = shotJson("--changed");
const s001Time = statSync(join(shots, "s001.png")).mtimeMs;
const s002Plain = JSON.parse(readFileSync(join(deckDir, "slides/s002.json"), "utf8"));
s002Plain.elements.s.props["label:a"] = "(a) Energy profile, edited";
writeFileSync(join(deckDir, "slides/s002.json"), JSON.stringify(s002Plain, null, 2));
const edited = shotJson("--changed");
check("--changed shoots nothing when nothing changed", unchanged.shots.length === 0 && unchanged.kept === 3, `${unchanged.shots.length} shot, ${unchanged.kept} kept`);
check("--changed shoots only the edited slide and keeps the other pictures", edited.shots.map((s) => s.slide).join() === "s002" && edited.kept === 2 && statSync(join(shots, "s001.png")).mtimeMs === s001Time, `${edited.shots.map((s) => s.slide)} shot, ${edited.kept} kept`);
check("--warned shoots only slides with warnings or errors; --notes adds notes", shotIds("--warned") === "s002" && shotIds("--warned", "--notes") === "s002,s003", `${shotIds("--warned")} / ${shotIds("--warned", "--notes")}`);

const paged = folio("shot", "decks/example", "--sheet", "--per-sheet", "2");
const sheetSizes = ["sheet-1.png", "sheet-2.png"].map((f) => (existsSync(join(shots, f)) ? size(join(shots, f)) : null));
check("sheets paginate and are listed with the slides they cover", /sheet-1\.png {2}s001-s002/.test(paged) && /sheet-2\.png {2}s003/.test(paged) && sheetSizes[0]?.w > sheetSizes[1]?.w, JSON.stringify(sheetSizes));
folio("shot", "decks/example", "--sheet", "--marks");
const sheet = size(join(shots, "sheet-1.png"));
check("one sheet holds up to twelve slides, three thumbnails wide", !existsSync(join(shots, "sheet-2.png")) && sheet.w >= 3 * 480 && sheet.w < 3 * 480 + 100 && sheet.h < 540, JSON.stringify(sheet));

const browser = await chromium.launch();
const page = await browser.newPage();
const redIn = (png, box) => page.evaluate(async ({ src, box }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(box.x, box.y, box.w, box.h).data;
  let red = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] > 150 && data[i + 1] < 80 && data[i + 2] < 80) red += 1;
  return red;
}, { src: `data:image/png;base64,${png.toString("base64")}`, box });
const noteBox = { x: 0, y: 90, w: 480, h: 420 };
const [before, after] = [await redIn(s002, noteBox), await redIn(readFileSync(join(shots, "s002.png")), noteBox)];
check("--marks outlines the overflowing note in red", after > before + 400, `${before} -> ${after} red pixels`);
const whole = { x: 0, y: 0, w: 960, h: 540 };
const s003Marked = readFileSync(join(shots, "s003.png"));
const [noteRedBefore, noteRedAfter] = [await redIn(s003Plain, whole), await redIn(s003Marked, whole)];
check("--marks outlines a note-only slot without red", !s003Plain.equals(s003Marked) && noteRedAfter <= noteRedBefore + 20, `${noteRedBefore} -> ${noteRedAfter} red pixels`);
const sheetPng = readFileSync(join(shots, "sheet-1.png"));
const caption = (column) => ({ x: 14 + column * 494, y: 284, w: 480, h: 30 });
const [warnRed, noteRed] = [await redIn(sheetPng, caption(1)), await redIn(sheetPng, caption(2))];
check("the sheet labels warnings in red and a note-only slide in grey", warnRed > 30 && noteRed === 0, `s002 caption ${warnRed}, s003 caption ${noteRed} red pixels`);
await browser.close();

const json = shotJson();
const checked = JSON.parse(folio("check", "decks/example", "--json"));
const countsOf = (id) => JSON.stringify(json.shots.find((s) => s.slide === id).counts);
check("--json names every shot with its layout and its counts by severity", json.shots.length === 3 && json.shots.every((s) => existsSync(s.path) && s.layout) && countsOf("s002") === '{"error":0,"warning":6,"note":0}' && countsOf("s003") === '{"error":0,"warning":0,"note":1}', JSON.stringify(json.shots.map((s) => [s.slide, s.counts])));
check("--json carries the same summary as folio check --json", JSON.stringify(json.summary) === JSON.stringify(checked.summary), JSON.stringify(json.summary));
check("a run without --sheet removes the old sheets", !readdirSync(shots).some((f) => f.startsWith("sheet")), pngs(shots));

rmSync(join(deckDir, "slides/s003.json"));
writeDeck(["s001", "s002"]);
folio("shot", "decks/example", "--slides", "s001");
check("a removed slide's picture goes", pngs(shots) === "s001.png s002.png", pngs(shots));

console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
