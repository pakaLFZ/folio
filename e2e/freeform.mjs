// Slot tops are read from offsetTop, a whole CSS pixel (0.75 pt), so positions are compared within one pixel.
// Browser check for freeform pages, on its own workspace with no fixture deck: `folio init-deck` without
// --template makes a deck on the built-in plain pack and installs it into templates/; on a canvas slide
// (no slots) `folio override` adds a title, an SVG figure, a note and a table, and `folio patch` fills them;
// the page draws each at its added box, the note past its lines is reported, a templated slide takes an extra
// added label beside its own slots, a partial added slot is refused naming the missing field, and clearing an
// added slot removes it from the page.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { settle } from "./lib/page.mjs";
import { bin, start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
const patch = (slide, props) => {
  const file = join(root, `${slide}.patch.json`);
  writeFileSync(file, JSON.stringify(Object.entries(props).map(([k, v]) => ({ op: "add", path: `/elements/s/props/${k}`, value: v }))));
  return folio("patch", `decks/pitch/${slide}`, file);
};

const made = folio("init-deck", "decks/pitch", "--title", "Pitch");
check("init-deck without --template uses the built-in plain pack and says so", /no --template given: using the built-in pack plain@1 \(installed into templates\/plain\)/.test(made) && existsSync(join(root, "templates/plain/pack.json")), made.split("\n")[0]);

const BOXES = { headline: [48, 32, 864, 44], "fig:a": [48, 100, 560, 400], "note:a": [640, 120, 272, 40], "table:a": [640, 200, 272, 200] };
folio("new", "decks/pitch", "--template", "canvas");
folio("override", "decks/pitch/s001",
  `slots.headline=${JSON.stringify({ role: "title", box: BOXES.headline })}`,
  `slots.fig:a=${JSON.stringify({ role: "figure", box: BOXES["fig:a"] })}`,
  `slots.note:a=${JSON.stringify({ role: "note", box: BOXES["note:a"], lines: 1 })}`,
  `slots.table:a=${JSON.stringify({ role: "table", box: BOXES["table:a"], tableStyle: "default" })}`);
writeFileSync(join(root, "decks/pitch/bars.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 560 400"><rect x="60" y="200" width="80" height="200" fill="#3366aa"/></svg>');
patch("s001", {
  headline: "Agents ship decks faster",
  "fig:a": "bars.svg",
  "note:a": "Measured on three talks with the same agent and the same brief, which is far too long for one line.",
  "table:a": { columns: ["Tool", "Minutes"], rows: [["pptx", "90"], ["folio", "30"]] },
});
folio("new", "decks/pitch", "--template", "figure");
folio("override", "decks/pitch/s002", `slots.label:a=${JSON.stringify({ role: "label", box: [700, 40, 212, 24] })}`);
patch("s002", { title: "One figure", "label:a": "Draft" });

const server = await start(root);
const token = server.token("pitch");
const api = async (path, body) => {
  const res = await fetch(`${server.base}/${token}/${path}`, body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return { status: res.status, body: await res.json() };
};
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
const ONE_PX = 0.75;
const boxOf = (slot) => page.evaluate((name) => {
  const el = document.querySelector(`main [data-slot="${CSS.escape(name)}"]`);
  return el ? [el.offsetLeft, el.offsetTop, el.offsetWidth, el.offsetHeight].map((px) => Math.round((px / (4 / 3)) * 10) / 10) : null;
}, slot);
const near = (got, want) => !!got && got.every((v, i) => Math.abs(v - want[i]) <= ONE_PX);

await page.goto(`${server.base}/${token}/?slide=s001`, { waitUntil: "load" });
for (const [slot, box] of Object.entries(BOXES)) {
  const got = await until(async () => {
    const b = await boxOf(slot);
    return near(b, box) ? b : null;
  });
  check(`added slot ${slot} is drawn at its box`, !!got, `${JSON.stringify(got ?? (await boxOf(slot)))} vs ${JSON.stringify(box)}`);
}
const drawn = await page.evaluate(() => ({
  headline: document.querySelector('main [data-slot="headline"]')?.textContent ?? "",
  figure: document.querySelector('main [data-slot="fig:a"] img')?.getAttribute("src") ?? "",
  cells: document.querySelectorAll('main [data-slot="table:a"] td').length,
}));
check("added slots hold their content: text, an SVG figure and a table", drawn.headline.includes("Agents ship decks faster") && /bars\.svg/.test(drawn.figure) && drawn.cells === 4, JSON.stringify(drawn));
const overflow = await until(async () => (await api("warnings")).body.warnings.find((w) => w.code === "FOLIO-OVF-001" && w.location.slot === "note:a"));
check("an added text slot past its lines is reported", !!overflow && overflow.args.limit === 1, overflow ? `limit ${overflow.args.limit}, ${overflow.args.lines} lines` : "no warning");
const spec = (await api("warnings")).body.warnings.filter((w) => w.code.startsWith("FOLIO-SPEC"));
check("content of added slots is not reported as unknown slots", spec.length === 0, JSON.stringify(spec.map((w) => w.args.jsonPath)));

const bad = await api("slides/s001/overrides", { set: { "slots.caption": { box: [48, 500, 400, 20] } } });
check("a partial added slot is refused naming the missing field", bad.status === 422 && /overrides\.slots\.caption\.role: "caption" is not a slot of layout canvas .*at least "role" and "box"/.test(bad.body.detail), `${bad.status} ${bad.body.detail}`);
await api("slides/s001/overrides", { clear: ["slots.note:a"] });
const gone = await until(async () => (await boxOf("note:a")) === null);
check("clearing an added slot removes it from the page", !!gone, gone ? "gone" : "still drawn");

await page.goto(`${server.base}/${token}/?slide=s002`, { waitUntil: "load" });
await settle(page);
const label = await until(async () => {
  const b = await boxOf("label:a");
  return near(b, [700, 40, 212, 24]) && (await boxOf("title")) ? b : null;
});
check("a templated slide takes an added slot beside its own", !!label, `label:a ${JSON.stringify(label)}, title ${JSON.stringify(await boxOf("title"))}`);

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
