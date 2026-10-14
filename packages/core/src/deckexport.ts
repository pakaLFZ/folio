/**
 * A deck exported as one file: which files go in, the manifest that describes
 * every page and every file's sha256, the README, and the checks an import
 * makes. Values in and out; the zip itself is written by the CLI.
 *
 * Zip layout: `manifest.json`, `README.md`, `folio.toml`,
 * `decks/<folder>/...`, `templates/<pack>/...`, and `<folder>.pdf` when asked.
 */
import { plainText } from "./markup.js";
import { slideLayout } from "./overrides.js";
import type { Pack } from "./pack.js";
import { slideRoot, type SlideSpec } from "./schema.js";
import type { FolioWarning } from "./warnings.js";

export const DECK_EXPORT_FORMAT = 1;
export const MANIFEST_FILE = "manifest.json";
export const README_FILE = "README.md";
export const EXPORT_SUFFIX = ".folio.zip";
export const EXPORT_FOLIO_TOML = '[workspace]\ndecks = "decks"\ntemplates = "templates"\n';

export interface DeckExportOptions {
  comments: boolean;
  cache: boolean;
}

const DECK_STATE_KEPT = /^\.folio\/(warnings|acks|tables|hooks\/slots)\/[^/]+\.json$/;
const HOOK_OUTPUT = /^\.folio\/hooks\/([0-9a-f]+)\.(png|svg|pdf|out\.json|json)$/;
const JUNK_NAME = /(^|\/)(__pycache__)(\/|$)|\.pyc$|~$|\.swp$/;

/**
 * Whether a file of a deck folder goes into the export.
 *
 * @param path - the file, relative to the deck folder, `/`-separated.
 * @param keys - the hook cache keys the slot states name.
 */
export function deckFileKept(path: string, keys: ReadonlySet<string>, options: DeckExportOptions): boolean {
  if (path.startsWith(".folio/")) return options.cache && (DECK_STATE_KEPT.test(path) || keys.has(HOOK_OUTPUT.exec(path)?.[1] ?? ""));
  if (JUNK_NAME.test(path) || path.endsWith(EXPORT_SUFFIX)) return false;
  if (path.startsWith("comments/")) return options.comments;
  return !path.split("/").some((part) => part.startsWith("."));
}

/** Whether a file of a pack folder is part of the pack: the rule export and the identity comparison share. */
export function packFileKept(path: string): boolean {
  return !JUNK_NAME.test(path) && !path.split("/").some((part) => part.startsWith(".") || part === ".archive");
}

/**
 * The cache keys a deck's slot states name, current and last good.
 *
 * @param states - the parsed `.folio/hooks/slots/<slide>.json` files.
 */
export function hookKeysOf(states: Record<string, { key?: string | null; goodKey?: string | null }>[]): Set<string> {
  const keys = new Set<string>();
  for (const slide of states) for (const s of Object.values(slide)) for (const k of [s.key, s.goodKey]) if (k) keys.add(k);
  return keys;
}

/** Hooked slots whose state is not drawn from the cache: `{slide, slot, phase}`. */
export function undrawnSlots(states: Record<string, Record<string, { phase?: string }>>): { slide: string; slot: string; phase: string }[] {
  return Object.entries(states).flatMap(([slide, slots]) => Object.entries(slots).filter(([, s]) => s.phase !== "ok").map(([slot, s]) => ({ slide, slot, phase: s.phase ?? "unknown" })));
}

const PATH_LIKE = /^(?!https?:|data:)[^\s<>"|?*]+\.[A-Za-z][A-Za-z0-9]{0,7}$/;

/**
 * Strings of a slide's props that look like file paths: figure and table
 * sources, wherever in the props they sit.
 */
export function pathCandidates(props: unknown): string[] {
  const out = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.length < 400 && PATH_LIKE.test(value)) out.add(value);
    } else if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === "object") Object.values(value).forEach(walk);
  };
  walk(props);
  return [...out].sort();
}

export interface SlideDetail {
  number: number;
  id: string;
  layout: string | null;
  title: string;
  slots: string[];
  filled: string[];
  files: string[];
  error: string | null;
}

const NOT_SLOTS = new Set(["overrides", "background"]);

/**
 * The page details of one slide.
 *
 * @param files - the deck files the slide refers to (found by the caller).
 */
export function slideDetail(pack: Pack | null, number: number, id: string, spec: SlideSpec | null, error: string | null, files: string[]): SlideDetail {
  const root = spec ? slideRoot(spec) : null;
  const props = root?.props ?? {};
  const layout = root && pack ? slideLayout(pack, root.layout, props) : undefined;
  const filled = Object.keys(props).filter((k) => !NOT_SLOTS.has(k) && props[k] !== "" && props[k] !== null && props[k] !== undefined);
  const title = typeof props.title === "string" ? plainText(props.title) : "";
  return { number, id, layout: root?.layout ?? null, title, slots: Object.keys(layout?.slots ?? {}), filled, files, error };
}

export interface ManifestWarning {
  code: string;
  severity: string;
  slide: string | null;
  slot: string | null;
  message: string;
}

export interface DeckExportManifest {
  format: number;
  folio: string;
  exportedAt: string;
  deck: { id: string; title: string; folder: string; template: string };
  pack: { name: string; version: number; folder: string };
  options: DeckExportOptions & { pdf: string | null };
  slides: SlideDetail[];
  warnings: ManifestWarning[];
  notes: string[];
  files: Record<string, string>;
}

/** The warnings worth keeping in a manifest: active ones, without the per-run ids. */
export function manifestWarnings(warnings: FolioWarning[]): ManifestWarning[] {
  return warnings
    .filter((w) => w.state !== "absent")
    .map((w) => ({ code: w.code, severity: w.severity, slide: w.location.slide ?? null, slot: w.location.slot ?? null, message: w.message }));
}

/** The README inside the zip: the slides and how to open them. */
export function exportReadme(m: Omit<DeckExportManifest, "files">): string {
  const rows = m.slides.map((s) => `| ${s.number} | ${s.id} | ${s.layout ?? "(unreadable)"} | ${s.title.replaceAll("|", "\\|")} |`);
  return [
    `# ${m.deck.title}`,
    "",
    `A folio deck exported ${m.exportedAt} by folio ${m.folio}: ${m.slides.length} slides on the template pack ${m.pack.name}@${m.pack.version}.`,
    "",
    "| # | id | layout | title |",
    "|---|----|--------|-------|",
    ...rows,
    "",
    "## Open it",
    "",
    `- Into a workspace: \`folio deck import ${m.deck.folder}${EXPORT_SUFFIX}\` (checks every file's sha256, installs the pack, lands in \`decks/${m.deck.folder}\`).`,
    "- As it is: unzip it and run `folio serve <folder>`; the folder is a workspace.",
    "",
    `\`${MANIFEST_FILE}\` lists every slide's layout, title and slots, the warnings at export time and the sha256 of every file.`,
    m.options.pdf ? `\`${m.options.pdf}\` is the deck printed at export time.` : "",
    "",
  ].join("\n");
}

/**
 * Check unpacked files against the manifest.
 *
 * @param digests - sha256 of every file in the zip but the manifest.
 * @returns one line per missing, extra or changed file; empty when all agree.
 */
export function verifyExport(manifest: Pick<DeckExportManifest, "files">, digests: Record<string, string>): string[] {
  const problems: string[] = [];
  for (const [path, sha] of Object.entries(manifest.files)) {
    if (!(path in digests)) problems.push(`${path} is missing`);
    else if (digests[path] !== sha) problems.push(`${path} does not match its sha256 (changed after export)`);
  }
  for (const path of Object.keys(digests)) if (!(path in manifest.files)) problems.push(`${path} is not in the manifest`);
  return problems.sort();
}

/**
 * The files where two copies of a pack differ.
 *
 * @param exported - pack-relative path to sha256, from the zip.
 * @param installed - the same for the installed folder.
 * @returns one line per differing, missing or extra file.
 */
export function packDifferences(exported: Record<string, string>, installed: Record<string, string>): string[] {
  const out: string[] = [];
  for (const [path, sha] of Object.entries(exported)) {
    if (!(path in installed)) out.push(`${path}: only in the export`);
    else if (installed[path] !== sha) out.push(`${path}: differs`);
  }
  for (const path of Object.keys(installed)) if (!(path in exported)) out.push(`${path}: only in the installed pack`);
  return out.sort();
}
