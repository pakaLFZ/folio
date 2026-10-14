// Browser check: typing into the note past its line limit draws the danger outline and marks the
// slot and the rail, no badge is drawn on the slide, and the font size never changes. The panel's
// tab bar carries no Warnings tab (removed 2026-10-13; warnings stay visible on the slide, the rail
// dot, and `folio check`/`folio ack`). Serves its own copy of decks/example-b.
import { chromium } from "playwright";
import { join } from "node:path";
import { serve } from "./lib/server.mjs";
const server = await serve({ decks: ["example-b"] });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${server.base}/${server.token("example-b")}/?slide=s001`, { waitUntil: "load" });
await page.waitForSelector('main [data-slot="note"] .folio-text');
const note = page.locator('main [data-slot="note"] .folio-text');
const before = await note.evaluate((el) => getComputedStyle(el).fontSize);
await note.click();
await page.keyboard.press("End");
for (let i = 0; i < 26; i += 1) await page.keyboard.press("Enter"), await page.keyboard.type(`Line ${i}`);
await page.waitForFunction(() => document.querySelector('main [data-slot="note"]')?.dataset.overflow === "lines" && document.querySelector('[aria-current="page"] [aria-label="has warnings"]'), null, { timeout: 5000 }).catch(() => {});
const after = await note.evaluate((el) => getComputedStyle(el).fontSize);
const outline = await page.locator('main [data-slot="note"]').evaluate((el) => getComputedStyle(el).outlineColor);
const flagged = await page.locator('main [data-slot="note"]').getAttribute("data-overflow");
const badges = await page.locator("main .folio-slide [data-slot]:has(> .folio-text) > :not(.folio-text)").count();
const pins = await page.locator("main [data-pin]").count();
const railDot = await page.locator('[aria-current="page"] [aria-label="has warnings"]').count();
const warningsTab = await page.locator('aside[aria-label="Deck panel"] button[aria-label="Warnings"]').count();
console.log(`font ${before} -> ${after}; outline ${outline}; data-overflow ${flagged}; badges ${badges}; pins ${pins}; rail dot ${railDot}; warnings tab ${warningsTab}`);
await page.screenshot({ path: process.argv[2] ?? join(server.root, "overflow.png") });
await page.keyboard.press("Escape");
await browser.close();
await server.stop();
const ok = before === after && outline === "rgb(161, 43, 38)" && flagged === "lines" && badges === 0 && pins === 0 && railDot === 1 && warningsTab === 0;
console.log(ok ? "PASS  overflow shows by outline, slot flag and rail dot, with no badge or pin in Edit mode, and no Warnings tab" : "FAIL  overflow check");
process.exit(ok ? 0 : 1);
