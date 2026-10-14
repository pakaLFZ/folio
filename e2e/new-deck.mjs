// The landing page's New deck button, on its own copy of decks/example: the rows carry no counts, the popover
// offers the workspace's pack and the built-in plain@1 (chosen by default), Create makes decks/<slug>/ on the
// running server and lands in its editor, and a second deck of the same title is refused by name in the popover.
// Then search narrows the rows by title or token, Edited sorts newest first (the default), Name sorts A to Z, and
// the chosen sort survives a reload. The fixture decks are back-dated so the edited order is known. Last, a row's
// Archive button (shown on hover) hides the deck without following the link, which survives a reload; Archived (N)
// lists it and Unarchive brings it back; folio deck archive / unarchive do the same from the CLI.
import { chromium } from "playwright";
import { existsSync, readdirSync, readFileSync, utimesSync } from "node:fs";
import { join } from "node:path";
import { start, workspace } from "./lib/server.mjs";

const ws = workspace({ decks: ["example", "example-b"] });
const backdate = (deck, iso) => {
  const dir = join(ws, "decks", deck);
  for (const f of ["deck.json", ...readdirSync(join(dir, "slides")).filter((n) => n.endsWith(".json")).map((n) => `slides/${n}`)]) utimesSync(join(dir, f), new Date(iso), new Date(iso));
};
backdate("example", "2026-01-01T00:00:00Z");
backdate("example-b", "2026-02-01T00:00:00Z");
const server = await start(ws);
const { base, root } = server;
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
page.on("pageerror", (e) => console.log("pageerror", e.message));

await page.goto(`${base}/`, { waitUntil: "load" });
const row = page.locator("ul li a").first();
await row.waitFor();
const rowText = await row.innerText();
check("a deck row shows its title and address and no counts", !/slides|open|warnings/.test(rowText) && /\/[0-9a-f]{8}\//.test(rowText), JSON.stringify(rowText));

const openForm = async () => {
  await page.getByRole("button", { name: "New deck" }).click();
  await page.getByRole("radio", { name: "plain@1" }).waitFor();
};
await openForm();
const offered = await page.getByRole("radiogroup", { name: "Template" }).getByRole("radio").evaluateAll((els) => els.map((e) => `${e.closest("label").innerText}:${e.getAttribute("aria-checked")}`));
check("the template list holds the workspace's pack and the built-in plain@1, plain@1 chosen", JSON.stringify(offered) === JSON.stringify(["lectern@1:false", "plain@1:true"]), JSON.stringify(offered));

await page.getByRole("textbox").fill("Group meeting");
await page.getByRole("button", { name: "Create" }).click();
await page.waitForURL((u) => /^\/[0-9a-f]{8}\/$/.test(u.pathname), { timeout: 10000 }).catch(() => {});
const token = new URL(page.url()).pathname.slice(1, -1);
const deckJson = join(root, "decks/group-meeting/deck.json");
const made = existsSync(deckJson) ? JSON.parse(readFileSync(deckJson, "utf8")) : null;
const editor = await page.locator('[data-chrome="mode"]').waitFor({ timeout: 10000 }).then(() => true, () => false);
const listed = (await (await fetch(`${base}/api/decks`)).json()).decks;
const mounted = listed.find((d) => d.dir === join(root, "decks/group-meeting"));
check("Create makes decks/group-meeting on plain@1 and lands in its editor", made?.title === "Group meeting" && made.template === "plain@1" && mounted?.token === token && editor, `at ${page.url()}, deck ${JSON.stringify(made)}, mounted at ${mounted?.token}, editor ${editor}`);
check("the running server lists the new deck", listed.some((d) => d.title === "Group meeting"), JSON.stringify(listed.map((d) => d.title)));

await page.goto(`${base}/`, { waitUntil: "load" });
await openForm();
await page.getByRole("textbox").fill("group meeting");
await page.getByRole("button", { name: "Create" }).click();
const alert = await page.getByRole("alert").innerText({ timeout: 5000 }).catch(() => "");
check("a title whose folder exists is refused by name, and the page stays", /decks\/group-meeting already exists/.test(alert) && new URL(page.url()).pathname === "/", `${JSON.stringify(alert)} at ${page.url()}`);

const titles = () => page.locator("ul li a span.font-medium").allInnerTexts();
await page.goto(`${base}/`, { waitUntil: "load" });
await page.locator("ul li a").first().waitFor();
const edited = await titles();
check("Edited is the default sort, newest first", JSON.stringify(edited) === JSON.stringify(["Group meeting", "Second deck", "Example deck"]), JSON.stringify(edited));
await page.getByRole("radio", { name: "Name" }).click();
const byName = await titles();
check("Name sorts A to Z", JSON.stringify(byName) === JSON.stringify(["Example deck", "Group meeting", "Second deck"]), JSON.stringify(byName));
await page.reload({ waitUntil: "load" });
await page.locator("ul li a").first().waitFor();
const kept = [await page.getByRole("radio", { name: "Name" }).getAttribute("aria-checked"), JSON.stringify(await titles())];
check("the chosen sort survives a reload", kept[0] === "true" && kept[1] === JSON.stringify(byName), JSON.stringify(kept));
const search = page.getByRole("searchbox", { name: "Search decks" });
await search.fill("SECOND");
const byTitle = await titles();
const exampleToken = server.token("example");
await search.fill(`/${exampleToken}/`);
const byToken = await titles();
await search.fill("nothing like this");
const none = [await titles(), await page.getByText("No deck matches nothing like this.").count()];
check("search narrows by title (any case) and by token, and says when nothing matches", JSON.stringify(byTitle) === '["Second deck"]' && JSON.stringify(byToken) === '["Example deck"]' && none[0].length === 0 && none[1] === 1, JSON.stringify({ byTitle, byToken, none }));

await page.reload({ waitUntil: "load" });
await page.locator("ul li a").first().waitFor();
await page.locator("ul li", { hasText: "Second deck" }).hover();
const archiveButton = page.getByRole("button", { name: "Archive Second deck" });
await page.waitForFunction(() => getComputedStyle(document.querySelector('[aria-label="Archive Second deck"]')).opacity === "1", null, { timeout: 3000 }).catch(() => {});
const visibleOnHover = await archiveButton.evaluate((el) => getComputedStyle(el).opacity);
await archiveButton.click();
await page.waitForFunction(() => ![...document.querySelectorAll("ul li")].some((li) => li.textContent.includes("Second deck")), null, { timeout: 5000 }).catch(() => {});
const afterArchive = [await titles(), new URL(page.url()).pathname, JSON.parse(readFileSync(join(root, "decks/example-b/deck.json"), "utf8")).archived];
check("Archive shows on hover, hides the row, stays on the page and marks deck.json", visibleOnHover === "1" && JSON.stringify(afterArchive) === JSON.stringify([["Example deck", "Group meeting"], "/", true]), JSON.stringify({ visibleOnHover, afterArchive }));
await page.reload({ waitUntil: "load" });
await page.locator("ul li a").first().waitFor();
const toggle = page.getByRole("button", { name: "Archived (1)" });
const reloaded = [await titles(), await toggle.count()];
check("an archived deck stays hidden after a reload and is counted in Archived (1)", JSON.stringify(reloaded) === JSON.stringify([["Example deck", "Group meeting"], 1]), JSON.stringify(reloaded));
await toggle.click();
const archivedList = await titles();
await page.locator("ul li", { hasText: "Second deck" }).hover();
await page.getByRole("button", { name: "Unarchive Second deck" }).click();
await page.waitForFunction(() => document.querySelectorAll("ul li").length === 3, null, { timeout: 5000 }).catch(() => {});
const restored = [await titles(), await page.getByRole("button", { name: /^Archived/ }).count(), JSON.parse(readFileSync(join(root, "decks/example-b/deck.json"), "utf8")).archived ?? null];
check("Archived lists it and Unarchive brings it back to the list", JSON.stringify(archivedList) === '["Second deck"]' && JSON.stringify(restored) === JSON.stringify([["Example deck", "Group meeting", "Second deck"], 0, null]), JSON.stringify({ archivedList, restored }));
const apiTitles = async (q = "") => (await (await fetch(`${base}/api/decks${q}`)).json()).decks.map((d) => d.title).sort();
const cliOut = server.cli(["deck", "archive", "decks/example"]);
const cliHidden = [await apiTitles(), await apiTitles("?archived=1")];
server.cli(["deck", "unarchive", "decks/example"]);
const cliBack = await apiTitles();
check("folio deck archive hides it from the running server's list and unarchive restores it", JSON.stringify(cliHidden) === JSON.stringify([["Group meeting", "Second deck"], ["Example deck", "Group meeting", "Second deck"]]) && cliBack.length === 3 && /archived at/.test(cliOut), JSON.stringify({ cliOut: cliOut.trim(), cliHidden, cliBack }));

await page.goto(`${base}/`, { waitUntil: "load" });
await page.locator("ul li a").first().waitFor();
await page.getByRole("radio", { name: "Edited" }).click();
await page.getByRole("searchbox", { name: "Search decks" }).fill("deck");
await page.evaluate(() => (window.__sameDocument = true));
const listIs = (want) => page.waitForFunction((w) => JSON.stringify([...document.querySelectorAll("ul li a span.font-medium")].map((s) => s.textContent)) === w, JSON.stringify(want), { timeout: 8000 }).then(() => true, () => false);
const titlesNow = () => titles().then(JSON.stringify);
server.cli(["init-deck", "decks/live", "--title", "Live deck"]);
const liveAdded = await page.waitForFunction(() => document.querySelector("ul li a span.font-medium")?.textContent === "Live deck", null, { timeout: 8000 }).then(() => true, () => false);
check("a deck made by folio init-deck appears at the top of the open page without a reload", liveAdded, await titlesNow());
server.cli(["new", "decks/example", "--template", "title"]);
const exampleMoved = await page.waitForFunction(() => document.querySelector("ul li a span.font-medium")?.textContent === "Example deck", null, { timeout: 8000 }).then(() => true, () => false);
check("an edit moves its deck to the top of the Edited order", exampleMoved, await titlesNow());
server.cli(["deck", "archive", "decks/example-b"]);
const archivedLive = await listIs(["Example deck", "Live deck"]);
const stayed = await page.evaluate(() => [window.__sameDocument === true, document.querySelector('input[type="search"]').value]);
check("a deck archived by the CLI leaves the open page; the search text and the page stay", archivedLive && JSON.stringify(stayed) === '[true,"deck"]', JSON.stringify({ list: await titlesNow(), stayed }));

await browser.close();
await server.stop();
process.exit(results.every(Boolean) ? 0 : 1);
