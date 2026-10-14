/**
 * `folio deck import <file.folio.zip>`: check every file against the
 * manifest's sha256, then put the deck under the workspace's `decks/` and its
 * pack under `templates/` (or reuse an identical installed one). Nothing is
 * written until every check has passed; an installed pack is never replaced.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { unzipSync } from "fflate";
import { DECK_EXPORT_FORMAT, EXPORT_FOLIO_TOML, MANIFEST_FILE, packDifferences, packFileKept, parsePackRef, verifyExport, type DeckExportManifest } from "@folio/core";
import { findWorkspace, listFiles, loadConfig, readJson, sha256, Workspace } from "@folio/server";

const USAGE = "usage: folio deck import <file.folio.zip> [--into WORKSPACE] [--name NAME] [--pack-as NAME]";

/**
 * Read a zip and check it against its manifest.
 *
 * @returns the manifest and every entry but the manifest; throws naming each problem.
 */
function readExport(file: string): { manifest: DeckExportManifest; entries: Record<string, Uint8Array> } {
  if (!existsSync(file)) throw new Error(`no file ${file}`);
  const entries = Object.fromEntries(Object.entries(unzipSync(readFileSync(file))).filter(([p]) => !p.endsWith("/")));
  const raw = entries[MANIFEST_FILE];
  if (!raw) throw new Error(`${file} has no ${MANIFEST_FILE}: it is not a folio deck export (folio deck export makes one)`);
  const manifest = JSON.parse(Buffer.from(raw).toString("utf8")) as DeckExportManifest;
  if (manifest.format !== DECK_EXPORT_FORMAT) throw new Error(`${file} is export format ${manifest.format}; this folio reads format ${DECK_EXPORT_FORMAT}`);
  delete entries[MANIFEST_FILE];
  const problems = verifyExport(manifest, Object.fromEntries(Object.entries(entries).map(([p, b]) => [p, sha256(b)])));
  if (problems.length) throw new Error(`${file} does not match its manifest, nothing imported:\n  ${problems.join("\n  ")}`);
  return { manifest, entries };
}

/** The entries under a zip folder, keyed by their path inside it. */
function under(entries: Record<string, Uint8Array>, folder: string): Record<string, Uint8Array> {
  const prefix = `${folder}/`;
  return Object.fromEntries(Object.entries(entries).filter(([p]) => p.startsWith(prefix)).map(([p, b]) => [p.slice(prefix.length), b]));
}

/** The exported pack's files, with `pack.json` renamed when installing under another name. */
function packFiles(manifest: DeckExportManifest, entries: Record<string, Uint8Array>, name: string): Record<string, Uint8Array> {
  const files = under(entries, manifest.pack.folder);
  if (name === manifest.pack.name) return files;
  const pack = JSON.parse(Buffer.from(files["pack.json"]!).toString("utf8")) as { name: string };
  return { ...files, "pack.json": Buffer.from(`${JSON.stringify({ ...pack, name }, null, 2)}\n`) };
}

/** Why an installed pack cannot stand in for the exported one, or null when it is identical. */
function packRefusal(ws: Workspace, dir: string, name: string, version: number, files: Record<string, Uint8Array>): string | null {
  const installed = readJson<{ version?: number } | null>(join(dir, "pack.json"), null);
  if (installed?.version !== version) {
    const users = [...ws.decks.values()].filter((d) => parsePackRef(d.deck.template).name === name).map((d) => d.dir);
    return `templates/${name} holds ${name}@${installed?.version ?? "?"} (used by ${users.join(", ") || "no deck"}), the deck needs ${name}@${version}`;
  }
  const have = Object.fromEntries(listFiles(dir, packFileKept).map((f) => [f, sha256(readFileSync(join(dir, f)))]));
  const differ = packDifferences(Object.fromEntries(Object.entries(files).map(([p, b]) => [p, sha256(b)])), have);
  return differ.length ? `templates/${name} is ${name}@${version} with other files:\n  ${differ.join("\n  ")}` : null;
}

/** Write files into a fresh folder beside the target, then move it into place. */
function writeFolder(target: string, files: Record<string, Uint8Array>): void {
  const staging = join(dirname(target), `.import-${randomBytes(4).toString("hex")}`);
  for (const [path, bytes] of Object.entries(files)) {
    mkdirSync(dirname(join(staging, path)), { recursive: true });
    writeFileSync(join(staging, path), bytes);
  }
  renameSync(staging, target);
}

/** The deck.json as imported: re-pinned for `--pack-as`, a fresh id when the workspace already has the exported one. */
function importedDeckJson(ws: Workspace, raw: Uint8Array, template: string): { bytes: Uint8Array; newId: string | null } {
  const deck = JSON.parse(Buffer.from(raw).toString("utf8")) as { id: string; template: string };
  const taken = [...ws.decks.values()].some((d) => d.deck.id === deck.id);
  const newId = taken ? randomBytes(8).toString("hex") : null;
  if (!newId && deck.template === template) return { bytes: raw, newId };
  return { bytes: Buffer.from(`${JSON.stringify({ ...deck, template, ...(newId ? { id: newId } : {}) }, null, 2)}\n`), newId };
}

/** The workspace to import into; a folder without folio.toml gets the minimal one. */
function targetWorkspace(into: string | undefined): Workspace {
  const root = into ? resolve(into) : findWorkspace(".");
  if (!existsSync(join(root, "folio.toml"))) {
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "folio.toml"), EXPORT_FOLIO_TOML);
    process.stdout.write(`wrote ${join(root, "folio.toml")}: ${root} is now a folio workspace\n`);
  }
  return new Workspace(loadConfig(root));
}

/** `folio deck import <file.folio.zip> [--into WORKSPACE] [--name NAME] [--pack-as NAME]` */
export async function importDeckCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { into: { type: "string" }, name: { type: "string" }, "pack-as": { type: "string" } } });
  if (!positionals[0]) throw new Error(USAGE);
  const { manifest, entries } = readExport(resolve(positionals[0]));
  const ws = targetWorkspace(values.into);
  const name = values.name ?? manifest.deck.folder;
  const deckDir = join(ws.config.decksDir, name);
  if (existsSync(deckDir)) throw new Error(`${deckDir} already exists; choose another folder with --name NAME`);
  const packName = values["pack-as"] ?? manifest.pack.name;
  const packDir = join(ws.config.templatesDir, packName);
  const pack = packFiles(manifest, entries, packName);
  const refusal = existsSync(packDir) ? packRefusal(ws, packDir, packName, manifest.pack.version, pack) : null;
  if (refusal) throw new Error(`${refusal}\nnothing imported; an installed pack is never replaced: --pack-as NAME installs the exported one under another name`);
  const deckFiles = under(entries, `decks/${manifest.deck.folder}`);
  const deckJson = importedDeckJson(ws, deckFiles["deck.json"]!, `${packName}@${manifest.pack.version}`);
  const installs = !existsSync(packDir);
  mkdirSync(ws.config.decksDir, { recursive: true });
  mkdirSync(ws.config.templatesDir, { recursive: true });
  if (installs) writeFolder(packDir, pack);
  writeFolder(deckDir, { ...deckFiles, "deck.json": deckJson.bytes });
  const lines = [
    `imported ${manifest.deck.title} (${manifest.slides.length} slides) into ${deckDir}; every file matched its sha256`,
    installs ? `installed ${packName}@${manifest.pack.version} at ${packDir}` : `reused ${packDir}: the same ${packName}@${manifest.pack.version}, file for file`,
    ...(deckJson.newId ? [`the workspace already has a deck with id ${manifest.deck.id}: this one now has id ${deckJson.newId}`] : []),
    `check it: folio check ${deckDir}`,
  ];
  process.stdout.write(`${lines.join("\n")}\n`);
  return 0;
}
