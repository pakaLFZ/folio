// Inbox board checks against its own copies of decks/example and decks/example-b.
// Drags are real mouse movements in steps, as a hand makes them, plus one keyboard move.
import { chromium } from "playwright";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { serve, until } from "./lib/server.mjs";
import { settle } from "./lib/page.mjs";
const server = await serve();
const { base, cli } = server;
const shotDir = process.env.FOLIO_SHOT_DIR ?? server.root;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const post = (path, body) => fetch(`${base}/${path}`, { method: "POST", body: JSON.stringify(body) }).then((r) => r.json());
const decks = (await (await fetch(`${base}/api/decks`)).json()).decks;
const a = server.token("example");
const archive = (id) => join(server.deckDir("example"), "comments/.archive", new Date().toISOString().slice(0, 10), `${id}.json`);
const comment = (id) => fetch(`${base}/${a}/comments/${id}`).then((r) => r.json()).then((c) => ({ ...c, rank: c.rank ?? Date.parse(c.createdAt) }));
const ranked = (cs) => cs.every((c, i) => i === 0 || cs[i - 1].rank < c.rank);
const make = async (text, x) => (await new Promise((r) => setTimeout(r, 50)), post(`${a}/comments`, { slide: "s002", region: [x, 110, 300, 100], marks: [], text }));
const first = await make("First in the queue.", 25);
const second = await make("Second in the queue.", 340);
const third = await make("Third in the queue.", 655);
const browser = await chromium.launch();
// Wide enough that six 280 px-floor columns (plus gaps and padding) fit without the new
// horizontal scroll, so the drag checks below see every column without scrolling to reach it.
const page = await browser.newPage({ viewport: { width: 2200, height: 900 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));
await page.goto(`${base}/inbox`, { waitUntil: "load" });
const card = (id) => page.locator(`ul:not([data-drag-overlay]) > li[data-card="${id}"]`);
const column = (title) => page.locator(`section[aria-label="${title}"]`);
const idsIn = (title) => column(title).locator("li[data-card]").evaluateAll((els) => els.map((e) => e.dataset.card));
await card(third.id).waitFor();
const slotted = (await (await fetch(`${base}/api/inbox`)).json()).rows.filter((r) => r.slots.length);
const slotLines = await page.locator("li[data-card]").evaluateAll((els, rows) => rows.filter((r) => els.some((el) => el.dataset.card === r.id && [...el.querySelectorAll("*")].some((n) => n.textContent.trim() === r.slots.join(", ")))).map((r) => r.id), slotted);
check("no board card renders its slot list", slotted.length > 0 && slotLines.length === 0, `${slotted.length} slotted cards, slot line on ${slotLines.length}`);

const columns = ["Drafts", "Queue", "In progress", "Review", "Held", "Done"];
const headers = await page.locator("main > section > header").evaluateAll((els) => els.map((e) => ({ text: e.textContent.trim(), children: e.children.length })));
const subtitles = ["Waiting for an agent; top first", "Claimed by a worker", "The agent answered; your turn", "Parked; agents leave these", "Resolved and archived"];
const bodyText = await page.locator("body").innerText();
const leftover = subtitles.filter((s) => bodyText.includes(s));
check("column headers hold only title, count and Clear all, no subtitle", headers.length === columns.length && headers.every((h, i) => h.children <= 2 && new RegExp(`^${columns[i]}\\d+(Clear all)?$`).test(h.text)) && !leftover.length, `${headers.map((h) => h.text).join(" | ")}; subtitles: ${leftover.length}`);

/** A card's left and right gap to its column's own edge. */
async function cardGaps(title) {
  const box = await column(title).locator("ul").first().boundingBox();
  const [cardBox] = await column(title).locator("li[data-card]").evaluateAll((els) => els.map((e) => e.getBoundingClientRect()));
  return { left: cardBox.left - box.x, right: box.x + box.width - (cardBox.left + cardBox.width) };
}
const flatGaps = await cardGaps("Queue");
check("a card's left and right gap to the column edge match, not scrolling", Math.abs(flatGaps.left - flatGaps.right) <= 1, `left ${flatGaps.left.toFixed(1)}, right ${flatGaps.right.toFixed(1)}`);
const queueList = column("Queue").locator("ul").first();
await queueList.evaluate((ul) => (ul.style.maxHeight = "60px"));
const scrolledGaps = await cardGaps("Queue");
await queueList.evaluate((ul) => (ul.style.maxHeight = ""));
check("a card's left and right gap to the column edge still match once the list scrolls", Math.abs(scrolledGaps.left - scrolledGaps.right) <= 1, `left ${scrolledGaps.left.toFixed(1)}, right ${scrolledGaps.right.toFixed(1)}`);

/** Press on a card, move past the activation distance, then to a point in steps. */
async function lift(id) {
  await settle(page);
  const box = await card(id).boundingBox();
  const grab = { x: box.x + 30, y: box.y + 20 };
  await page.mouse.move(grab.x, grab.y);
  await page.mouse.down();
  await page.mouse.move(grab.x + 4, grab.y + 8, { steps: 4 });
  await page.mouse.move(grab.x + 8, grab.y + 16, { steps: 4 });
  return { box, grab };
}
const moveTo = async (x, y) => (await page.mouse.move(x, y, { steps: 16 }), settle(page));

/** Where the lifted card is and how opaque it shows, against where the pointer has taken it. */
async function lifted(id, from, at) {
  const overlay = page.locator(`[data-drag-overlay="${id}"]`);
  const box = await overlay.boundingBox();
  const opacity = await overlay.evaluate((el) => {
    let o = 1;
    for (let n = el; n; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
    for (const n of el.querySelectorAll("*")) o = Math.min(o, Number(getComputedStyle(n).opacity) || 1);
    return Number(getComputedStyle(el.querySelector("li")).opacity) * o;
  });
  const dx = box.x + box.width / 2 - (from.box.x + from.box.width / 2 + at.x - from.grab.x);
  const dy = box.y + box.height / 2 - (from.box.y + from.box.height / 2 + at.y - from.grab.y);
  return { dx, dy, opacity };
}

/** The gap's place among a column's cards, counted on screen from the top. */
const gapIndex = (title) =>
  column(title).locator("ul").first().evaluate((ul) => {
    const gap = ul.querySelector("[data-placeholder]");
    if (!gap) return -1;
    const top = gap.getBoundingClientRect().top;
    return [...ul.querySelectorAll("li[data-card]")].filter((c) => c.getBoundingClientRect().top < top).length;
  });

const firstBox = await card(first.id).boundingBox();
const from = await lift(third.id);
const at = { x: firstBox.x + 60, y: firstBox.y + 12 };
await moveTo(at.x, at.y);
const follow = await lifted(third.id, from, at);
check("the lifted card follows the pointer at full opacity", Math.abs(follow.dx) <= 5 && Math.abs(follow.dy) <= 5 && follow.opacity === 1, `off by ${follow.dx.toFixed(1)}, ${follow.dy.toFixed(1)} px, opacity ${follow.opacity}`);
const queueGap = await gapIndex("Queue");
check("the queue opens a gap at the hovered index", queueGap === 0, `gap at ${queueGap}`);
await page.screenshot({ path: join(shotDir, "board-drag.png") });
await page.mouse.up();
const dragged = [third.id, first.id, second.id].join();
await until(async () => (await idsIn("Queue")).join() === dragged && ranked(await Promise.all([third, first, second].map((c) => comment(c.id)))));
const order = await idsIn("Queue");
const ranks = await Promise.all([third, first, second].map((c) => comment(c.id)));
check("dragging reorders the queue, and the server's ranks agree", order.join() === [third.id, first.id, second.id].join() && ranks[0].rank < ranks[1].rank && ranks[1].rank < ranks[2].rank && ranks[0].status === "open", order.join(" > "));

const claimed = cli(["comment", "next", "--worker", "w7"]);
check("folio comment next claims the top card", claimed.startsWith(third.id), claimed.split("\n")[0]);
await column("In progress").locator(`li[data-card="${third.id}"]`).waitFor({ timeout: 5000 }).catch(() => {});
const inProgress = await column("In progress").locator(`li[data-card="${third.id}"]`).count();
check("a claimed card moves to In progress", inProgress === 1, `in progress: ${inProgress}`);

const heldBox = await column("Held").locator("ul").boundingBox();
await lift(first.id);
await moveTo(heldBox.x + heldBox.width / 2, heldBox.y + 40);
const zone = await column("Held").locator("ul").getAttribute("data-drop");
const heldGap = await gapIndex("Held");
await page.mouse.up();
await until(async () => (await comment(first.id)).status === "held");
await column("Held").locator(`li[data-card="${first.id}"]`).waitFor({ timeout: 5000 }).catch(() => {});
const held = await column("Held").locator(`li[data-card="${first.id}"]`).count();
const warns = (await (await fetch(`${base}/${a}/warnings`)).json()).warnings.filter((w) => w.code === "FOLIO-CMT-001" && w.args.thread === first.id && w.state !== "absent");
const skip = cli(["comment", "next", "--worker", "w8"]);
check("an empty column takes a drop in a highlighted zone", zone === "over" && heldGap === 0 && held === 1, `zone ${zone}, gap ${heldGap}, held ${held}`);
check("a held card raises no reply warning and agents skip it", held === 1 && warns.length === 0 && skip.startsWith(second.id), `held ${held}, CMT-001 ${warns.length}, next: ${skip.split("\n")[0]}`);
await post("api/inbox/move", { deck: a, id: second.id, column: "queue" });
await column("Queue").locator(`li[data-card="${second.id}"]`).waitFor();

const secondBox = await card(second.id).boundingBox();
await lift(first.id);
await moveTo(secondBox.x + 60, secondBox.y + secondBox.height - 10);
await until(async () => (await gapIndex("Queue")) === 1, 3000);
const backGap = await gapIndex("Queue");
await page.mouse.up();
await until(async () => (await idsIn("Queue")).join() === [second.id, first.id].join() && ranked([await comment(second.id), await comment(first.id)]) && (await comment(first.id)).status === "open");
const back = await idsIn("Queue");
const [againFirst, againSecond] = await Promise.all([comment(first.id), comment(second.id)]);
check("dragging back releases it at the hovered index", backGap === 1 && back.join() === [second.id, first.id].join() && againFirst.status === "open" && againFirst.rank > againSecond.rank, `gap ${backGap}, queue ${back.join(" > ")}, ${againFirst.status}`);

const doneBox = await column("Done").locator("ul").boundingBox();
await lift(first.id);
await moveTo(doneBox.x + doneBox.width / 2, doneBox.y + 30);
await page.mouse.up();
await until(() => existsSync(archive(first.id)));
check("dragging to Done resolves and archives", existsSync(archive(first.id)), archive(first.id));

await post("api/inbox/move", { deck: a, id: second.id, column: "held" });
await column("Held").locator(`li[data-card="${second.id}"]`).waitFor();
await card(second.id).locator("a").first().focus();
for (const key of ["Space", "ArrowRight", "Space"]) await page.keyboard.press(key), await settle(page);
await until(() => existsSync(archive(second.id)));
await column("Done").locator(`li[data-card="${second.id}"]`).waitFor({ timeout: 5000 }).catch(() => {});
await page.locator("[aria-live]", { hasText: "Dropped" }).first().waitFor({ state: "attached", timeout: 5000 }).catch(() => {});
const keyed = await column("Done").locator(`li[data-card="${second.id}"]`).count();
const live = await page.locator("[aria-live]").allTextContents();
check("Space, ArrowRight, Space moves a card one column, announced", keyed === 1 && existsSync(archive(second.id)) && live.some((t) => /Dropped/.test(t)), `in Done: ${keyed}; heard: ${live.join(" | ").slice(0, 80)}`);

const fourth = await make("Fourth in the queue.", 25);
await card(fourth.id).waitFor();
await page.route("**/api/inbox/move", (route) => route.fulfill({ status: 409, contentType: "application/problem+json", body: JSON.stringify({ title: "Move refused", detail: "the test refuses it" }) }));
await lift(fourth.id);
await moveTo(heldBox.x + heldBox.width / 2, heldBox.y + 40);
await page.mouse.up();
await column("Queue").locator('[role="alert"]').waitFor({ timeout: 5000 }).catch(() => {});
const refusedIn = await column("Queue").locator(`li[data-card="${fourth.id}"]`).count();
const noteText = await column("Queue").locator('[role="alert"]').textContent().catch(() => "");
check("a refused move returns the card with a note", refusedIn === 1 && /the test refuses it/.test(noteText), `in queue ${refusedIn}, note "${noteText}"`);
await page.unroute("**/api/inbox/move");

await card(fourth.id).locator("a").first().click();
const chatOpen = await page.locator('aside[aria-label="Comment chat"]').isVisible();
check("a plain click still opens the card", chatOpen, `chat open: ${chatOpen}`);

const b = decks.find((d) => d.dir === server.deckDir("example-b"));
await post(`${b.token}/comments`, { slide: "s001", region: [25, 110, 440, 100], marks: [], text: "A card from the second deck." });
const decksOf = new Map((await (await fetch(`${base}/api/inbox?view=all`)).json()).rows.map((r) => [r.id, r.deck]));
const boardCount = async (scope) => (await (await fetch(`${base}/api/inbox?view=board${scope ? `&scope=${scope}` : ""}`)).json()).rows.length;
const cardsShown = async (scope) => page.waitForFunction((n) => document.querySelectorAll("ul:not([data-drag-overlay]) > li[data-card]").length === n, await boardCount(scope), { timeout: 5000 }).catch(() => {});
const shownIds = () => page.locator("ul:not([data-drag-overlay]) > li[data-card]").evaluateAll((els) => els.map((e) => e.dataset.card));
const cardDeckNames = () => page.locator("ul:not([data-drag-overlay]) > li[data-card]").evaluateAll((els, titles) => els.filter((el) => titles.some((t) => el.textContent.includes(t))).length, decks.map((d) => d.title));
await page.goto(`${base}/inbox?from=${a}&slide=s002`, { waitUntil: "load" });
await cardsShown(a);
const scoped = await (await fetch(`${base}/api/inbox?view=all&scope=${a}`)).json();
const scopedShown = await shownIds();
const scopedQueue = Number(await page.locator('section[aria-label="Queue"] h2 .num').textContent());
const scopedDrafts = await page.locator('section[aria-label="Drafts"] h2 .num').textContent();
const scopedUnread = parseInt(await page.getByText(/\d+ unread/).textContent());
check("single deck mode shows only the deck it came from, without a deck filter or deck names, counting that deck", scopedShown.length > 0 && scopedShown.every((id) => scoped.rows.some((r) => r.id === id && r.deck === a)) && (await page.getByRole("button", { name: /^Deck:/ }).count()) === 0 && (await cardDeckNames()) === 0 && scopedQueue === scoped.counts.queue && scopedDrafts === String(scoped.counts.drafts) && scopedUnread === scoped.unread, `${scopedShown.length} cards, queue ${scopedQueue} vs ${scoped.counts.queue}, drafts ${scopedDrafts} vs ${scoped.counts.drafts}, unread ${scopedUnread} vs ${scoped.unread}, deck names on ${await cardDeckNames()} cards`);
await page.goto(`${base}/inbox`, { waitUntil: "load" });
await cardsShown();
const unscopedDecks = new Set((await shownIds()).map((id) => decksOf.get(id)));
check("single deck mode without from in a workspace of several decks shows every deck, still without a deck filter", unscopedDecks.has(a) && unscopedDecks.has(b.token) && (await page.getByRole("button", { name: /^Deck:/ }).count()) === 0, `${[...unscopedDecks].join(", ")}`);
await page.route("**/inbox*", async (route) => {
  if (route.request().resourceType() !== "document") return route.continue();
  const res = await route.fetch();
  await route.fulfill({ response: res, body: (await res.text()).replace('"showDeckList":false', '"showDeckList":true') });
});
await page.reload({ waitUntil: "load" });
await cardsShown();
check("with show_deck_list on, cards name their deck", (await cardDeckNames()) > 0, `deck names on ${await cardDeckNames()} cards`);
const bar = page.locator("header").first();
const removed = { author: await bar.getByRole("textbox", { name: "Author" }).count(), following: await bar.getByRole("button", { name: "Following" }).count(), slot: await bar.getByRole("button", { name: /^Slot/ }).count() + await bar.getByText("Any slot").count(), select: await page.locator("select").count() };
check("the bar has no Author input, Following toggle, slot filter or native select", Object.values(removed).every((n) => n === 0), JSON.stringify(removed));
const rowsById = new Map((await (await fetch(`${base}/api/inbox?view=board`)).json()).rows.map((r) => [r.id, r]));
const shownRows = async () => (await page.locator("li[data-card]").evaluateAll((els) => els.map((e) => e.dataset.card))).map((id) => rowsById.get(id));
const full = (await shownRows()).length;
const trigger = page.getByRole("button", { name: "Deck: Every deck" });
const triggerBox = await trigger.boundingBox();
await trigger.focus();
await page.keyboard.press("Enter");
const items = page.getByRole("menuitemradio");
await items.first().waitFor();
const labels = await items.evaluateAll((els) => els.map((e) => [e.querySelector("span.truncate")?.textContent, e.querySelector("span.num")?.textContent]));
const menuBox = await page.getByRole("menu").boundingBox();
await settle(page);
await page.screenshot({ path: join(shotDir, "board-menu.png") });
await page.keyboard.press("Escape");
const escFocus = await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Deck: Every deck", null, { timeout: 2000 }).then(() => true, () => false);
const focused = await page.evaluate(() => `${document.activeElement?.tagName} ${document.activeElement?.getAttribute("aria-label")}`);
check("the deck menu is at least the pill's width, Esc closes it and returns focus", menuBox.width >= triggerBox.width && escFocus && (await page.getByRole("menu").count()) === 0, `menu ${Math.round(menuBox.width)} px, pill ${Math.round(triggerBox.width)} px, focus back ${escFocus} (${focused})`);
const deckIndex = labels.findIndex(([label]) => label === b.title);
const apiCount = [...rowsById.values()].filter((r) => r.deck === b.token).length;
await trigger.focus();
await page.keyboard.press("Enter");
await items.first().waitFor();
await settle(page);
const focusedItem = (label) => page.waitForFunction((l) => document.activeElement?.querySelector("span.truncate")?.textContent === l, label, { timeout: 2000 }).catch(() => {});
for (let i = 0; i < deckIndex; i += 1) await page.keyboard.press("ArrowDown"), await focusedItem(labels[i + 1][0]);
await page.keyboard.press("Enter");
await until(async () => (await shownRows()).length && (await shownRows()).every((r) => r?.deck === b.token));
const deckRows = await shownRows();
const deckPill = await page.getByRole("button", { name: `Deck: ${b.title}` }).count();
check("picking a deck from the keyboard shows only that deck's cards", deckIndex > 0 && deckRows.length > 0 && deckRows.length < full && deckRows.every((r) => r?.deck === b.token) && deckPill === 1 && labels[deckIndex][1] === String(apiCount), `${deckRows.length} of ${full} cards, menu count ${labels[deckIndex]?.[1]} vs ${apiCount}, labels ${labels.map((l) => l.join(" ")).join(" | ")}`);
await page.getByRole("button", { name: `Deck: ${b.title}` }).click();
await page.getByRole("menuitemradio", { name: /^Every deck/ }).click();
await until(async () => (await shownRows()).length === full);
const restored = (await shownRows()).length;
const url = new URL(page.url());
check("Every deck restores the full count", restored === full && !url.searchParams.has("deck"), `${restored} of ${full}, url ${url.search}`);
await page.unroute("**/inbox*");
await page.screenshot({ path: join(shotDir, "board-after.png") });
const columnNames = () => page.locator("main > section[aria-label]").evaluateAll((els) => els.map((e) => e.getAttribute("aria-label")));
const doneCount = () => page.locator('section[aria-label="Done"] h2 .num').textContent();
const doneBefore = await doneCount();
const allColumns = ["Drafts", "Queue", "In progress", "Review", "Held", "Done"];
const firstLayout = await columnNames();
const draftHandles = await page.locator('section[aria-label="Drafts"] [aria-roledescription="draggable card"]').count();
const draftsToggle = await page.getByRole("button", { name: /^Drafts/ }).count();
check("Drafts leads the board (no Questions column), Drafts cards are not draggable, and the bar has no Drafts toggle", firstLayout.join(",") === allColumns.join(",") && draftHandles === 0 && draftsToggle === 0, `${firstLayout.join(", ")}; drag handles in Drafts ${draftHandles}; Drafts buttons ${draftsToggle}`);
await page.locator('button[aria-label="Board settings"]').click();
const toggle = page.getByRole("switch", { name: "Show Done column" });
await toggle.waitFor();
const switchNames = await page.getByRole("switch").evaluateAll((els) => els.map((e) => document.querySelector(`label[for="${e.id}"]`)?.textContent));
check("the settings button opens its popover with one switch per column, all on", (await toggle.getAttribute("aria-checked")) === "true" && switchNames.join(",") === allColumns.map((c) => `Show ${c} column`).join(","), `switches: ${switchNames.join(", ")}; Done checked: ${await toggle.getAttribute("aria-checked")}`);
await page.screenshot({ path: process.env.BOARD_SETTINGS_SHOT ?? join(shotDir, "board-settings.png") });
await toggle.click();
await page.keyboard.press("Escape");
await page.locator('section[aria-label="Done"]').waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
await toggle.waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
const hidden = await columnNames();
const popoverGone = (await toggle.count()) === 0;
check("hiding Done leaves the other five columns", hidden.join(",") === "Drafts,Queue,In progress,Review,Held" && popoverGone && page.url().includes("hide=done"), `${hidden.join(", ")}; popover closed: ${popoverGone}; ${page.url()}`);
await page.getByLabel("Search messages and slots").fill("first in the queue");
const hint = await page.getByRole("status").filter({ hasText: "hidden Done column" }).textContent({ timeout: 3000 }).catch(() => "");
check("a search still reports matches in the hidden Done column", parseInt(hint) >= 1, hint);
await page.goto(`${base}/inbox`, { waitUntil: "load" });
await page.locator('section[aria-label="Queue"]').waitFor();
const afterReload = await columnNames();
check("hiding Done persists across a reload", !afterReload.includes("Done") && afterReload.length === 5, afterReload.join(", "));
await page.locator('button[aria-label="Board settings"]').click();
await page.getByRole("switch", { name: "Show Done column" }).click();
await page.keyboard.press("Escape");
await page.locator('section[aria-label="Done"]').waitFor();
const doneAfter = await doneCount();
check("showing Done brings it back with its count", doneAfter === doneBefore && Number(doneAfter) > 0, `count ${doneBefore} -> ${doneAfter}`);
await page.locator('button[aria-label="Board settings"]').click();
for (const c of allColumns.filter((c) => c !== "Queue")) await page.getByRole("switch", { name: `Show ${c} column` }).click();
const lastSwitch = page.getByRole("switch", { name: "Show Queue column" });
const lastDisabled = await lastSwitch.isDisabled();
await page.keyboard.press("Escape");
const onlyQueue = await columnNames();
check("hiding all but Queue leaves Queue alone, its switch disabled", onlyQueue.join(",") === "Queue" && lastDisabled, `${onlyQueue.join(", ")}; Queue switch disabled: ${lastDisabled}`);
await page.locator('button[aria-label="Board settings"]').click();
for (const c of allColumns.filter((c) => c !== "Queue")) await page.getByRole("switch", { name: `Show ${c} column` }).click();
await page.keyboard.press("Escape");
await page.evaluate(() => (localStorage.removeItem("folio.board.hiddenColumns"), localStorage.setItem("folio.board.showDone", "0")));
await page.goto(`${base}/inbox`, { waitUntil: "load" });
await page.locator('section[aria-label="Queue"]').waitFor();
const migrated = await columnNames();
check("an old Show Done choice still hides Done", migrated.join(",") === "Drafts,Queue,In progress,Review,Held", migrated.join(", "));
await page.evaluate(() => (localStorage.removeItem("folio.board.hiddenColumns"), localStorage.removeItem("folio.board.showDone")));
await page.goto(`${base}/${a}/?slide=s002`, { waitUntil: "load" });
await page.locator('a[aria-label^="Inbox,"]').click();
await page.locator('section[aria-label="Queue"]').waitFor();
const backLink = page.getByRole("link", { name: "Back to the deck" });
const backHref = await backLink.getAttribute("href");
const gridGone = (await page.getByRole("link", { name: "Every deck" }).count()) === 0;
check("the editor's inbox link names its deck and slide, and the board links back to them", page.url().includes(`from=${a}`) && page.url().includes("slide=s002") && backHref === `/${a}/?slide=s002` && gridGone, `${page.url()}; back ${backHref}; Every deck link gone: ${gridGone}`);
await page.getByLabel("Search messages and slots").fill("queue");
await backLink.click();
await page.waitForURL((u) => u.pathname === `/${a}/`);
check("the return button opens the deck at the slide it came from", new URL(page.url()).searchParams.get("slide") === "s002", page.url());

// The action strip, tooltips and Clear all, in single deck mode on deck a.
await page.goto(`${base}/inbox?from=${a}`, { waitUntil: "load" });
const c1 = await make("Clear me, one.", 25);
const c2 = await make("Clear me, two.", 340);
await card(c2.id).waitFor();
await card(c1.id).hover();
const strip = await card(c1.id).evaluate((li) => {
  const bar = li.querySelector(":scope > div");
  const c = li.getBoundingClientRect(), s = bar.getBoundingClientRect();
  return { right: s.right - c.right, top: s.top - c.top, radius: getComputedStyle(bar).borderTopRightRadius, card: getComputedStyle(li).borderTopRightRadius };
});
check("the action strip sits flush in the card's top-right corner with the card's radius", Math.abs(strip.right - 1) <= 0.5 && Math.abs(strip.top + 1) <= 0.5 && strip.radius === strip.card, JSON.stringify(strip));
await card(c1.id).getByRole("button", { name: "Resolve" }).hover();
const tip = await page.getByRole("tooltip").first().textContent({ timeout: 3000 }).catch(() => "");
const titled = await page.locator("main button[title], main a[title], header button[title], header a[title]").count();
check("a card button shows the chrome tooltip, and no board button has a native title", tip.includes("Resolve") && titled === 0, `tooltip "${tip}", titled buttons ${titled}`);
await page.mouse.move(0, 0);

const clearButton = (title) => column(title).getByRole("button", { name: "Clear all" });
const clearPopover = (title) => page.getByRole("dialog", { name: `Clear ${title}` });
const statusOf = (id) => comment(id).then((c) => c.status);
await settle(page);
const queueShown = await idsIn("Queue");
const queueConfirmLabel = `Resolve ${queueShown.length} card${queueShown.length === 1 ? "" : "s"} from Queue`;
await clearButton("Queue").click();
const asks = await clearPopover("Queue").getByRole("button", { name: queueConfirmLabel }).getAttribute("aria-label");
await page.keyboard.press("Escape");
const escGone = await clearPopover("Queue").waitFor({ state: "detached", timeout: 2000 }).then(() => true, () => false);
await clearButton("Queue").click();
await clearPopover("Queue").getByRole("button", { name: "Cancel" }).click();
const cancelGone = await clearPopover("Queue").waitFor({ state: "detached", timeout: 2000 }).then(() => true, () => false);
const untouched = (await Promise.all(queueShown.map(statusOf))).every((st) => st === "open");
check("Clear all on Queue asks with the count; Esc and Cancel clear nothing", asks === queueConfirmLabel && escGone && cancelGone && untouched, `"${asks}", esc ${escGone}, cancel ${cancelGone}, untouched ${untouched}`);

await clearButton("Queue").click();
const late = await make("Arrived while the popover was open.", 655);
let clearBodies = 0;
page.on("request", (r) => r.url().endsWith("/api/inbox/clear") && clearBodies++);
await clearPopover("Queue").getByRole("button", { name: queueConfirmLabel }).click();
await clearPopover("Queue").waitFor({ state: "detached", timeout: 5000 });
await until(async () => (await Promise.all(queueShown.map(statusOf))).every((st) => st === "resolved"));
const resolvedAll = (await Promise.all(queueShown.map(statusOf))).every((st) => st === "resolved");
const lateStatus = await statusOf(late.id);
check("Resolve all resolves exactly the cards shown, in one request, and leaves a later card", resolvedAll && lateStatus === "open" && clearBodies === 1, `${queueShown.length} resolved ${resolvedAll}, late ${lateStatus}, requests ${clearBodies}`);

const doneShown = (await (await fetch(`${base}/api/inbox?view=done&scope=${a}`)).json()).rows.map((r) => r.id);
await page.waitForFunction((n) => document.querySelectorAll('section[aria-label="Done"] li[data-card]').length === n, doneShown.length, { timeout: 5000 }).catch(() => {});
await clearButton("Done").click();
await clearPopover("Done").getByRole("button", { name: `Clear ${doneShown.length} card${doneShown.length === 1 ? "" : "s"} from Done` }).click();
await clearPopover("Done").waitFor({ state: "detached", timeout: 5000 });
await until(async () => (await (await fetch(`${base}/api/inbox?view=all&scope=${a}`)).json()).counts.done === 0);
const doneLeft = (await (await fetch(`${base}/api/inbox?view=all&scope=${a}`)).json()).counts.done;
const found = new Set(JSON.parse(cli(["comment", "search", "--status", "resolved", "--limit", "100000", "--json"])).hits.map((h) => h.id));
check("Clear on Done empties Done, and comment search --status resolved still finds them", doneShown.length > 0 && doneLeft === 0 && doneShown.every((id) => found.has(id)) && (await column("Done").locator("li[data-card]").count()) === 0, `${doneShown.length} cleared, Done now ${doneLeft}, found ${doneShown.filter((id) => found.has(id)).length}`);

const day = new Date().toISOString().slice(0, 10);
const draftId = `dclear${Date.now().toString(36)}`;
await fetch(`${base}/${a}/drafts/${draftId}`, { method: "PUT", body: JSON.stringify({ id: draftId, slide: "s002", slideRev: "", region: null, marks: [], text: "A draft to clear.", uploads: [] }) });
await column("Drafts").locator(`li:has(a[href*="draft=${draftId}"])`).waitFor({ timeout: 5000 });
const draftsShown = (await (await fetch(`${base}/${a}/drafts`)).json()).drafts.length;
await clearButton("Drafts").click();
await clearPopover("Drafts").getByRole("button", { name: `Discard ${draftsShown} draft${draftsShown === 1 ? "" : "s"}` }).click();
await clearPopover("Drafts").waitFor({ state: "detached", timeout: 5000 });
const draftsLeft = (await (await fetch(`${base}/${a}/drafts`)).json()).drafts.length;
const draftsRoot = join(server.deckDir("example"), ".folio/drafts");
const draftArchived = existsSync(draftsRoot) && readdirSync(draftsRoot).some((user) => existsSync(join(draftsRoot, user, ".archive", day, `${draftId}.json`)));
check("Discard drafts moves every draft to the drafts archive", draftsLeft === 0 && draftArchived, `drafts left ${draftsLeft}, archived ${draftArchived}`);

const layout = await make("For layout checks.", 875);
await card(layout.id).waitFor();
await page.setViewportSize({ width: 1024, height: 900 });
const widths = await page.locator("main > section").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
const scrollInfo = await page.locator("main").evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }));
check("each column keeps a 280 px floor and the board scrolls past it instead of squeezing", widths.every((w) => w >= 279) && scrollInfo.scrollWidth > scrollInfo.clientWidth, `widths ${widths.map((w) => Math.round(w)).join(",")}; scrollWidth ${scrollInfo.scrollWidth} > clientWidth ${scrollInfo.clientWidth}`);

const widthsBefore = await page.locator("main > section").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
await card(layout.id).locator("a").click();
const panel = page.locator('aside[aria-label="Comment chat"]');
await panel.waitFor();
const position = await panel.evaluate((el) => getComputedStyle(el).position);
const widthsAfter = await page.locator("main > section").evaluateAll((els) => els.map((e) => e.getBoundingClientRect().width));
check("opening a comment floats the panel over the board without changing a column's width", (position === "fixed" || position === "absolute") && JSON.stringify(widthsBefore) === JSON.stringify(widthsAfter), `position ${position}; widths before ${widthsBefore.map(Math.round)} after ${widthsAfter.map(Math.round)}`);

const panelTop = (await panel.boundingBox()).y;
const columnTop = (await page.locator("main > section").first().boundingBox()).y;
check("the panel's top lines up with the columns' top, not the window top", Math.abs(panelTop - columnTop) <= 1, `panel top ${panelTop}, column top ${columnTop}`);

await page.keyboard.press("Escape");
const closedByEscape = await panel.waitFor({ state: "detached", timeout: 2000 }).then(() => true, () => false);
check("Escape closes the floating panel", closedByEscape, `detached ${closedByEscape}`);

await card(layout.id).locator("a").click();
await panel.waitFor();
const mainBox = await page.locator("main").boundingBox();
await page.mouse.click(mainBox.x + 2, mainBox.y + 2);
const closedByOutsideClick = await panel.waitFor({ state: "detached", timeout: 2000 }).then(() => true, () => false);
check("clicking the board's empty space closes the floating panel", closedByOutsideClick, `detached ${closedByOutsideClick}`);

await page.setViewportSize({ width: 2200, height: 900 });
await browser.close();
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
