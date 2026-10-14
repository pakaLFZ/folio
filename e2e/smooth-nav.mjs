// Board and deck editor move between each other in place (spec/comments/opening-a-comment.md): no document
// load, the stream kept, the board's scroll kept on the way back, deep links still load. Prints click-to-paint ms.
import { chromium } from "playwright";
import { serve } from "./lib/server.mjs";
const server = await serve();
const { base, cli } = server;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const post = (path, body) => fetch(`${base}/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const a = server.token("example");
for (let i = 0; i < 24; i += 1) await post(`${a}/comments`, { slide: "s001", region: null, marks: [], text: `Filler ${i}, enough cards for the column to scroll.` });
const c1 = await post(`${a}/comments`, { slide: "s002", region: null, marks: [{ tool: "arrow", points: [[600, 300], [500, 200]] }], text: "Tighten this slide." });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 720, height: 800 } });
await context.addInitScript(() => {
  delete window.SharedWorker;
  const Native = window.EventSource;
  window.__sources = 0;
  window.EventSource = class extends Native {
    constructor(...args) {
      super(...args);
      window.__sources += 1;
    }
  };
  addEventListener("click", () => sessionStorage.setItem("clickAt", String(Date.now())), true);
});
const page = await context.newPage();
page.on("pageerror", (e) => console.log("pageerror", e.message));
const painted = (slide) =>
  page.waitForFunction((id) => {
    const el = document.querySelector(`main .folio-slide[data-slide="${id}"]`);
    if (!el || !el.getBoundingClientRect().width) return null;
    return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(Date.now() - Number(sessionStorage.getItem("clickAt"))))));
  }, slide, { timeout: 15000 }).then((h) => h.jsonValue());
const sources = () => page.evaluate(() => window.__sources);

await page.goto(`${base}/inbox`, { waitUntil: "load" });
const card = page.locator(`li[data-card="${c1.id}"] a`);
await card.waitFor();
await page.waitForFunction(() => window.__sources > 0);
await page.waitForTimeout(400);
await page.evaluate(() => (window.__marker = "board"));
const columnOf = `document.querySelector('li[data-card="${c1.id}"]').closest("ul")`;
const scrollOf = () => page.evaluate(`${columnOf}.scrollTop`);
const scrolled = await page.evaluate(`${columnOf}.scrollTop = 1e6, ${columnOf}.scrollTop`);
const before = await sources();
await card.scrollIntoViewIfNeeded();
const scrolledAtClick = await scrollOf();
await card.click();
const openLink = page.getByRole("link", { name: "Open on its slide" });
await openLink.hover();
await page.waitForTimeout(400);
const label = `(a) Edited after the hover, ${Date.now()}`;
cli(["patch", "decks/example/s002", "-", "--worker", "w1"], JSON.stringify([{ op: "add", path: "/elements/s/props/label:a", value: label }]));
await page.waitForTimeout(600);
await openLink.click();
const toSlide = await painted("s002");
console.log(`click to slide painted: ${toSlide} ms`);
const opened = new URL(page.url());
const sameWindow = await page.evaluate(() => window.__marker === "board");
const threadOpen = await page.locator("text=Tighten this slide. >> visible=true").first().waitFor({ timeout: 5000 }).then(() => true, () => false);
check("the open button shows the slide in the same document", sameWindow && opened.pathname === `/${a}/` && opened.search === `?slide=s002&comment=${c1.id}`, `marker kept ${sameWindow}, at ${opened.pathname}${opened.search}`);
check("the comment is selected on its slide", threadOpen, `thread visible ${threadOpen}`);
const edited = await page.locator(`main .folio-slide:has-text("${label}")`).waitFor({ timeout: 3000 }).then(() => true, () => false);
check("an edit written between the prefetch and the click is on the slide", edited, `label shown ${edited}`);
check("the stream is not reopened", (await sources()) === before, `EventSources ${before} -> ${await sources()}`);

await page.getByRole("link", { name: /^Inbox/ }).click();
await card.waitFor({ state: "visible" });
const backAt = new URL(page.url());
const scrollKept = await scrollOf();
const stillSame = await page.evaluate(() => window.__marker === "board");
check("the editor's inbox button returns to the board in place, scroll kept", stillSame && backAt.pathname === "/inbox" && scrolled > 0 && scrollKept === scrolledAtClick, `marker ${stillSame}, at ${backAt.pathname}, column scrollTop ${scrolledAtClick} -> ${scrollKept}`);
check("the stream is still not reopened", (await sources()) === before, `EventSources ${await sources()}`);

await page.goForward();
await painted("s002");
await page.goBack();
await card.waitFor({ state: "visible" });
const viaHistory = (await page.evaluate(() => window.__marker === "board")) && (await scrollOf());
check("Forward and Back move in place", viaHistory === scrolledAtClick, `column scrollTop after Back ${viaHistory}`);

const deep = await context.newPage();
await deep.goto(`${base}/${a}/?slide=s002&comment=${c1.id}`, { waitUntil: "load" });
const deepSlide = await deep.locator('main .folio-slide[data-slide="s002"]').waitFor({ timeout: 10000 }).then(() => true, () => false);
const deepThread = await deep.getByText("Tighten this slide.").first().waitFor({ timeout: 5000 }).then(() => true, () => false);
check("a deep link to a comment still loads", deepSlide && deepThread, `slide ${deepSlide}, thread ${deepThread}`);
await deep.evaluate(() => (window.__marker = "deck"));
await deep.getByRole("link", { name: /^Inbox/ }).click();
await deep.locator(`li[data-card="${c1.id}"]`).waitFor({ timeout: 10000 });
const boardInPlace = await deep.evaluate(() => window.__marker === "deck" && location.pathname === "/inbox");
check("the inbox opens in place from a deck loaded by address", boardInPlace, `in place ${boardInPlace}`);
const inboxDeep = await context.newPage();
await inboxDeep.goto(`${base}/inbox`, { waitUntil: "load" });
const boardLoads = await inboxDeep.locator(`li[data-card="${c1.id}"]`).waitFor({ timeout: 10000 }).then(() => true, () => false);
check("the inbox address still loads", boardLoads, `card shown ${boardLoads}`);

await browser.close();
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
