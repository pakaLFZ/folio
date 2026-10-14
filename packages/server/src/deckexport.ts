/**
 * The `.folio.zip` deck archive: the deck folder, its pack at the pinned
 * version, the hook cache that shows its figures without Python, a manifest of
 * every page and every file's sha256, and a README. What goes in and the
 * manifest are decided in `@folio/core` (`deckexport.ts`); `folio deck export`
 * writes the archive to a file and `POST /<deck>/export-folio` streams it to
 * the editor's Download menu.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";
import { relative } from "./posixpath.js";
import { zipSync } from "fflate";
import {
  DECK_EXPORT_FORMAT, deckFileKept, EXPORT_FOLIO_TOML, EXPORT_SUFFIX, exportReadme, hookKeysOf, manifestWarnings, MANIFEST_FILE, packFileKept, pathCandidates, README_FILE,
  slideDetail, undrawnSlots, type DeckExportManifest, type DeckExportOptions, type SlideDetail,
} from "@folio/core";
import type { FolioApp } from "./app.js";
import type { DeckStore } from "./deckstore.js";
import { readJson } from "./fsutil.js";
import { sendProblem, type Router } from "./httpkit.js";
import { deckOr404 } from "./routes-deck.js";
import type { LoadedPack } from "./workspace.js";

const SKIPPED_DIRS = new Set([".shots", ".git", "__pycache__", "node_modules"]);
const FILE_EXTS = /\.(png|jpe?g|svg|gif|webp|pdf|json|csv|txt|py)$/i;

export const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

/**
 * Every file under a folder, `/`-separated and relative to it, sorted.
 *
 * @param keep - decides on each relative file path.
 */
export function listFiles(dir: string, keep: (path: string) => boolean): string[] {
  const out: string[] = [];
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const full = join(d, name);
      const rel = relative(dir, full).split("\\").join("/");
      if (statSync(full).isDirectory()) {
        if (!SKIPPED_DIRS.has(name)) walk(full);
      } else if (keep(rel)) out.push(rel);
    }
  };
  walk(dir);
  return out.sort();
}

/** The hook cache keys a deck's slot states name. */
function deckHookStates(store: DeckStore): Record<string, Record<string, { key?: string; goodKey?: string; phase?: string }>> {
  const dir = join(store.stateDir, "hooks", "slots");
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), readJson(join(dir, f), {})]));
}

/** The page details of every slide, with notes on files the slides refer to that cannot be carried. */
function slideDetails(store: DeckStore, pack: LoadedPack): { slides: SlideDetail[]; notes: string[] } {
  const notes: string[] = [];
  const slides = store.slideIds().map((id, i) => {
    const record = store.readSlide(id);
    const files: string[] = [];
    const props = record?.spec?.elements[record.spec.root]?.props ?? {};
    for (const ref of pathCandidates(props)) {
      const full = isAbsolute(ref) ? ref : resolve(store.dir, ref);
      const inside = !relative(store.dir, full).startsWith("..") && !isAbsolute(relative(store.dir, full));
      if (inside && existsSync(full)) files.push(relative(store.dir, full));
      else if (existsSync(full)) notes.push(`${id} refers to ${ref}, outside the deck folder: not carried`);
      else if (FILE_EXTS.test(ref) && ref.includes("/")) notes.push(`${id} refers to ${ref}, which does not exist`);
    }
    return slideDetail(pack.pack, i + 1, id, record?.spec ?? null, record?.error ?? null, files);
  });
  return { slides, notes };
}

/** The deck's and the pack's files under their zip paths. */
function collectFiles(store: DeckStore, pack: LoadedPack, options: DeckExportOptions, notes: string[]): Record<string, Uint8Array> {
  const states = deckHookStates(store);
  const keys = hookKeysOf(Object.values(states));
  if (options.cache) for (const u of undrawnSlots(states)) notes.push(`${u.slide}/${u.slot} has no drawn output (${u.phase}): it is drawn again on import, which needs the hook's runtime; folio pdf draws it first`);
  const folder = basename(store.dir);
  const entries: Record<string, Uint8Array> = {};
  for (const f of listFiles(store.dir, (p) => deckFileKept(p, keys, options))) entries[`decks/${folder}/${f}`] = readFileSync(join(store.dir, f));
  for (const f of listFiles(pack.dir, packFileKept)) entries[`templates/${pack.pack.name}/${f}`] = readFileSync(join(pack.dir, f));
  return entries;
}

/** The folio version, from this package. */
function folioVersion(): string {
  return (JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version: string }).version;
}

export interface DeckArchiveInput {
  store: DeckStore;
  pack: LoadedPack;
  options: DeckExportOptions;
  warnings: DeckExportManifest["warnings"];
  pdf: Buffer | null;
}

export interface DeckArchive {
  bytes: Uint8Array;
  manifest: DeckExportManifest;
  /** `<deck-folder>.folio.zip` */
  file: string;
}

/** The zip: the files, the README, folio.toml, the PDF and last the manifest over them all. */
export function deckArchive(input: DeckArchiveInput): DeckArchive {
  const { store, pack, options } = input;
  const folder = basename(store.dir);
  const { slides, notes } = slideDetails(store, pack);
  const entries = collectFiles(store, pack, options, notes);
  const pdfName = input.pdf ? `${folder}.pdf` : null;
  const head: Omit<DeckExportManifest, "files"> = {
    format: DECK_EXPORT_FORMAT, folio: folioVersion(), exportedAt: new Date().toISOString(),
    deck: { id: store.deck.id, title: store.deck.title, folder, template: store.deck.template },
    pack: { name: pack.pack.name, version: pack.pack.version, folder: `templates/${pack.pack.name}` },
    options: { ...options, pdf: pdfName }, slides, warnings: input.warnings, notes,
  };
  entries[README_FILE] = Buffer.from(exportReadme(head));
  entries["folio.toml"] = Buffer.from(EXPORT_FOLIO_TOML);
  if (input.pdf && pdfName) entries[pdfName] = input.pdf;
  const files = Object.fromEntries(Object.entries(entries).map(([p, b]) => [p, sha256(b)]).sort(([a], [b]) => a!.localeCompare(b!)));
  const manifest = { ...head, files };
  entries[MANIFEST_FILE] = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  return { bytes: zipSync(entries), manifest, file: `${folder}${EXPORT_SUFFIX}` };
}

/** A deck's archive as `folio deck export <deck>` writes it by default: hook cache in, comments and PDF out. */
export function defaultDeckArchive(app: FolioApp, store: DeckStore): DeckArchive {
  const pack = app.workspace.packOf(store);
  if (!pack) throw new Error(`pack ${store.deck.template} is not installed in ${app.config.templatesDir}; an export carries the pack, so it must load`);
  const warnings = manifestWarnings(app.warnings.deckWarnings(store));
  return deckArchive({ store, pack, options: { comments: false, cache: true }, warnings, pdf: null });
}

/**
 * The Download menu's folio deck item: `POST /<deck>/export-folio` streams
 * the archive as an attachment; nothing is written to the workspace.
 */
export function deckExportRoutes(router: Router, app: FolioApp): void {
  router.on("POST", "/:deck/export-folio", (_req, res, p) => {
    const store = deckOr404(app, res, p.deck!);
    if (!store) return;
    try {
      const { bytes, manifest, file } = defaultDeckArchive(app, store);
      res.writeHead(200, {
        "content-type": "application/zip",
        "content-disposition": `attachment; filename="${file.replace(/"/g, "")}"`,
        "cache-control": "no-store",
        "x-folio-file": file,
        "x-folio-slides": String(manifest.slides.length),
      });
      res.end(bytes);
    } catch (error) {
      sendProblem(res, 500, "Folio deck export failed", (error as Error).message.split("\n")[0]!);
    }
  });
}
