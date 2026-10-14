/**
 * Comment screenshots, rendered server-side by the same print page the PDF
 * uses, with the comment's sketch drawn on top and never the selection border:
 * `shot-slide.png` is the whole slide with faint corner ticks at the region,
 * `shot-region.png` the region at 2x, ticks hidden. Playwright is optional;
 * without it a comment is kept without screenshots and the reason is logged.
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { FolioComment } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import { loadPlaywright } from "../playwright.js";
import { shotsDir } from "./store.js";
import type { ShotTaker } from "./service.js";

type Browser = import("playwright").Browser;

const PX_PER_PT = 4 / 3;

export class PlaywrightShots implements ShotTaker {
  private browser: Promise<Browser | null> | null = null;
  private missing: string | null = null;

  /**
   * @param base - this server's own address, e.g. `http://127.0.0.1:4310`.
   */
  constructor(private readonly base: () => string) {}

  private async launch(): Promise<Browser | null> {
    try {
      const { chromium } = await loadPlaywright();
      return await chromium.launch();
    } catch (error) {
      this.missing = `comment screenshots need Playwright: pnpm add -w playwright@1.62.1 && pnpm exec playwright install chromium (${(error as Error).message.split("\n")[0]})`;
      process.stderr.write(`${this.missing}\n`);
      return null;
    }
  }

  /**
   * Render the slide with the comment drawn on it and save both screenshots.
   *
   * @param tag - a suffix for a reply's pair, empty for the first.
   * @returns file names relative to the comment's folder, or null without a browser.
   */
  async capture(store: DeckStore, comment: FolioComment, tag: string): Promise<{ region: string; slide: string } | null> {
    this.browser ??= this.launch();
    const browser = await this.browser;
    if (!browser) return null;
    const page = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 1400, height: 800 } });
    try {
      await page.goto(`${this.base()}/${store.token}/?print=1&slides=${comment.slide}&comment=${comment.id}`, { waitUntil: "load" });
      await page.waitForFunction(() => (window as unknown as { __FOLIO_READY__?: boolean }).__FOLIO_READY__ === true, null, { timeout: 30_000 });
      const box = await page.locator(`[data-slide="${comment.slide}"]`).first().boundingBox();
      if (!box) return null;
      const dir = shotsDir(store, comment.id);
      mkdirSync(dir, { recursive: true });
      const names = { slide: `shot-slide${tag}.png`, region: `shot-region${tag}.png` };
      await page.screenshot({ path: join(dir, names.slide), clip: box });
      await page.addStyleTag({ content: ".folio-shot-locator{display:none}" });
      const [x, y, w, h] = comment.region;
      const pad = 8;
      const clip = { x: box.x + Math.max(0, x * PX_PER_PT - pad), y: box.y + Math.max(0, y * PX_PER_PT - pad), width: Math.min(box.width, w * PX_PER_PT + 2 * pad), height: Math.min(box.height, h * PX_PER_PT + 2 * pad) };
      await page.screenshot({ path: join(dir, names.region), clip });
      return names;
    } finally {
      await page.close();
    }
  }

  /** Close the browser. */
  async close(): Promise<void> {
    const b = await this.browser;
    await b?.close();
  }
}
