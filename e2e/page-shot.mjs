// Screenshot a page and list console errors: node e2e/page-shot.mjs URL OUT.png [W H]
import { chromium } from "playwright";
import { settle } from "./lib/page.mjs";
const [url, out, w = "1440", h = "900"] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: Number(w), height: Number(h) }, deviceScaleFactor: 1 });
const problems = [];
page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
await page.goto(url, { waitUntil: "load" });
await page.evaluate(() => document.fonts.ready);
await settle(page);
await page.screenshot({ path: out });
console.log(problems.join("\n") || "no console errors");
await browser.close();
