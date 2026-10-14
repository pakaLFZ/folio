/**
 * `folio shot <deck>`: one PNG per slide, so an agent can see the pages it
 * made. The print page (the renderer `pdf` and `check` use) is opened once,
 * holding only the slides taken, at the device scale that gives the asked
 * width, and each slide is an element screenshot of it. Slides are taken by
 * id, id range or page (`selection.ts`), only when changed (`--changed`, by
 * the folder's manifest) or only when warned (`--warned`). `--sheet` adds
 * contact sheets, `--marks` outlines every slot and its findings. Prints the
 * paths, then the `check` report; exits 0 unless the report flags ask
 * otherwise.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { relative } from "@folio/server";
import { parseArgs } from "node:util";
import { summarize, type FolioSeverity, type FolioWarning } from "@folio/core";
import { openPrintPage, reprintIfRedrawn, type DeckStore, type Measured } from "@folio/server";
import { withFigures, type FigureSession } from "./figures.js";
import { printReport, reportOptions, REPORT_OPTIONS } from "./report.js";
import { selectSlides } from "./selection.js";
import { commentPreamble } from "./services.js";
import { marksOf, marksScript, sheetHtml, type SheetTile } from "./sheet.js";
import { changedSlides, readManifest, shotsFolder, slideKeys, writeManifest } from "./shotfolder.js";

export const SHOT_WIDTH = 960;
export const PER_SHEET = 12;
const SHOT_WAIT_S = 30;
const LISTED_PATHS = 12;
const PRINT_PAGES = 8;
const SLIDES_PER_PAGE = 12;
const PX_PER_PT = 4 / 3;

const OPTIONS = {
  ...REPORT_OPTIONS,
  slides: { type: "string" },
  pages: { type: "string" },
  changed: { type: "boolean" },
  warned: { type: "boolean" },
  notes: { type: "boolean" },
  out: { type: "string" },
  width: { type: "string" },
  sheet: { type: "boolean" },
  "per-sheet": { type: "string" },
  marks: { type: "boolean" },
  drafts: { type: "boolean" },
  wait: { type: "string" },
} as const;

type Counts = Record<FolioSeverity, number>;

interface Shots {
  measured: Measured;
  warnings: FolioWarning[];
  pngs: Map<string, Buffer>;
}

interface Sheet {
  path: string;
  first: string;
  last: string;
}

/**
 * Active findings by severity, as the report's summary line counts them.
 *
 * @returns errors, warnings and notes.
 */
function severityCounts(warnings: FolioWarning[]): Counts {
  const { error, warning, note } = summarize(warnings);
  return { error, warning, note };
}

const countsOf = (warnings: FolioWarning[], id: string) => severityCounts(warnings.filter((w) => w.location.slide === id));

/** How a shot looks: slot marks, and the user's drafts (shown with either). */
interface Look {
  marks: boolean;
  drafts: boolean;
}

/**
 * Lay out some slides on one print page, measure them, and shoot those `keep` accepts.
 *
 * @param ids - the slides to lay out, in deck order.
 * @param keep - whether a slide, by its findings, is shot.
 */
async function shootPage({ headless, store }: FigureSession, ids: string[], width: number, look: Look, keep: (counts: Counts) => boolean, timeoutMs: number): Promise<Shots> {
  const { w, h } = headless.app.workspace.packOf(store)!.pack.canvas;
  const viewport = { width: Math.ceil(w * PX_PER_PT), height: Math.ceil(h * PX_PER_PT) };
  const all = ids.length === store.slideIds().length;
  const { page, measured } = await openPrintPage(headless.browser, headless.base, store.token, all ? undefined : ids, timeoutMs, { viewport, deviceScaleFactor: width / viewport.width }, look.marks || look.drafts);
  try {
    const warnings = ids.flatMap((id) => headless.app.warnings.slideWarnings(store, id, measured[id] ?? null));
    if (look.marks) await page.evaluate(marksScript(marksOf(warnings)));
    const pngs = new Map<string, Buffer>();
    for (const id of ids.filter((id) => keep(countsOf(warnings, id)))) {
      await page.evaluate((top) => window.scrollTo(0, top), await page.locator(`section.folio-print-page[data-slide="${id}"]`).evaluate((e) => (e as HTMLElement).offsetTop));
      pngs.set(id, await page.screenshot());
    }
    return { measured, warnings, pngs };
  } finally {
    await page.close();
  }
}

/**
 * Shoot the slides on up to `PRINT_PAGES` print pages at once, each holding
 * a run of at least `SLIDES_PER_PAGE` slides, so a long deck is shot in
 * parallel while a short one costs one page.
 *
 * @param ids - the slides to lay out, in deck order; nothing is opened when empty.
 * @returns the measurements, warnings and pictures of every page, in deck order.
 */
async function shootSlides(session: FigureSession, ids: string[], width: number, look: Look, keep: (counts: Counts) => boolean, timeoutMs: number): Promise<Shots> {
  const pages = Math.min(PRINT_PAGES, Math.ceil(ids.length / SLIDES_PER_PAGE));
  const size = Math.ceil(ids.length / Math.max(1, pages));
  const runs = Array.from({ length: pages }, (_, i) => ids.slice(i * size, (i + 1) * size)).filter((run) => run.length);
  const shots = await Promise.all(runs.map((run) => shootPage(session, run, width, look, keep, timeoutMs)));
  return {
    measured: Object.assign({}, ...shots.map((s) => s.measured)),
    warnings: shots.flatMap((s) => s.warnings),
    pngs: new Map(shots.flatMap((s) => [...s.pngs])),
  };
}

/**
 * Draw one contact sheet in the same browser and write it.
 *
 * @returns its path and the first and last slide on it.
 */
async function writeSheet(session: FigureSession, tiles: SheetTile[], path: string): Promise<Sheet> {
  const page = await session.headless.browser.newPage({ deviceScaleFactor: 1 });
  try {
    await page.setContent(sheetHtml(tiles), { waitUntil: "load" });
    await page.locator(".sheet").screenshot({ path });
    return { path, first: tiles[0]!.slide, last: tiles.at(-1)!.slide };
  } finally {
    await page.close();
  }
}

/**
 * Draw the contact sheets at once, `perSheet` slides each, as `sheet-1.png`,
 * `sheet-2.png`, ...
 *
 * @returns each sheet's path and the first and last slide on it.
 */
function writeSheets(session: FigureSession, tiles: SheetTile[], dir: string, perSheet: number): Promise<Sheet[]> {
  const chunks = Array.from({ length: Math.ceil(tiles.length / perSheet) }, (_, i) => tiles.slice(i * perSheet, (i + 1) * perSheet));
  return Promise.all(chunks.map((chunk, i) => writeSheet(session, chunk, join(dir, `sheet-${i + 1}.png`))));
}

/**
 * The layout a slide uses, for the sheet's labels.
 *
 * @returns the layout name, or "unreadable".
 */
function layoutOf(store: DeckStore, id: string): string {
  const spec = store.readSlide(id)?.spec;
  return (spec && spec.elements[spec.root]?.type) || "unreadable";
}

/**
 * The lines naming what was written: every picture when there are few, else
 * the folder and the first and last; each sheet with the slides it covers;
 * the slides `--changed` left alone.
 *
 * @returns the text.
 */
function listing(dir: string, paths: string[], sheets: Sheet[], kept: number): string {
  const shown = (p: string) => relative(process.cwd(), p) || ".";
  const names = paths.map((p) => p.slice(p.lastIndexOf("/") + 1));
  const pictures = paths.length <= LISTED_PATHS ? paths.map(shown) : [`${shown(dir)}/: ${paths.length} pictures, ${names[0]} to ${names.at(-1)}`];
  const keptLine = kept ? [`${kept} unchanged slide${kept === 1 ? "" : "s"} kept from the last shot`] : [];
  return [...pictures, ...sheets.map((s) => `${shown(s.path)}  ${s.first === s.last ? s.first : `${s.first}-${s.last}`}`), ...keptLine].map((l) => `${l}\n`).join("");
}

/**
 * Parse the flags.
 *
 * @returns the parsed values and the checked numbers.
 */
function readFlags(args: string[]) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: OPTIONS });
  const width = Number(values.width ?? SHOT_WIDTH);
  if (!(width >= 16 && width <= 8000)) throw new Error(`--width must be a number of pixels between 16 and 8000, not ${values.width}`);
  const perSheet = Number(values["per-sheet"] ?? PER_SHEET);
  if (!(Number.isInteger(perSheet) && perSheet >= 1)) throw new Error(`--per-sheet must be a whole number of slides, not ${values["per-sheet"]}`);
  return { values, deck: positionals[0] ?? ".", width, perSheet, waitMs: Number(values.wait ?? SHOT_WAIT_S) * 1000 };
}

/**
 * Run the command.
 *
 * @param args - `<deck> [--slides IDS] [--pages N-M] [--changed] [--warned [--notes]] [--out DIR] [--width PX] [--sheet] [--per-sheet N] [--marks] [--drafts] [--wait S]` and the report flags; drafts the user drew show only with `--drafts` or `--marks`.
 * @returns the report's exit code.
 */
export async function shotCommand(args: string[]): Promise<number> {
  const started = performance.now();
  const { values, deck, width, perSheet, waitMs } = readFlags(args);
  return withFigures(deck, waitMs, async (session) => {
    const { store, headless } = session;
    const deckIds = store.slideIds();
    const chosen = selectSlides(deckIds, values.slides, values.pages);
    const dir = shotsFolder(store, values.out);
    const settings = `${width}px ${values.marks ? "marks" : "plain"}${values.drafts ? " drafts" : ""} ${store.deck.template}`;
    const manifest = readManifest(dir);
    const ids = values.changed ? changedSlides(dir, manifest, settings, slideKeys(store, chosen)) : chosen;
    const keep = values.warned ? (c: Counts) => c.error + c.warning + (values.notes ? c.note : 0) > 0 : () => true;
    const shoot = () => shootSlides(session, ids, width, { marks: !!values.marks, drafts: !!values.drafts }, keep, Math.max(waitMs, 60_000));
    const { warnings, pngs } = await reprintIfRedrawn(store, await shoot(), session.remeasure, shoot);
    const tiles: SheetTile[] = [...pngs].map(([id, png]) => ({ slide: id, layout: layoutOf(store, id), counts: countsOf(warnings, id), png }));
    const paths = tiles.map((t) => join(dir, `${t.slide}.png`));
    tiles.forEach((t, i) => writeFileSync(paths[i]!, t.png));
    writeManifest(dir, manifest, settings, slideKeys(store, [...pngs.keys()]), deckIds);
    const sheets = values.sheet && tiles.length ? await writeSheets(session, tiles, dir, perSheet) : [];
    const report = reportOptions(values);
    const kept = chosen.length - ids.length;
    const text = listing(dir, paths, sheets, kept);
    if (report.format === "human") process.stdout.write(text);
    else if (report.format !== "json") process.stderr.write(text);
    const stale = session.pending.length ? `figures still drawing when shot (last good figures used): ${session.pending.join(", ")}\n` : "";
    const json = { shots: tiles.map((t, i) => ({ slide: t.slide, layout: t.layout, path: paths[i], counts: t.counts })), sheets, kept, stale: session.pending };
    const code = printReport(warnings, new Map([[store.token, store]]), headless.app.config.root, report, `${commentPreamble(headless.app, store)}${stale}`, json);
    if (report.format === "human") process.stdout.write(`shot ${tiles.length} of ${deckIds.length} slides at ${width} px in ${((performance.now() - started) / 1000).toFixed(1)} s\n`);
    return code;
  });
}
