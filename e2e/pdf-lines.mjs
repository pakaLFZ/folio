// Check: folio pdf breaks the note into the same lines as the live view. Serves its own copy of
// decks/example; needs pdftotext on PATH.
import { chromium } from "playwright";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { serve } from "./lib/server.mjs";
const server = await serve({ decks: ["example"] });
const out = join(server.root, "pdf-lines.pdf");
const pdfDone = server.cliAsync(["pdf", "decks/example", "--out", out]);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1100, height: 800 } });
await page.goto(`${server.base}/${server.token("example")}/?slide=s002&mode=view`, { waitUntil: "load" });
await page.waitForSelector('main [data-slot="note"] .folio-text');
const live = await page.locator('main [data-slot="note"] .folio-text').evaluate((el) => {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  const lines = [""];
  let prevLeft = -Infinity;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    for (let i = 0; i < n.data.length; i += 1) {
      const r = document.createRange();
      r.setStart(n, i);
      r.setEnd(n, i + 1);
      const rect = r.getClientRects()[0];
      if (n.data[i] === "\n") {
        lines.push("");
        prevLeft = -Infinity;
        continue;
      }
      if (!rect) continue;
      if (rect.left < prevLeft - 2) lines.push("");
      lines[lines.length - 1] += n.data[i];
      prevLeft = rect.left;
    }
  }
  return lines.map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean);
});
await browser.close();
await pdfDone;
await server.stop();
const pdf = execFileSync("pdftotext", ["-f", "2", "-l", "2", "-x", "48", "-y", "118", "-W", "384", "-H", "370", "-layout", out, "-"], { encoding: "utf8" }).split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
const n = Math.min(pdf.length, live.length);
const same = pdf.slice(0, n).every((l, i) => l === live[i]);
const ok = same && n >= 15;
console.log(`${ok ? "PASS" : "FAIL"}  the PDF breaks the note where the live view does  ${n} lines compared${same ? "" : `; first difference: "${pdf.find((l, i) => l !== live[i])}"`}`);
process.exit(ok ? 0 : 1);
