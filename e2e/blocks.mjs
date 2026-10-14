// Check: blocks (spec/slides/blocks.md) on its own workspace, headless, no server. A deck on the built-in plain
// pack. A two-column card grows as text is added, and the body slot placed below it loses height by as much;
// a python and a rust code block show their keyword colours in `folio shot`; a code block in an unknown
// language is refused with nothing written; a card past its maximum height is FOLIO-OVF-006 and a code line
// wider than its block is FOLIO-OVF-007; `folio block rm` removes a block. A two-column code block is one box: its
// fill runs unbroken between the columns, each half shows coloured code, a line that fits the box but not its
// column is FOLIO-OVF-007, and the 11 lines split 6 and 5.
import { chromium } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
const slideFile = (id) => readFileSync(join(root, `decks/d/slides/${id}.json`), "utf8");
const file = (name, text) => (writeFileSync(join(root, name), text), name);
const setProp = (id, slot, value) => folio("patch", `decks/d/${id}`, file("patch.json", JSON.stringify([{ op: "add", path: `/elements/s/props/${slot}`, value }])));
const warningsOf = () => JSON.parse(folio("check", "decks/d", "--json")).warnings;
const noteHeight = () => JSON.parse(folio("box", "decks/d/s001", "note", "--json")).h;

folio("init-deck", "decks/d", "--title", "Blocks");
for (let i = 0; i < 4; i += 1) folio("new", "decks/d", "--template", "canvas");

const card = folio("block", "add", "decks/d/s001", "--style", "card", "--box", "60,40,840,300", "--text", "One short line.").trim();
folio("override", "decks/d/s001", 'slots.note={"role":"body","box":[60,360,840,140],"below":{"slot":"block:a","gap":12}}');
setProp("s001", "note", "Below the card.");
warningsOf();
const before = noteHeight();
const sentence = "A card holds a paragraph that runs over two columns and the card grows with it. ";
setProp("s001", "block:a", sentence.repeat(8).trim());
const spec = warningsOf().filter((w) => w.location.slide === "s001");
const after = noteHeight();
check("folio block add prints the next free block slot", card === "block:a", card);
check("the card grows as text is added and the slot below it moves down", after < before - 20, `note ${before} pt -> ${after} pt`);
check("the growing card raises no warning while it fits", spec.length === 0, JSON.stringify(spec.map((w) => w.message)));

const py = file("demo.py", 'def greet(name):\n    return "hello " + name  # say hi\n');
const rs = file("demo.rs", 'fn main() {\n    let total = 42;\n    println!("{}", total);\n}\n');
const added = [
  folio("block", "add", "decks/d/s002", "--style", "code", "--box", "60,40,840,140", "--code-file", py),
  folio("block", "add", "decks/d/s002", "--style", "code", "--box", "60,240,840,160", "--code-file", rs, "--language", "rust"),
].map((o) => o.trim());
const props2 = JSON.parse(slideFile("s002")).elements.s.props;
check("python is the default language and rust is stored with its language", added.join() === "block:a,block:b" && typeof props2["block:a"] === "string" && props2["block:b"].language === "rust", JSON.stringify(props2["block:b"]).slice(0, 60));

const beforeBad = slideFile("s002");
const bad = spawnSync("node", [bin, "block", "add", "decks/d/s002", "--style", "code", "--box", "60,420,840,60", "--code-file", py, "--language", "kotlin"], { cwd: root, encoding: "utf8" });
check("an unknown language is refused naming the list and nothing is written", bad.status === 2 && /block:c\/language: "kotlin" is not a code language; languages: python, bash/.test(bad.stderr) && slideFile("s002") === beforeBad, `exit ${bad.status}: ${bad.stderr.split("\n")[1]?.trim()}`);

const browser = await chromium.launch();
const page = await browser.newPage();
const PX = 2;
/** How many pixels of a region are within 40 of a colour, per colour. */
const counts = (png, [x, y, w, h], colors) => page.evaluate(async ({ src, region, colors }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(...region).data;
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return colors.map((c) => {
    const [r, g, b] = rgb(c);
    let n = 0;
    for (let i = 0; i < data.length; i += 4) if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) < 40) n += 1;
    return n;
  });
}, { src: `data:image/png;base64,${png.toString("base64")}`, region: [x * PX, y * PX, w * PX, h * PX], colors });

folio("shot", "decks/d", "--slides", "s002", "--width", String(960 * PX));
const png = readFileSync(join(root, "decks/d/.shots/s002.png"));
const [pyKeyword, pyString, pyComment] = await counts(png, [60, 40, 840, 140], ["#0033B3", "#067D17", "#8C8C8C"]);
const [rsKeyword, rsNumber] = await counts(png, [60, 240, 840, 160], ["#0033B3", "#1750EB"]);
check("the python block colours its keywords, string and comment", pyKeyword > 20 && pyString > 20 && pyComment > 20, `keyword ${pyKeyword}, string ${pyString}, comment ${pyComment} px`);
check("the rust block colours its keywords and numbers", rsKeyword > 20 && rsNumber > 5, `keyword ${rsKeyword}, number ${rsNumber} px`);
const ten = file("ten.py", Array.from({ length: 11 }, (_, i) => `def f${i}(): return ${i}`).join("\n"));
const twoCol = folio("block", "add", "decks/d/s004", "--style", "code", "--box", "60,40,840,300", "--code-file", ten, "--columns", "2").trim();
folio("shot", "decks/d", "--slides", "s004", "--width", String(960 * PX));
const png4 = readFileSync(join(root, "decks/d/.shots/s004.png"));
const [leftKeyword] = await counts(png4, [60, 40, 420, 200], ["#0033B3"]);
const [rightKeyword] = await counts(png4, [480, 40, 420, 200], ["#0033B3"]);
const [gapFill] = await counts(png4, [474, 60, 12, 100], ["#F2F2F2"]);
check("a two-column code block is one grey box with code in both columns", twoCol === "block:a" && leftKeyword > 20 && rightKeyword > 20 && gapFill === 12 * 100 * PX * PX, `left ${leftKeyword}, right ${rightKeyword} keyword px; gap fill ${gapFill}/${12 * 100 * PX * PX} px`);
await browser.close();
folio("block", "add", "decks/d/s004", "--style", "code", "--box", "60,380,840,100", "--columns", "2", "--code-file", file("mid.py", `x = "${"m".repeat(70)}"`));
const s4 = warningsOf().filter((w) => w.location.slide === "s004");
const halfWide = s4.find((w) => w.code === "FOLIO-OVF-007" && w.location.slot === "block:b");
check("a code line that fits the box but not its column is FOLIO-OVF-007", !!halfWide && !s4.some((w) => w.location.slot === "block:a"), halfWide?.message ?? JSON.stringify(s4.map((w) => `${w.code} ${w.location.slot}`)));

folio("block", "add", "decks/d/s003", "--style", "card", "--box", "60,40,400,80", "--text", sentence.repeat(6).trim());
folio("block", "add", "decks/d/s003", "--style", "code", "--box", "60,300,200,120", "--code-file", file("long.py", `x = "${"a very long line ".repeat(6)}"\nprint(x)\n`));
const s3 = warningsOf().filter((w) => w.location.slide === "s003");
const tall = s3.find((w) => w.code === "FOLIO-OVF-006" && w.location.slot === "block:a");
const wide = s3.find((w) => w.code === "FOLIO-OVF-007" && w.location.slot === "block:b");
check("a card past its maximum height is FOLIO-OVF-006", !!tall && Number(tall.args.heightPt) > 80, tall?.message ?? JSON.stringify(s3.map((w) => w.code)));
check("a code line wider than its block is FOLIO-OVF-007 naming line 1", !!wide && /line 1 runs/.test(wide.message), wide?.message ?? JSON.stringify(s3.map((w) => w.code)));
check("the blocks raise no spec warning", !s3.some((w) => w.code.startsWith("FOLIO-SPEC")), JSON.stringify(s3.filter((w) => w.code.startsWith("FOLIO-SPEC")).map((w) => w.message)));

const removed = folio("block", "rm", "decks/d/s003", "block:b").trim();
const props3 = JSON.parse(slideFile("s003")).elements.s.props;
check("folio block rm removes the slot and its content", removed === "block:b" && !("block:b" in props3) && !props3.overrides.slots["block:b"], removed);

process.exit(results.every(Boolean) ? 0 : 1);
