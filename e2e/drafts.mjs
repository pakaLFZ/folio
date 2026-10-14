// Browser check for drafts (spec/slides/drafts.md), on its own workspace with one canvas slide on the built-in
// plain pack: a rectangle an agent adds with `folio shape add` is final; an arrow the user draws with the Shape
// tool is a draft, dashed and tagged in Edit, absent in View and from the print page, `folio shot` unchanged by
// it and changed with `--drafts`; `folio check` reports it as FOLIO-DRF-001 with its ends and the commands; the
// popover's Final makes it final and the note goes.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { still } from "./lib/page.mjs";
import { bin, start, until, workspace } from "./lib/server.mjs";

const root = workspace({ decks: [] });
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const folio = (...args) => execFileSync("node", [bin, ...args], { cwd: root, encoding: "utf8" });
folio("init-deck", "decks/pitch", "--title", "Pitch");
folio("new", "decks/pitch", "--template", "canvas");
folio("shape", "add", "decks/pitch/s001", "rect", "--box", "50,50,100,60", "--fill", "blue");
const props = () => JSON.parse(readFileSync(join(root, "decks/pitch/slides/s001.json"), "utf8")).elements.s.props;
const slots = () => props().overrides?.slots ?? {};
check("a shape an agent adds is final", slots()["shape:a"] && !("draft" in slots()["shape:a"]), JSON.stringify(slots()["shape:a"]));
const shot = (...flags) => (folio("shot", "decks/pitch", ...flags), createHash("sha256").update(readFileSync(join(root, "decks/pitch/.shots/s001.png"))).digest("hex"));
const drafts = () => JSON.parse(folio("check", "decks/pitch", "--json")).warnings.filter((w) => w.code === "FOLIO-DRF-001");
const before = shot();

const server = await start(root);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
const editor = `${server.base}/${server.token("pitch")}/?slide=s001`;
await page.goto(`${editor}&mode=edit`, { waitUntil: "load" });
await still(page);
const canvas = await page.evaluate(() => {
  const el = document.querySelector("main .folio-slide");
  return { w: parseFloat(el.style.width), h: parseFloat(el.style.height) };
});
async function screen([x, y]) {
  const box = await page.locator("main .folio-slide").boundingBox();
  return [box.x + (x * box.width) / canvas.w, box.y + (y * box.height) / canvas.h];
}
const popover = page.locator('[role="dialog"][aria-label="Shape options"]');
await page.getByRole("radio", { name: "Shape", exact: true }).click();
check("the popover says the next shape is a draft", (await popover.getByRole("radio", { name: "Draft", exact: true }).getAttribute("aria-checked")) === "true", "Draft checked");
await popover.getByRole("radio", { name: "Arrow shape", exact: true }).click();
const [p, q] = [await screen([600, 300]), await screen([500, 400])];
await page.mouse.move(p[0], p[1]);
await page.mouse.down();
await page.mouse.move(q[0], q[1], { steps: 6 });
await page.mouse.up();
const drawn = await until(() => slots()["shape:b"]);
check("an arrow the user draws is written as a draft", drawn?.draft === true && props()["shape:b"]?.kind === "arrow", JSON.stringify(drawn));
const tag = await until(() => page.locator('main [data-draft="shape:b"]').innerText().catch(() => null));
check("in Edit it shows dashed and tagged Draft", /draft/i.test(tag ?? ""), String(tag));

const notes = drafts();
check("folio check reports it as FOLIO-DRF-001 with its ends and the commands", notes.length === 1 && notes[0].location.slot === "shape:b" && /a draft arrow from \(600, 300\) to \(500, 400\)/.test(notes[0].message) && /folio shape add <deck>\/s001 arrow --from 600,300 --to 500,400/.test(notes[0].message) && /folio shape rm <deck>\/s001 shape:b/.test(notes[0].message), notes[0]?.message ?? "none");
check("folio shot leaves it out", shot() === before, "same picture as before it was drawn");
check("folio shot --drafts draws it", shot("--drafts") !== before, "a different picture");

const view = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await view.goto(`${editor}&mode=view`, { waitUntil: "load" });
await still(view);
check("View leaves it out and keeps the final shape", (await view.locator('main [data-slot="shape:b"]').count()) === 0 && (await view.locator('main [data-slot="shape:a"]').count()) === 1, "view");
await view.goto(`${server.base}/${server.token("pitch")}/?print=1`, { waitUntil: "load" });
await view.waitForFunction(() => window.__FOLIO_READY__ === true);
check("the print page (the PDF) leaves it out", (await view.locator('[data-slot="shape:b"]').count()) === 0 && (await view.locator('[data-slot="shape:a"]').count()) === 1, "print");

await page.locator('[data-shape-hit="shape:b"]').click({ force: true });
await popover.getByRole("radio", { name: "Final", exact: true }).click();
const final = await until(() => slots()["shape:b"] && !("draft" in slots()["shape:b"]));
check("the popover's Final makes it final and the note goes", !!final && drafts().length === 0, JSON.stringify(slots()["shape:b"]));

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
