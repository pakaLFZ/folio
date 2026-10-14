// Check: shapes (spec/slides/shapes.md) on its own workspace, headless, no server. A deck on the built-in plain
// pack; `folio shape add` puts a filled rect, a circle in a pack colour, an arrow and a rect whose text is too
// long on a canvas slide and prints each slot name; `folio shot` draws the fill at the rect's centre, the circle's
// colour at its centre and white at its box corner, the arrow's stroke on its line and its head; the long text is
// FOLIO-OVF-001 naming the shape; a colour outside the pack is refused with nothing written; `folio shape rm`
// takes the rect off the page.
import { chromium } from "playwright";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bin, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
const slideFile = () => readFileSync(join(root, "decks/d/slides/s001.json"), "utf8");

folio("init-deck", "decks/d", "--title", "Shapes");
folio("new", "decks/d", "--template", "canvas");
const added = [
  folio("shape", "add", "decks/d/s001", "rect", "--box", "60,60,200,120", "--fill", "#1F5AA6", "--stroke", "none"),
  folio("shape", "add", "decks/d/s001", "circle", "--box", "400,60,120", "--fill", "red"),
  folio("shape", "add", "decks/d/s001", "arrow", "--from", "60,300", "--to", "460,300", "--stroke", "#00AA00", "--stroke-width", "4"),
  folio("shape", "add", "decks/d/s001", "rect", "--box", "600,300,120,60", "--text", "A sentence far too long to fit in this small box on two lines"),
].map((out) => out.trim());
check("folio shape add prints the next free slot each time", added.join() === "shape:a,shape:b,shape:c,shape:d", added.join());

const before = slideFile();
const bad = spawnSync("node", [bin, "shape", "add", "decks/d/s001", "rect", "--box", "0,0,10,10", "--fill", "crimson"], { cwd: root, encoding: "utf8" });
check("a colour outside the pack is refused by path and nothing is written", bad.status === 2 && /shape:e\/fill: "crimson" is not a colour/.test(bad.stderr) && slideFile() === before, `exit ${bad.status}: ${bad.stderr.split("\n")[1]?.trim()}`);

const shot = () => {
  folio("shot", "decks/d");
  return readFileSync(join(root, "decks/d/.shots/s001.png"));
};
const browser = await chromium.launch();
const page = await browser.newPage();
const pixels = (png, points) => page.evaluate(async ({ src, points }) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const hex = (n) => n.toString(16).padStart(2, "0");
  return points.map(([x, y]) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)].map(hex).join(""));
}, { src: `data:image/png;base64,${png.toString("base64")}`, points });

const near = (got, want) => [0, 2, 4].every((i) => Math.abs(parseInt(got.slice(i, i + 2), 16) - parseInt(want.slice(i, i + 2), 16)) <= 12);
const [rectCentre, circleCentre, circleCorner, arrowLine, arrowHead] = await pixels(shot(), [[160, 120], [460, 120], [402, 62], [260, 300], [455, 300]]);
check("the rect's fill is drawn at its centre", near(rectCentre, "1f5aa6"), rectCentre);
check("the circle takes the pack colour red at its centre and leaves its box corner white", near(circleCentre, "c0392b") && near(circleCorner, "ffffff"), `${circleCentre} / ${circleCorner}`);
check("the arrow's stroke runs along its line and fills its head", near(arrowLine, "00aa00") && near(arrowHead, "00aa00"), `${arrowLine} / ${arrowHead}`);

const warnings = JSON.parse(folio("check", "decks/d", "--json")).warnings;
const overflow = warnings.find((w) => w.code === "FOLIO-OVF-001" && w.location.slot === "shape:d");
check("text too long for its shape is FOLIO-OVF-001 naming the shape", !!overflow && overflow.args.lines > overflow.args.limit, overflow ? overflow.message : JSON.stringify(warnings.map((w) => w.code)));
check("the shapes raise no spec warning", !warnings.some((w) => w.code.startsWith("FOLIO-SPEC")), JSON.stringify(warnings.filter((w) => w.code.startsWith("FOLIO-SPEC")).map((w) => w.message)));

const removed = folio("shape", "rm", "decks/d/s001", "shape:a").trim();
const props = JSON.parse(slideFile()).elements.s.props;
const [afterRm] = await pixels(shot(), [[160, 120]]);
check("folio shape rm removes the slot and its content and the page is white there", removed === "shape:a" && !("shape:a" in props) && !props.overrides.slots["shape:a"] && near(afterRm, "ffffff"), `${removed}, ${afterRm}`);

await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
