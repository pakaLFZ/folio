// Check: a slide that does not render is an error, never a blank page (spec/slides/pdf.md), on its own copy of
// decks/example, headless, no server. A copy of the web build gets a script that makes one slot component throw
// (FOLIO_WEB_DIST serves it); `check`, `pdf` and `shot` then report FOLIO-RND-001 on that slide only, and its
// picture is a red error box, not white. The same copy made older than its sources prints the pnpm build:web line.
import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { bin, repo, workspace } from "./lib/server.mjs";

const root = workspace({ decks: ["example"] });
const dist = join(root, "web-crash");
const deck = join(root, "decks/example");
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));

const THROW_IN_SLOT = `<script>{const d=Object.getOwnPropertyDescriptor(HTMLElement.prototype,"offsetHeight");Object.defineProperty(HTMLElement.prototype,"offsetHeight",{get(){if(this.classList.contains("folio-text")&&this.textContent.includes("RENDER-CRASH"))throw new Error("injected crash");return d.get.call(this)}})}</script>`;
cpSync(join(repo, "packages/web/dist"), dist, { recursive: true });
writeFileSync(join(dist, "index.html"), readFileSync(join(dist, "index.html"), "utf8").replace("<head>", `<head>${THROW_IN_SLOT}`));
writeFileSync(join(deck, "slides/s003.json"), JSON.stringify({ root: "s", elements: { s: { type: "title-only", props: { title: "RENDER-CRASH in the title" }, children: [] } } }));
const order = JSON.parse(readFileSync(join(deck, "deck.json"), "utf8"));
writeFileSync(join(deck, "deck.json"), JSON.stringify({ ...order, order: [...order.order, "s003"] }));

const folio = (...args) => {
  const run = spawnSync("node", [bin, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, FOLIO_WEB_DIST: dist } });
  return { out: run.stdout, err: run.stderr, code: run.status };
};
const rendered = (text) => text.split("\n").filter((l) => /FOLIO-RND-001/.test(l));

const checked = folio("check", "decks/example", "--json");
const rnd = JSON.parse(checked.out).warnings.filter((w) => w.code === "FOLIO-RND-001");
check("check --json: FOLIO-RND-001, an error, on the crashing slide only", rnd.length === 1 && rnd[0].location.slide === "s003" && rnd[0].severity === "error", JSON.stringify(rnd.map((w) => [w.location.slide, w.severity])));
check("the message names the slide and the exception", /^Slide s003 did not render: injected crash\./.test(rnd[0]?.message ?? ""), rnd[0]?.message);
check("a current build prints no stale-build line", !/pnpm build:web/.test(checked.err), checked.err.trim() || "(stderr empty)");

const pdf = folio("pdf", "decks/example", "--out", join(root, "out.pdf"));
check("pdf reports it", rendered(pdf.out).some((l) => /s003/.test(l)), rendered(pdf.out)[0]);

const shot = folio("shot", "decks/example", "--slides", "s003");
check("shot reports it", rendered(shot.out).some((l) => /s003/.test(l)), rendered(shot.out)[0]);
const browser = await chromium.launch();
const page = await browser.newPage();
const red = await page.evaluate(async (src) => {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = Object.assign(document.createElement("canvas"), { width: img.width, height: img.height });
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, img.width, img.height).data;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] > 180 && data[i + 1] < 90 && data[i + 2] < 90) n += 1;
  return n;
}, `data:image/png;base64,${readFileSync(join(deck, ".shots/s003.png")).toString("base64")}`);
await browser.close();
check("the picture is a red error box, not a white page", red > 3000, `${red} red pixels`);

const old = new Date("2000-01-01");
utimesSync(join(dist, "index.html"), old, old);
const stale = folio("check", "decks/example");
const line = stale.err.split("\n").find((l) => /older than its sources/.test(l));
check("a build older than its sources prints one line naming pnpm build:web", !!line && /run pnpm build:web$/.test(line), line);

console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
