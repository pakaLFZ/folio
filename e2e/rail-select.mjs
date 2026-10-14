// Browser check for the rail: Ctrl/Shift+click multi-select, Escape and Shift+Arrow, the sortable gap while
// dragging (no insertion line, the dragged pair invisible, its neighbours translated by whole slots, no
// highlighted thumbnail), a dragged selection landing together in order, empty placeholder cards more than
// three slots from the gap in a nine-slide deck, the right-click menu with its key bindings, Ctrl+X (cut), Ctrl+D, Ctrl+C/Ctrl+V and Delete (archive). Restores
// the deck order and archives every slide it made. Serves its own copy of decks/example-b.
import { chromium } from "playwright";
import { existsSync, readFileSync } from "node:fs";
import { serve, until } from "./lib/server.mjs";
import { settle as frames, shows } from "./lib/page.mjs";
const server = await serve({ decks: ["example-b"] });
const deck = server.deckDir("example-b");
const base = `${server.base}/${server.token("example-b")}`;
const orderOf = () => JSON.parse(readFileSync(`${deck}/deck.json`, "utf8")).order;
const results = [];
const check = (name, ok, detail) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`));
const mod = process.platform === "darwin" ? "Meta" : "Control";
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => check("no page error", false, e.message));
await page.goto(`${base}/`, { waitUntil: "load" });
const toggle = page.getByRole("button", { name: "Toggle slides" });
await toggle.waitFor();
if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
const thumbs = page.locator("nav button[data-rail-slide]");
await thumbs.first().waitFor();
const ids = () => thumbs.evaluateAll((els) => els.map((e) => e.dataset.railSlide));
const selected = () => page.locator("nav button[data-selected]").evaluateAll((els) => els.map((e) => e.dataset.railSlide));
const current = () => page.locator('nav button[aria-current="page"]').getAttribute("data-rail-slide");
const settle = (n) => page.waitForFunction((k) => document.querySelectorAll("nav button[data-rail-slide]").length === k, n, { timeout: 5000 }).catch(() => {});
const selectsNew = (known) => page.waitForFunction((ids) => { const id = document.querySelector('nav button[aria-current="page"]')?.dataset.railSlide; return id && !ids.includes(id); }, known, { timeout: 5000 }).catch(() => {});
const original = orderOf();

await thumbs.first().click();
await page.keyboard.press(`${mod}+d`);
await settle(original.length + 1);
await selectsNew(original);
const afterFirst = orderOf();
await page.keyboard.press(`${mod}+d`);
await settle(original.length + 2);
await selectsNew(afterFirst);
const made = orderOf().filter((id) => !original.includes(id));
check("Ctrl+D duplicates right after and selects the copy", made.length === 2 && orderOf().indexOf(made[0]) === 1 && (await current()) === orderOf()[2], `order ${orderOf().join(",")}`);

const list = await ids();
await thumbs.nth(0).click();
await thumbs.nth(2).click({ modifiers: [mod] });
check("Ctrl+click adds without changing the current slide", (await selected()).join() === [list[0], list[2]].join() && (await current()) === list[0], `selected ${await selected()}, current ${await current()}`);
await thumbs.nth(3).click({ modifiers: ["Shift"] });
check("Shift+click selects from the anchor", (await selected()).join() === [list[0], list[2], list[3]].join(), `selected ${await selected()}`);
await page.keyboard.press("Escape");
check("Escape collapses to the current slide", (await selected()).join() === list[0], `selected ${await selected()}`);
await page.keyboard.press("Shift+ArrowDown");
await page.keyboard.press("Shift+ArrowDown");
check("Shift+ArrowDown extends and keeps the current slide", (await selected()).join() === list.slice(0, 3).join() && (await current()) === list[0], `selected ${await selected()}`);

await thumbs.nth(0).click();
await thumbs.nth(1).click({ modifiers: ["Shift"] });
const last = await thumbs.nth(list.length - 1).boundingBox();
const first = await thumbs.nth(0).boundingBox();
await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
await page.mouse.down();
await page.mouse.move(last.x + last.width / 2, last.y + last.height * 0.1, { steps: 12 });
await frames(page);
const during = await page.evaluate(() => {
  const cards = [...document.querySelectorAll("nav button[data-rail-slide]")];
  const pitch = cards[1].offsetTop - cards[0].offsetTop;
  const shift = (b) => new DOMMatrixReadOnly(getComputedStyle(b).transform).m42;
  return {
    pitch,
    shifts: cards.map((b) => Math.round((shift(b) / pitch) * 100) / 100),
    opacity: cards.map((b) => Number(getComputedStyle(b).opacity)),
    lines: document.querySelectorAll("[data-drop-line]").length,
    outlined: cards.filter((b) => getComputedStyle(b).outlineStyle !== "none").length,
  };
});
check("no insertion line is drawn", during.lines === 0, JSON.stringify(during));
check("the dragged pair leaves its slots and stands in the gap at the end, invisible", during.opacity.slice(0, 2).every((o) => o === 0) && during.shifts.slice(0, 2).join() === "2,2", JSON.stringify(during));
check("the neighbours slide up two slots to close the pair's place and open the gap below", during.shifts.slice(2).join() === "-2,-2" && during.opacity.slice(2).every((o) => o === 1), JSON.stringify(during));
check("no thumbnail is highlighted as a target", during.outlined === 0, JSON.stringify(during));
await page.mouse.up();
await until(() => orderOf().join() !== list.join());
const moved = orderOf();
check("the selection lands together, in order, at the end", moved.slice(-2).join() === list.slice(0, 2).join(), `order ${moved.join(",")}`);
await frames(page);
const landed = await page.evaluate(() => [...document.querySelectorAll("nav button[data-rail-slide]")].map((b) => [getComputedStyle(b).transform, getComputedStyle(b).opacity]));
check("after the drop every thumbnail stands in its own slot, visible", landed.every(([t, o]) => (t === "none" || new DOMMatrixReadOnly(t).m42 === 0) && o === "1"), JSON.stringify(landed));
await fetch(`${base}/order`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: list.slice(0, 2), before: list[2] }) });
await page.waitForFunction((want) => [...document.querySelectorAll("nav button[data-rail-slide]")].map((e) => e.dataset.railSlide).join() === want, list.join(), { timeout: 5000 });

await thumbs.nth(0).click();
await thumbs.nth(1).click({ modifiers: [mod] });
await thumbs.nth(3).click({ button: "right" });
const menu = page.getByRole("menu");
const rows = await menu.getByRole("menuitem").allInnerTexts();
check("right-click outside the selection selects that slide alone", (await selected()).join() === list[3], `selected ${await selected()}`);
check(
  "the menu lists Cut, Copy, Paste, Duplicate, Delete with their keys",
  ["Cut", "Copy", "Paste", "Duplicate", "Delete"].every((w, i) => rows[i]?.startsWith(w)) && /Ctrl\+X|Cmd\+X/.test(rows[0]) && /Ctrl\+C|Cmd\+C/.test(rows[1]) && /Del/.test(rows[4]),
  rows.join(" | "),
);
await menu.getByRole("menuitem", { name: /Copy/ }).click();
await shows(page, "Copied 1 slide");
await thumbs.nth(1).click();
const beforePaste = orderOf();
await page.keyboard.press(`${mod}+v`);
await settle(beforePaste.length + 1);
const pasted = orderOf().filter((id) => !beforePaste.includes(id));
check("Ctrl+V pastes after the current slide as a new id", pasted.length === 1 && orderOf().indexOf(pasted[0]) === 2, `order ${orderOf().join(",")}`);

const cutSource = made[1];
await thumbs.nth(orderOf().indexOf(cutSource)).click();
const beforeCut = orderOf();
await page.keyboard.press(`${mod}+x`);
await settle(beforeCut.length - 1);
const day = new Date().toISOString().slice(0, 10);
check("Ctrl+X archives the slide without erasing it", !orderOf().includes(cutSource) && existsSync(`${deck}/slides/.archive/${day}/${cutSource}.json`), `order ${orderOf().join(",")}`);
await thumbs.nth(0).click();
const beforeCutPaste = orderOf();
await page.keyboard.press(`${mod}+v`);
await settle(beforeCutPaste.length + 1);
const cutPasted = orderOf().filter((id) => !beforeCutPaste.includes(id));
check("Paste after Cut inserts the cut slide's copy with a fresh id", cutPasted.length === 1, `order ${orderOf().join(",")}`);

const ours = [made[0], ...cutPasted, ...pasted];
await thumbs.nth(orderOf().indexOf(ours[0])).click();
for (const id of ours.slice(1)) await thumbs.nth(orderOf().indexOf(id)).click({ modifiers: [mod] });
await page.keyboard.press("Delete");
await settle(original.length);
check("Delete archives the whole selection", orderOf().join() === original.join() && ours.every((id) => existsSync(`${deck}/slides/.archive/${day}/${id}.json`)), `order ${orderOf().join(",")}`);
const beforeLong = orderOf();
await thumbs.nth(0).click();
for (let n = 1; n <= 7; n++) {
  await page.keyboard.press(`${mod}+d`);
  await settle(beforeLong.length + n);
}
const extra = orderOf().filter((id) => !beforeLong.includes(id));
await thumbs.nth(0).click();
await frames(page);
const top = await thumbs.nth(0).boundingBox();
await page.mouse.move(top.x + top.width / 2, top.y + top.height / 2);
await page.mouse.down();
await page.mouse.move(top.x + top.width / 2, top.y + top.height * 0.6, { steps: 4 });
await frames(page);
const drawn = () => page.evaluate(() => [...document.querySelectorAll("nav button[data-rail-slide]")].map((b) => (b.querySelector(".folio-slide") ? "slide" : b.querySelector("[data-empty]") ? "empty" : "?")));
const far = await drawn();
check("during a drag only thumbnails within 3 slots of the gap draw their slide", far.length === 9 && far.slice(0, 4).every((d) => d === "slide") && far.slice(4).every((d) => d === "empty"), far.join(","));
await page.mouse.up();
await frames(page);
await page.waitForFunction(() => [...document.querySelectorAll("nav button[data-rail-slide]")].slice(0, 6).every((b) => b.querySelector(".folio-slide")), null, { timeout: 5000 }).catch(() => {});
const after = await drawn();
const sameSize = await page.evaluate(() => new Set([...document.querySelectorAll("nav [data-thumb]")].map((t) => `${t.offsetWidth}x${t.offsetHeight}`)).size === 1);
check("a drop in place moves nothing, and visible thumbnails draw again", orderOf().join() === [...beforeLong.slice(0, 1), ...extra, ...beforeLong.slice(1)].join() && after.slice(0, 6).every((d) => d === "slide") && sameSize, `${after.join(",")}, order ${orderOf().join(",")}`);
await thumbs.nth(orderOf().indexOf(extra[0])).click();
for (const id of extra.slice(1)) await thumbs.nth(orderOf().indexOf(id)).click({ modifiers: [mod] });
await page.keyboard.press("Delete");
await settle(beforeLong.length);
check("the nine-slide deck is restored", orderOf().join() === beforeLong.join(), `order ${orderOf().join(",")}`);
await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
