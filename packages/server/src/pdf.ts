/**
 * The PDF of a deck: the print page printed by headless Chromium, the same
 * renderer and fonts as the live view, at the pack's canvas size. `folio pdf`
 * and the editor's export button both call `printDeck`; the default file is
 * named after the deck's folder, beside it, and never overwrites one.
 */
import { writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { addPdfInfo, folioTraceValue, isActive, type FolioWarning, type SlideMeasurement } from "@folio/core";
import type { FolioApp } from "./app.js";
import type { DeckStore } from "./deckstore.js";
import { sendProblem, type Router } from "./httpkit.js";
import { deckOr404 } from "./routes-deck.js";
import { pageTraces } from "./hooks/slottrace.js";
import { deckHookState } from "./hooks/state.js";
import { ensureChromium, loadPlaywright } from "./playwright.js";

type Browser = import("playwright").Browser;
type Page = import("playwright").Page;
type PageOptions = Parameters<Browser["newPage"]>[0];
export type Measured = Record<string, SlideMeasurement>;

const PX_PER_PT = 4 / 3;
export const FIGURE_WAIT_MS = 120_000;

/**
 * Open a deck's print page and wait until every slide is laid out.
 *
 * @param base - the address of a server for the deck's workspace.
 * @param slides - limit to these slide ids; all when omitted.
 * @param pageOptions - Playwright page options, such as a device scale factor for screenshots.
 * @returns the open page and the measurements it published.
 */
export async function openPrintPage(browser: Browser, base: string, token: string, slides?: string[], timeoutMs = 60_000, pageOptions: PageOptions = {}, drafts = false): Promise<{ page: Page; measured: Measured }> {
  const page = await browser.newPage(pageOptions);
  const query = `${slides?.length ? `&slides=${slides.join(",")}` : ""}${drafts ? "&drafts=1" : ""}`;
  await page.goto(`${base}/${token}/?print=1${query}`, { waitUntil: "load" });
  await page.waitForFunction(() => window.__FOLIO_READY__ === true || !!window.__FOLIO_ERROR__, null, { timeout: timeoutMs }).catch(async (error: Error) => {
    if (!/Timeout/.test(error.message)) throw error;
    const pending = await page.evaluate(() => window.__FOLIO_PENDING__?.() ?? null).catch(() => null);
    await page.close();
    throw new Error(notReady(timeoutMs, pending));
  });
  const error = await page.evaluate(() => window.__FOLIO_ERROR__);
  if (error) throw new Error(`print page failed: ${error}`);
  const measured = await page.evaluate(() => window.__FOLIO_MEASURE__ ?? {});
  return { page, measured };
}

/**
 * Why the print page was given up on, naming what it still waited for.
 *
 * @param pending - the page's own list, or null when the page never started.
 */
export function notReady(timeoutMs: number, pending: string[] | null): string {
  const after = `the print page was not ready after ${Math.round(timeoutMs / 1000)} s`;
  if (!pending) return `${after}: the page never started drawing (run pnpm build:web if the web app is stale)`;
  if (!pending.length) return `${after}: nothing is still loading, but the page never finished laying out`;
  const shown = pending.slice(0, 8).join("; ");
  return `${after}; still waiting for ${shown}${pending.length > 8 ? `; and ${pending.length - 8} more` : ""}`;
}

export interface PrintedDeck {
  pdf: Buffer;
  measured: Measured;
  warnings: FolioWarning[];
}

/**
 * Print a deck to PDF bytes, with the warnings the same page measured.
 *
 * @param base - the address of a server for the deck's workspace.
 * @param slides - limit to these slide ids; all when omitted.
 */
export async function printDeck(app: FolioApp, store: DeckStore, browser: Browser, base: string, slides?: string[], timeoutMs = 60_000): Promise<PrintedDeck> {
  const pack = app.workspace.packOf(store);
  if (!pack) throw new Error(`pack ${store.deck.template} is not installed`);
  const { page, measured } = await openPrintPage(browser, base, store.token, slides, timeoutMs);
  try {
    const { w, h } = pack.pack.canvas;
    const printed = await page.pdf({ width: `${w * PX_PER_PT}px`, height: `${h * PX_PER_PT}px`, printBackground: true, preferCSSPageSize: true });
    const pdf = Buffer.from(addPdfInfo(printed, { FolioTrace: folioTraceValue(pageTraces(store, slides?.length ? slides : store.slideIds())) }));
    const warnings = store.slideIds().flatMap((id) => app.warnings.slideWarnings(store, id, measured[id] ?? null));
    return { pdf, measured, warnings };
  } finally {
    await page.close();
  }
}

/**
 * Every hooked slot's last good key, as one comparable string.
 *
 * @returns the deck's slot states reduced to `slide/slot=key` lines.
 */
function goodKeys(store: DeckStore): string {
  return Object.entries(deckHookState(store)).flatMap(([slide, slots]) => Object.entries(slots).map(([slot, s]) => `${slide}/${slot}=${s.goodKey}`)).sort().join("\n");
}

/**
 * Hand a print's measurement to the queue; when a figure was redrawn because
 * of it (a flowed figure's height), print once more. Shots use it the same way.
 *
 * @returns the print to keep.
 */
export async function reprintIfRedrawn<T extends { measured: Measured }>(store: DeckStore, printed: T, remeasure: (measured: Measured) => Promise<void>, print: () => Promise<T>): Promise<T> {
  const before = goodKeys(store);
  await remeasure(printed.measured);
  return goodKeys(store) === before ? printed : print();
}

/**
 * Where a deck's PDF goes by default: the deck folder's name, in the folder
 * that holds it (`decks/example/` gives `decks/` and `example`).
 */
export function pdfTarget(deckDir: string): { dir: string; stem: string } {
  return { dir: dirname(deckDir), stem: basename(deckDir) };
}

/**
 * Write bytes to `<stem><ext>`, or the first free `<stem>-<n><ext>`, never
 * replacing a file: each name is claimed by an exclusive create.
 *
 * @param ext - the extension with its dot, e.g. `.pdf` or `.folio.zip`.
 * @returns the path written.
 */
export function writeFreshFile(dir: string, stem: string, bytes: Uint8Array, ext: string): string {
  for (let n = 0; ; n += 1) {
    const path = join(dir, `${n ? `${stem}-${n}` : stem}${ext}`);
    try {
      writeFileSync(path, bytes, { flag: "wx" });
      return path;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
}

/** Write a PDF as `<stem>.pdf` or the first free `<stem>-<n>.pdf`. */
export function writeFreshPdf(dir: string, stem: string, bytes: Uint8Array): string {
  return writeFreshFile(dir, stem, bytes, ".pdf");
}

export interface PdfExport {
  file: string;
  bytes: Buffer;
  slides: number;
  warnings: number;
  stale: string[];
}

/**
 * Export a deck the way the editor's button does: wait for its figures,
 * print it, and hand back the bytes for the browser to download. Nothing is
 * written into the workspace; `folio pdf` writes its own file directly with
 * `pdfTarget` and `writeFreshPdf`.
 *
 * @param waitForFigures - resolves with the slots still drawing when the wait ended.
 * @param print - prints the deck (`printDeck` with a browser and address bound).
 * @param remeasure - hands the print's measurement to the queue and waits for
 *   the redraws it causes (a figure flowing `below` measured at a new height).
 */
export async function exportDeckPdf(store: DeckStore, waitForFigures: (token: string) => Promise<string[]>, print: (store: DeckStore) => Promise<PrintedDeck>, remeasure?: (measured: Measured) => Promise<void>): Promise<PdfExport> {
  const stale = await waitForFigures(store.token);
  const first = await print(store);
  const printed = remeasure ? await reprintIfRedrawn(store, first, remeasure, () => print(store)) : first;
  const { stem } = pdfTarget(store.dir);
  return { file: `${stem}.pdf`, bytes: printed.pdf, slides: Object.keys(printed.measured).length, warnings: printed.warnings.filter(isActive).length, stale };
}

/**
 * The editor's export button: `POST /<deck>/export-pdf`. Streams the PDF
 * bytes back as an attachment (never written to the workspace), with the
 * filename, warning count and stale figures in headers the button reads.
 *
 * @param exportPdf - `exportDeckPdf` bound to this server's queue and printer.
 */
export function pdfRoutes(router: Router, app: FolioApp, exportPdf: (store: DeckStore) => Promise<PdfExport>): void {
  router.on("POST", "/:deck/export-pdf", async (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    try {
      const { file, bytes, slides, warnings, stale } = await exportPdf(store);
      res.writeHead(200, {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${file.replace(/"/g, "")}"`,
        "cache-control": "no-store",
        "x-folio-file": file,
        "x-folio-slides": String(slides),
        "x-folio-warnings": String(warnings),
        "x-folio-stale": stale.join(","),
      });
      res.end(bytes);
    } catch (error) {
      sendProblem(res, 500, "PDF export failed", (error as Error).message.split("\n")[0]!);
    }
  });
}

/** One headless Chromium, launched on first use and kept for later exports. */
export class PdfBrowser {
  private browser: Promise<Browser> | null = null;

  /** The browser, launched on first call; refuses naming how to install it. */
  get(): Promise<Browser> {
    this.browser ??= loadPlaywright()
      .then(async (p) => {
        await ensureChromium(p);
        return p.chromium.launch();
      })
      .catch((error: Error) => {
        this.browser = null;
        throw new Error(`PDF export needs Playwright's Chromium: pnpm exec playwright install chromium (${error.message.split("\n")[0]})`);
      });
    return this.browser;
  }

  /** Close the browser if it was launched. */
  async close(): Promise<void> {
    const b = await this.browser?.catch(() => null);
    await b?.close();
  }
}

declare global {
  interface Window {
    __FOLIO_READY__?: boolean;
    __FOLIO_ERROR__?: string;
    __FOLIO_MEASURE__?: Record<string, SlideMeasurement>;
    __FOLIO_PENDING__?: () => string[];
  }
}
