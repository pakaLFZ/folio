/**
 * `folio deck export <deck>`: the deck folder, its pack at the pinned version,
 * the hook cache that shows its figures without Python, a manifest of every
 * page and every file's sha256, and a README, in one `.folio.zip`. What goes
 * in and the manifest are decided in `@folio/core` (`deckexport.ts`).
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { parseArgs } from "node:util";
import { EXPORT_SUFFIX, manifestWarnings, type DeckExportManifest } from "@folio/core";
import { deckArchive, FolioApp, findWorkspace, loadConfig, printDeck, reprintIfRedrawn, writeFreshFile, type DeckStore, type LoadedPack } from "@folio/server";
import { archiveDeckCommand, openDeck } from "./deckcmds.js";
import { importDeckCommand } from "./deckimport.js";
import { withFigures } from "./figures.js";
import { configureServices } from "./services.js";

const USAGE = "usage: folio deck archive <deck> | folio deck unarchive <deck> | folio deck export <deck> [--out FILE.folio.zip | --dir DIR] [--with-comments] [--without-cache] [--pdf] | folio deck import <file.folio.zip> [--into WORKSPACE] [--name NAME] [--pack-as NAME]";

/** `folio deck export | import | archive | unarchive` */
export async function deckCommand(args: string[]): Promise<number> {
  if (args[0] === "archive" || args[0] === "unarchive") return archiveDeckCommand(args.slice(1), args[0] === "archive");
  if (args[0] === "export") return exportDeckCommand(args.slice(1));
  if (args[0] === "import") return importDeckCommand(args.slice(1));
  throw new Error(USAGE);
}

/** Print the deck the way `folio pdf` does, after its hook figures are drawn. */
async function printedPdf(deck: string): Promise<Buffer> {
  return withFigures(deck, 120_000, async ({ headless, store, remeasure }) => {
    const print = () => printDeck(headless.app, store, headless.browser, headless.base);
    return (await reprintIfRedrawn(store, await print(), remeasure, print)).pdf;
  });
}

/** The deck, its pack and the stored warnings, read after any printing. */
async function readDeck(deck: string): Promise<{ store: DeckStore; pack: LoadedPack; warnings: DeckExportManifest["warnings"] }> {
  const target = openDeck(deck).store;
  const app = new FolioApp(loadConfig(findWorkspace(target.dir)));
  try {
    configureServices(app);
    const store = app.workspace.findDeck(target.dir)!;
    const pack = app.workspace.packOf(store);
    if (!pack) throw new Error(`pack ${store.deck.template} is not installed in ${app.config.templatesDir}; an export carries the pack, so it must load`);
    return { store, pack, warnings: manifestWarnings(app.warnings.deckWarnings(store)) };
  } finally {
    await app.close();
  }
}

/** Write the zip: `--out` exactly (refused when it exists), else a free numbered name in `--dir`. */
function writeZip(bytes: Uint8Array, folder: string, out: string | undefined, dir: string | undefined): string {
  if (!out) return writeFreshFile(resolve(dir ?? "."), folder, bytes, EXPORT_SUFFIX);
  const path = resolve(out);
  if (existsSync(path)) throw new Error(`${path} already exists; an export never replaces a file (leave out --out for a numbered name)`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, bytes, { flag: "wx" });
  return path;
}

/** `folio deck export <deck> [--out FILE | --dir DIR] [--with-comments] [--without-cache] [--pdf]` */
export async function exportDeckCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { out: { type: "string" }, dir: { type: "string" }, "with-comments": { type: "boolean" }, "without-cache": { type: "boolean" }, pdf: { type: "boolean" } } });
  if (!positionals[0] || (values.out && values.dir)) throw new Error(USAGE);
  const options = { comments: Boolean(values["with-comments"]), cache: !values["without-cache"] };
  const pdf = values.pdf ? await printedPdf(positionals[0]) : null;
  const { store, pack, warnings } = await readDeck(positionals[0]);
  const { bytes, manifest } = deckArchive({ store, pack, options, warnings, pdf });
  const path = writeZip(bytes, manifest.deck.folder, values.out, values.dir);
  const say = [
    `wrote ${path}: ${manifest.slides.length} slides, pack ${manifest.pack.name}@${manifest.pack.version}, ${Object.keys(manifest.files).length} files with their sha256${pdf ? `, ${manifest.options.pdf}` : ""}`,
    `${manifest.warnings.length} warnings at export time${options.comments ? "; comments included" : ""}${options.cache ? "" : "; no hook cache: hooks run again on import"}`,
    ...manifest.notes.map((n) => `note: ${n}`),
    `open it elsewhere: folio deck import ${basename(path)}`,
  ];
  process.stdout.write(`${say.join("\n")}\n`);
  return 0;
}
