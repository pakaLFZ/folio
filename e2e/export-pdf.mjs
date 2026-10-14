// Export button checks (spec/slides/pdf.md) against its own copy of decks/example-b:
// the button sits left of the inbox, a click shows "Exporting PDF…" at the top of the scene
// (below the top row, centred between the panes), then "Saved <name>.pdf" and triggers a
// browser download of valid PDF bytes; nothing is written into the workspace's decks folder,
// and a second click downloads the same name again (the browser owns any numbering).
import { chromium } from "playwright";
import { readdirSync } from "node:fs";
import { basename, dirname } from "node:path";
import { serve } from "./lib/server.mjs";
import { downloadBytes } from "./lib/page.mjs";
const server = await serve({ decks: ["example-b"] });
const { base } = server;
const deck = { dir: server.deckDir("example-b"), token: server.token("example-b") };
const folder = dirname(deck.dir);
const stem = basename(deck.dir);
const before = new Set(readdirSync(folder));
const results = [];
const check = (name, ok, seen) => (results.push(ok), console.log(`${ok ? "PASS" : "FAIL"}  ${name}  ${seen}`));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
await page.goto(`${base}/${deck.token}/`, { waitUntil: "load" });
const button = page.getByRole("button", { name: "Download", exact: true });
const inbox = page.locator('a[aria-label^="Inbox"]');
await button.waitFor();
const [b, i] = [await button.boundingBox(), await inbox.boundingBox()];
check("the download button stands just left of the inbox, the same size", b.x + b.width <= i.x && i.x - (b.x + b.width) < 8 && Math.abs(b.y - i.y) < 1 && Math.abs(b.width - i.width) < 1, `gap ${(i.x - b.x - b.width).toFixed(1)} px`);

const status = page.locator('[role="status"]');
const recordStatuses = () => page.evaluate(() => {
  window.statusesSeen = [];
  const note = () => window.statusesSeen.push(document.querySelector('[role="status"]')?.textContent ?? "");
  new MutationObserver(note).observe(document.body, { subtree: true, childList: true, characterData: true });
});
const exportOnce = async () => {
  await recordStatuses();
  const downloaded = page.waitForEvent("download", { timeout: 180_000 });
  await button.click();
  await page.getByRole("menuitem", { name: "PDF", exact: true }).click();
  const disabled = await button.isDisabled();
  await page.locator(".notice-card").waitFor({ timeout: 3000 }).catch(() => {});
  const card = await page.locator(".notice-card").boundingBox();
  const mode = await page.locator('[data-chrome="mode"]').boundingBox();
  const panel = await page.getByRole("complementary", { name: "Deck panel" }).boundingBox();
  placed.push(!!card && card.y >= mode.y + mode.height && card.y < 120 && Math.abs(card.x + card.width / 2 - panel.x / 2) < 2);
  await page.waitForFunction(() => /Saved|failed/.test(document.querySelector('[role="status"]')?.textContent ?? ""), null, { timeout: 180_000 });
  const busy = (await page.evaluate(() => window.statusesSeen)).find((t) => t.includes("Exporting PDF")) ?? "";
  const download = await downloaded;
  const bytes = await downloadBytes(download);
  return { busy, disabled, done: await status.textContent(), download, bytes };
};

const placed = [];
const first = await exportOnce();
check("a click shows the exporting toast and disables the button", first.busy.includes("Exporting PDF") && first.disabled, `"${first.busy}", disabled ${first.disabled}`);
check("the toast stands at the top, below the top row, centred between the panes", placed[0], JSON.stringify(placed));
const firstFile = `${stem}.pdf`;
check("the toast names the file", first.done.includes(`Saved ${firstFile}`), `"${first.done}"`);
check("the download's suggested filename matches the toast", first.download.suggestedFilename() === firstFile, first.download.suggestedFilename());
check("the download is a valid, non-trivial PDF", first.bytes.subarray(0, 5).toString("latin1") === "%PDF-" && first.bytes.length > 1000, `${first.bytes.length} bytes, header "${first.bytes.subarray(0, 5)}"`);

const second = await exportOnce();
check("a second export downloads the same name again (no workspace numbering)", second.download.suggestedFilename() === firstFile, second.download.suggestedFilename());
check("nothing is written into the workspace's decks folder", JSON.stringify([...readdirSync(folder)].sort()) === JSON.stringify([...before].sort()), JSON.stringify(readdirSync(folder)));

await browser.close();
await server.stop();
console.log(`${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
