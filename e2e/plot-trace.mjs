// Plot hooks are traced, reusable and redrawn at every size, on its own copy of decks/example (slide s002 is
// note-figure; fig:a is drawn by lectern's line-plot): an override of fig:a's box redraws the figure at the new
// pixel size (the cached PNG and the image the page shows, never a scaled copy) while the old one stays marked
// "drawing"; `folio trace` prints the record and a regenerate line; running that line draws the same bytes
// (sha256 equal to the trace's); `folio hook run` with the same inputs and box is a cache hit with the deck's key.
// Then a one-off figure: a script run by `folio py`, sized by `folio box` (folio_hook.slot_size), saved with
// save_traced, is not FOLIO-FIG-002, `folio trace` names its script and input, a changed box is FOLIO-FIG-003
// naming the command, and running that command clears it.
// Usage: node e2e/plot-trace.mjs
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bin, python, start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: ["example"], name: "plot-trace" });
writeFileSync(join(root, "folio.local.toml"), `[runtimes]\npython = ${JSON.stringify(python)}\n`);
const server = await start(root);
const token = server.token("example");
const results = [];
const check = (name, ok, detail) => (results.push(!!ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const state = async () => (await (await fetch(`${server.base}/${token}/hooks`)).json()).slides.s002?.["fig:a"];
const pngSize = (bytes) => ({ w: bytes.readUInt32BE(16), h: bytes.readUInt32BE(20) });
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const cli = (args, cwd = root, input) => execFileSync("node", [bin, ...args], { cwd, encoding: "utf8", input });

const DRAW = `import sys
import matplotlib.pyplot as plt
from folio_hook import save_traced, slot_size
deck = sys.argv[1]
fig = plt.figure(figsize=slot_size(deck, "s002", "fig:a").figsize)
fig.add_subplot().bar(["a", "b"], [1, 2])
save_traced(fig, f"{deck}/fig/loop.png", script=__file__, inputs=["data.csv"])
`;
const figWarnings = () => JSON.parse(cli(["check", server.deckDir("example"), "--json"])).warnings.filter((w) => w.code.startsWith("FOLIO-FIG") && w.location.slide === "s002" && w.location.slot === "fig:a" && w.state !== "absent");

/** A one-off figure drawn by a script at `folio box`'s size, saved with `save_traced`, traced, and flagged when its box changes. */
async function scriptFigure() {
  const deck = server.deckDir("example");
  const box = JSON.parse(cli(["box", `${deck}/s002`, "fig:a", "--json"]));
  check("folio box gives the slot's box with the slide's override", box.w === 300 && box.h === 200 && box.inches[0] === 4.167, JSON.stringify(box));
  writeFileSync(join(root, "draw_loop.py"), DRAW);
  writeFileSync(join(root, "data.csv"), "a,b\n1,2\n");
  const bare = { ...process.env, PYTHONPATH: "" };
  const unimportable = (() => { try { execFileSync(python, ["-c", "import folio_hook"], { env: bare, stdio: "ignore" }); return false; } catch { return true; } })();
  execFileSync("node", [bin, "py", "draw_loop.py", deck], { cwd: root, env: bare });
  check("folio py runs the script with folio_hook importable", unimportable && existsSync(join(deck, "fig/loop.png")), `folio_hook ${unimportable ? "not " : ""}importable by the bare runtime`);
  const png = readFileSync(join(deck, "fig/loop.png"));
  const record = JSON.parse(readFileSync(join(deck, "fig/loop.png.trace.json"), "utf8"));
  check("save_traced writes the figure at the slot's pixel size and its trace", pngSize(png).w === 833 && pngSize(png).h === 556 && record.output.sha256 === sha(png) && record.source.inputs[0].path.endsWith("data.csv"), JSON.stringify({ px: pngSize(png), box: record.box }));
  const show = JSON.parse(cli(["show", `${deck}/s002`]));
  cli(["patch", `${deck}/s002`, "-", "--rev", show.rev], root, JSON.stringify([{ op: "replace", path: "/elements/s/props/fig:a", value: "fig/loop.png" }]));
  const quiet = figWarnings();
  check("a figure saved with save_traced is not FOLIO-FIG-002", quiet.length === 0, JSON.stringify(quiet.map((w) => w.code)));
  const traced = cli(["trace", `${deck}/s002`, "fig:a"]);
  const line = /^regenerate: (.*)$/m.exec(traced)?.[1];
  check("folio trace names the script, its input and the folio py line that draws it again", /^source: .*draw_loop\.py/m.test(traced) && /input: .*data\.csv sha256 [0-9a-f]{64}/.test(traced) && / py draw_loop\.py /.test(line ?? ""), line);
  cli(["override", `${deck}/s002`, "slots.fig:a.box=[494.8,132.8,360,200]"]);
  const moved = figWarnings();
  check("a changed box is FOLIO-FIG-003 naming the redraw command", moved.length === 1 && moved[0].code === "FOLIO-FIG-003" && moved[0].message.includes(line), moved[0]?.message);
  execFileSync("bash", ["-c", line], { cwd: tmpdir(), env: bare });
  const redrawn = figWarnings();
  check("running that command from a plain shell redraws it at the new box and the warning goes", redrawn.length === 0 && pngSize(readFileSync(join(deck, "fig/loop.png"))).w === 1000, JSON.stringify(redrawn.map((w) => w.code)));
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto(`${server.base}/${token}/?slide=s002`, { waitUntil: "load" });
  const first = await until(async () => { const s = await state(); return s?.phase === "ok" && s.goodKey && s; }, 60000);
  check("the deck's figure is drawn", first, `${first?.goodKey} ${JSON.stringify(first?.box)}`);

  const BOX = [494.8, 132.8, 300, 200];
  cli(["override", `${server.deckDir("example")}/s002`, `slots.fig:a.box=${JSON.stringify(BOX)}`]);
  const drawing = await until(async () => (await page.locator('main [data-slot="fig:a"] [data-hook-badge="drawing"]').count()) > 0 && (await page.locator('main [data-slot="fig:a"] img').count()) > 0, 10000, 20);
  check("the old figure stays, marked drawing, while the new one is made", drawing, drawing ? "drawing badge over the last good figure" : "no drawing mark seen");
  const next = await until(async () => { const s = await state(); return s?.phase === "ok" && s.goodKey !== first?.goodKey && s; }, 60000);
  const bytes = next ? Buffer.from(await (await fetch(`${server.base}/${token}/hookfig/${next.goodKey}.png`)).arrayBuffer()) : Buffer.alloc(24);
  const px = pngSize(bytes);
  const want = { w: Math.round((BOX[2] * 200) / 72), h: Math.round((BOX[3] * 200) / 72) };
  check("the figure is redrawn at the new pixel size", next && px.w === want.w && px.h === want.h, `${px.w} x ${px.h} px, want ${want.w} x ${want.h}`);
  const shown = await until(() => page.evaluate((key) => {
    const img = document.querySelector('main [data-slot="fig:a"] img');
    const slot = img?.closest("[data-slot]");
    return img?.src.includes(key) && img.complete && { natural: [img.naturalWidth, img.naturalHeight], drawnFor: img.dataset.drawnFor, img: [img.offsetWidth, img.offsetHeight], slot: [slot.offsetWidth, slot.offsetHeight] };
  }, next?.goodKey), 10000);
  check("the page shows the new figure at its own size, not scaled", shown && shown.natural[0] === want.w && shown.drawnFor === "300x200" && shown.img[0] === shown.slot[0] && shown.img[1] === shown.slot[1], JSON.stringify(shown));

  const traced = cli(["trace", `${server.deckDir("example")}/s002`, "fig:a"]);
  const line = /^regenerate: (folio hook run .*)$/m.exec(traced)?.[1];
  const record = JSON.parse(traced.slice(traced.indexOf("{"), traced.lastIndexOf("}") + 1));
  check("folio trace prints the record and a regenerate line", line && record.key === next?.goodKey && record.hook.name === "line-plot" && record.box.w === 300 && record.output.sha256 === sha(bytes), `${record.hook.stamp} ${line}`);

  const elsewhere = mkdtempSync(join(root, "regen-"));
  const args = line.split(" ").slice(1).map((w) => w.replace(/^'|'$/g, ""));
  const regen = cli(args, elsewhere);
  const again = readFileSync(join(elsewhere, `${record.key}.png`));
  check("the regenerate line draws the same bytes", /matches the trace/.test(regen) && sha(again) === record.output.sha256, regen.trim().split("\n").pop());

  writeFileSync(join(elsewhere, "inputs.json"), JSON.stringify(record.inputs));
  const reused = JSON.parse(cli(["hook", "run", "lectern/line-plot", "--inputs", "inputs.json", "--size", "300,200", "--out", "reuse.png", "--json"], elsewhere));
  check("hook run with the deck's inputs and box reuses the deck's figure", reused.cached && reused.key === record.key && reused.sha256 === record.output.sha256, JSON.stringify(reused));
  check("the trace's inputs hold the figure's data", record.inputs.title === "Energy profile", JSON.stringify(record.inputs).slice(0, 60));

  await scriptFigure();
} finally {
  await browser.close();
  await server.stop();
}
process.exit(results.every(Boolean) ? 0 : 1);
