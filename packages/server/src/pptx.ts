/** Deck PowerPoint export: gather rendered fallbacks and stream OOXML bytes. */
import { basename } from "node:path";
import { resolveAliases, slideLayout, slideRoot, type Pack } from "@folio/core";
import { writeDeckPptx, type DeckSlide, type RenderedSlot, type RenderedSlots } from "./pptx/deck.js";
import type { FolioApp } from "./app.js";
import type { DeckStore } from "./deckstore.js";
import { deckOr404 } from "./routes-deck.js";
import { sendProblem, type Router } from "./httpkit.js";
import { openPrintPage } from "./pdf.js";

export interface PptxExport { bytes: Uint8Array; file: string; slides: number; approximations: string[]; drafts: string[] }

type Locator = import("playwright").Locator;
type SlotProps = Pack["layouts"][string]["slots"][string];

/** The slot's rendered rect, in points, relative to the slide. */
async function slotBox(target: Locator) {
  return target.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const slide = el.closest(".folio-slide")!.getBoundingClientRect();
    return [(rect.left - slide.left) * 0.75, (rect.top - slide.top) * 0.75, rect.width * 0.75, rect.height * 0.75] as [number, number, number, number];
  });
}

const NAMED_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decode the handful of HTML entities a hook's rendered text can carry. */
function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] !== "#") return NAMED_ENTITIES[entity.toLowerCase()] ?? match;
    const code = entity[1]!.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isNaN(code) ? match : String.fromCodePoint(code);
  });
}

/**
 * Restore bold, sub- and superscript markup from a hook's rendered HTML.
 *
 * Runs in Node, never in the page: a Playwright `evaluate` callback is
 * serialized to source text and re-run in the browser, where tsx's injected
 * `__name` helper (used to preserve a transpiled function's `.name`) does not
 * exist, so any evaluate callback with an inner named helper throws
 * `ReferenceError: __name is not defined`.
 */
export function htmlToMarkup(html: string): string {
  let i = 0;
  const parse = (): string => {
    let out = "";
    while (i < html.length) {
      const lt = html.indexOf("<", i);
      if (lt === -1) { out += decodeEntities(html.slice(i)); i = html.length; break; }
      if (lt > i) out += decodeEntities(html.slice(i, lt));
      if (html.startsWith("</", lt)) { i = lt; break; }
      const open = /^<([a-z0-9]+)[^>]*\/?>/i.exec(html.slice(lt));
      if (!open) { out += "<"; i = lt + 1; continue; }
      i = lt + open[0].length;
      const tag = open[1]!.toLowerCase();
      if (tag === "br") { out += "\n"; continue; }
      let inner = parse();
      if (html.startsWith(`</${tag}`, i)) i = html.indexOf(">", i) + 1;
      const attrs = [...open[0].matchAll(/data-run-(size|color|font|highlight)="([^"]*)"/g)].map((m) => `${m[1]}=${decodeEntities(m[2]!)}`);
      if (attrs.length) {
        let nested = /^\[\[([^|\]]+)\|([\s\S]*)\]\]$/.exec(inner);
        while (nested) {
          attrs.push(nested[1]!);
          inner = nested[2]!;
          nested = /^\[\[([^|\]]+)\|([\s\S]*)\]\]$/.exec(inner);
        }
      }
      out += attrs.length ? `[[${attrs.join(";")}|${inner}]]` : tag === "strong" || tag === "b" ? `**${inner}**` : tag === "sub" ? `_{${inner}}` : tag === "sup" ? `^{${inner}}` : tag === "i" || tag === "em" ? `[[italic|${inner}]]` : tag === "u" ? `[[underline|${inner}]]` : tag === "s" ? `[[strike|${inner}]]` : inner;
    }
    return out;
  };
  return parse();
}

/** A hook's rendered text, with bold, sub- and superscript markup restored. */
async function hookText(target: Locator): Promise<string> {
  return htmlToMarkup(await target.locator(".folio-text").first().innerHTML());
}

/** A table slot's rendered cells, falling back to the declared columns when the DOM has none. */
async function tableData(target: Locator, value: unknown): Promise<RenderedSlot["table"]> {
  const table = target.locator("table");
  if (!await table.count()) return undefined;
  const data = await table.evaluate((el) => ({
    columns: [...el.querySelectorAll("thead th")].map((cell) => cell.textContent ?? ""),
    rows: [...el.querySelectorAll("tbody tr")].map((row) => [...row.querySelectorAll("td")].map((cell) => cell.textContent ?? "")),
  }));
  const source = value && typeof value === "object" && "columns" in value ? value.columns : null;
  const columns = data.columns.length ? data.columns : Array.isArray(source) ? source.filter((s): s is string => typeof s === "string") : [];
  return columns.length ? { columns, rows: data.rows } : undefined;
}

/** Fill in content that needs browser rendering for one slot, in place. */
async function fillSlot(slot: RenderedSlot, target: Locator, spec: SlotProps, value: unknown, key: string): Promise<void> {
  if (spec.role === "block") {
    slot.png = await target.screenshot({ animations: "disabled", scale: "device" });
    if (await target.locator(".folio-text").count()) slot.text = await hookText(target);
  } else if (spec.hook && typeof value === "string" && spec.role !== "figure" && spec.role !== "table") {
    slot.text = await hookText(target);
  } else if (spec.role === "table") {
    slot.table = await tableData(target, value);
    slot.png = await target.screenshot({ animations: "disabled" });
  } else if (spec.role === "figure") {
    if (!await target.locator("img").count()) throw new Error(`${key} has no rendered figure to export`);
    slot.png = await target.screenshot({ animations: "disabled" });
  }
}

/** Capture only slot content that needs browser rendering; these images never enter the workspace. */
export async function renderedSlots(page: import("playwright").Page, pack: Pack, slides: DeckSlide[]): Promise<RenderedSlots> {
  const rendered: RenderedSlots = {};
  for (const slide of slides) {
    const root = slideRoot(slide.spec);
    const layout = root && slideLayout(pack, root.layout, root.props);
    if (!root || !layout) continue;
    const props = resolveAliases(root.props, layout.aliases);
    for (const [name, slot] of Object.entries(layout.slots)) {
      const value = props[name];
      if (value === null || value === undefined || value === "" || slot.draft) continue;
      const target = page.locator(`section[data-slide="${slide.id}"] [data-slot="${name}"]`);
      if (!await target.count()) continue;
      const key = `${slide.id}/${name}`;
      const entry: RenderedSlot = { box: await slotBox(target) };
      await fillSlot(entry, target, slot, value, key);
      rendered[key] = entry;
    }
  }
  return rendered;
}

/** Build PowerPoint bytes from the deck and its loaded pack, optionally selecting slide ids. */
export async function exportDeckPptx(app: FolioApp, store: DeckStore, browser: { get(): Promise<import("playwright").Browser> }, base: string, ids?: string[]): Promise<PptxExport> {
  const loaded = app.workspace.packOf(store);
  if (!loaded) throw new Error(`pack ${store.deck.template} is not installed`);
  const ordered = store.slideIds();
  if (ids?.some((id) => !ordered.includes(id))) throw new Error(`unknown slide ${ids.find((id) => !ordered.includes(id))}`);
  const selected = ids?.length ? ordered.filter((id) => ids.includes(id)) : ordered;
  const slides = selected.map((id) => {
    const record = store.readSlide(id);
    if (!record?.spec) throw new Error(`slide ${id} cannot be read: ${record?.error ?? "missing"}`);
    return { id, spec: record.spec };
  });
  const { page } = await openPrintPage(await browser.get(), base, store.token, selected, 60_000, { deviceScaleFactor: 3 });
  try {
    const rendered = await renderedSlots(page, loaded.pack, slides);
    const result = writeDeckPptx(loaded.pack, loaded.dir, store.dir, slides, rendered);
    return { bytes: result.bytes, file: `${basename(store.dir)}.pptx`, slides: slides.length, approximations: result.approximations.map((a) => `${a.slide}/${a.slot}: ${a.reason}`), drafts: result.drafts.map((d) => `${d.slide}/${d.slot}`) };
  } finally { await page.close(); }
}

/** POST route used by the editor Download popover. */
export function pptxRoutes(router: Router, app: FolioApp, exportPptx: (store: DeckStore) => Promise<PptxExport>): void {
  router.on("POST", "/:deck/export-pptx", async (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    try {
      const output = await exportPptx(store);
      res.writeHead(200, {
        "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "content-disposition": `attachment; filename="${output.file.replace(/"/g, "")}"`,
        "cache-control": "no-store",
        "x-folio-file": output.file,
        "x-folio-slides": String(output.slides),
        "x-folio-approximations": String(output.approximations.length),
        "x-folio-drafts": String(output.drafts.length),
      });
      res.end(output.bytes);
    } catch (error) { sendProblem(res, 500, "PowerPoint export failed", (error as Error).message.split("\n")[0]!); }
  });
}
