/**
 * The one way folio writes a pack's `pack.json`, used by promote, merge, edit
 * and import.
 *
 * - Text edits are made in place (jsonc-parser): a member is replaced where it
 *   stands or added at the end of its object, in the file's own line endings
 *   and indent, so a CRLF file stays CRLF and `720.0` elsewhere stays `720.0`.
 * - A write (`writePack`) holds the pack's lock, opens the pack inside it,
 *   validates the result as `folio pack check` would, refuses a change that
 *   stops a slide of the workspace rendering, sets the version by the rule of
 *   `packchange.ts` (adding keeps it, removing bumps it), writes atomically
 *   and re-pins the decks that were on the old version.
 */
import { cpSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { applyEdits, findNodeAtLocation, modify, parseTree, type FormattingOptions, type JSONPath } from "jsonc-parser";
import { hookSlotProblems, loadPack, namesRemoved, parsePackRef, slideBreaks, type HookDef, type Pack, type SlideRef } from "@folio/core";
import type { DeckStore } from "./deckstore.js";
import { atomicWrite, dayOf, withLock } from "./fsutil.js";
import { toPosix } from "./posixpath.js";
import { loadPackDir } from "./workspace.js";

export type PackEdit =
  | { op: "set"; path: JSONPath; value: unknown }
  | { op: "remove"; path: JSONPath }
  | { op: "rename"; path: JSONPath; to: string };

/** The file's line ending and indent, as jsonc-parser formatting options. */
export function formatOf(text: string): FormattingOptions {
  const indent = /\n([ \t]+)\S/.exec(text)?.[1] ?? "  ";
  return { eol: text.includes("\r\n") ? "\r\n" : "\n", insertSpaces: !indent.startsWith("\t"), tabSize: indent.startsWith("\t") ? 1 : indent.length };
}

/** Rename the member at `path` to `to`, keeping its position and value text. */
function renameMember(text: string, path: JSONPath, to: string): string {
  const value = findNodeAtLocation(parseTree(text)!, path);
  const key = value?.parent?.children?.[0];
  if (!value || !key || value.parent?.type !== "property") throw new Error(`${path.join(".")} is not in pack.json`);
  return text.slice(0, key.offset) + JSON.stringify(to) + text.slice(key.offset + key.length);
}

/**
 * Apply edits to the text of a JSON file in its own style.
 *
 * @param text - the whole file.
 * @param edits - set (replace or add at the end of its object), remove, or rename a member.
 * @returns the new text.
 */
export function editJsonText(text: string, edits: PackEdit[]): string {
  const formattingOptions = formatOf(text);
  let out = text;
  for (const edit of edits) {
    if (edit.op === "rename") out = renameMember(out, edit.path, edit.to);
    else out = applyEdits(out, modify(out, edit.path, edit.op === "set" ? edit.value : undefined, { formattingOptions }));
  }
  return out;
}

/**
 * Format a new JSON file the way folio stores files.
 *
 * @returns two-space JSON with a trailing newline.
 */
export function newJsonText(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Set one member of an object in JSON text, in the file's own style.
 *
 * @param parent - the key path of the object (`["layouts"]`); a missing object is added.
 * @returns the new text.
 */
export function setJsonMember(text: string, parent: string[], key: string, value: unknown): string {
  return editJsonText(text, [{ op: "set", path: [...parent, key], value }]);
}

export interface PackHandle {
  dir: string;
  text: string;
  raw: Record<string, any>;
  /** The loaded pack, or null when the folder does not load now. */
  pack: Pack | null;
  hooks: Record<string, HookDef & { dir: string }>;
}

export interface PackChange {
  edits: PackEdit[];
  /** Files or folders to copy in, `to` relative to the pack folder. */
  copies?: { from: string; to: string }[];
  /** Files to write, `to` relative to the pack folder. */
  writes?: { to: string; content: string }[];
  /** Hooks the change brings in, by their new names. */
  hooks?: Record<string, HookDef>;
  /** Layouts moved out of pack.json into `.archive/<day>/layouts/`. */
  archive?: { name: string; value: unknown }[];
  /** One line per change, for the command's output. */
  lines: string[];
}

/**
 * Find a pack folder by name under `templates/`, or by path.
 *
 * @throws naming the pack folders there are, when there is no such pack.
 */
export function packDirOf(templatesDir: string, ref: string): string {
  const byName = join(templatesDir, ref);
  if (/^[a-z0-9][a-z0-9-]*$/.test(ref) && existsSync(join(byName, "pack.json"))) return byName;
  const byPath = isAbsolute(ref) ? ref : resolve(ref);
  if (existsSync(join(byPath, "pack.json"))) return byPath;
  throw new Error(`no pack "${ref}": give a pack name under ${templatesDir} or a folder holding pack.json (folio pack import <file.pptx> --name ${ref} makes one)`);
}

/** Open a pack folder for a change. */
export function openPack(dir: string): PackHandle {
  const text = readFileSync(join(dir, "pack.json"), "utf8");
  const loaded = loadPackDir(dir);
  return { dir, text, raw: JSON.parse(text), pack: loaded.ok ? loaded.loaded.pack : null, hooks: loaded.ok ? loaded.loaded.hooks : {} };
}

/** Every slide of the decks that render on this pack now. */
export function slidesUsing(pack: Pack, decks: DeckStore[]): { decks: DeckStore[]; slides: SlideRef[] } {
  const users = decks.filter((d) => {
    const ref = parsePackRef(d.deck.template);
    return ref.name === pack.name && (ref.version === null || ref.version === pack.version);
  });
  const slides = users.flatMap((d) => d.slideIds().flatMap((id) => {
    const spec = d.readSlide(id)?.spec;
    return spec ? [{ deck: d.dir, slide: id, spec }] : [];
  }));
  return { decks: users, slides };
}

/** Validate the new pack.json text as `folio pack check` would, with the hooks it will have. */
function validated(text: string, hooks: Record<string, Pick<HookDef, "output">>): Pack {
  const result = loadPack(JSON.parse(text));
  const problems = result.ok ? hookSlotProblems(result.pack, hooks) : result.problems;
  if (!result.ok || problems.length) throw new Error(`refused: the result would not be a valid pack:\n  ${problems.join("\n  ")}`);
  return result.pack;
}

/** The new text with its version set by the rule, and the names that bumped it. */
function versioned(handle: PackHandle, text: string, hooksAfter: string[]): { text: string; removed: string[] } {
  if (!handle.pack) return { text, removed: [] };
  const after = loadPack(JSON.parse(text));
  if (!after.ok) return { text, removed: [] };
  const removed = namesRemoved(handle.pack, after.pack, Object.keys(handle.hooks), hooksAfter);
  if (!removed.length) return { text, removed };
  return { text: editJsonText(text, [{ op: "set", path: ["version"], value: handle.pack.version + 1 }]), removed };
}

/** Refuse when a slide of the workspace would stop rendering. */
function refuseBreaks(handle: PackHandle, after: Pack, slides: SlideRef[], hooksAfter: string[]): void {
  if (!handle.pack) return;
  const breaks = slideBreaks(handle.pack, after, slides, Object.keys(handle.hooks), hooksAfter);
  if (!breaks.length) return;
  const lines = breaks.map((b) => `${toPosix(b.deck)}/${b.slide}: ${b.reason}`);
  throw new Error(`refused: slides in this workspace would stop rendering:\n  ${lines.join("\n  ")}\nMove those slides to another layout first (folio patch), or keep the name (rename only what no slide uses).`);
}

/** Copy files in, archive layouts and write the new pack.json. */
function writeFiles(handle: PackHandle, change: PackChange, text: string, at: Date): void {
  for (const { from, to } of change.copies ?? []) {
    mkdirSync(dirname(join(handle.dir, to)), { recursive: true });
    cpSync(from, join(handle.dir, to), { recursive: true, filter: (src) => !/__pycache__/.test(src) });
  }
  for (const { to, content } of change.writes ?? []) atomicWrite(join(handle.dir, to), content);
  for (const { name, value } of change.archive ?? []) {
    let file = join(handle.dir, ".archive", dayOf(at), "layouts", `${name}.json`);
    if (existsSync(file)) file = file.replace(/\.json$/, `-${at.getTime()}.json`);
    atomicWrite(file, newJsonText(value));
  }
  atomicWrite(join(handle.dir, "pack.json"), text);
}

/** Re-pin decks that were on the old version; name the ones left on another. */
function repin(decks: DeckStore[], name: string, from: number, to: number): string[] {
  const lines: string[] = [];
  for (const deck of decks) {
    const ref = parsePackRef(deck.deck.template);
    if (ref.name !== name || ref.version === null) continue;
    if (ref.version !== from) {
      lines.push(`left ${deck.dir} on ${deck.deck.template}: it was not on version ${from}`);
      continue;
    }
    const file = join(deck.dir, "deck.json");
    atomicWrite(file, editJsonText(readFileSync(file, "utf8"), [{ op: "set", path: ["template"], value: `${name}@${to}` }]));
    lines.push(`re-pinned ${deck.dir} to ${name}@${to}`);
  }
  return lines;
}

/**
 * Validate, check and write one change to a pack.
 *
 * @param handle - the pack as opened before the change.
 * @param change - the edits and files.
 * @param decks - every deck of the workspace.
 * @returns the lines to print: each change, the version, each re-pinned deck.
 * @throws refusing, with every problem, when the result is invalid or breaks a slide.
 */
export function applyPackChange(handle: PackHandle, change: PackChange, decks: DeckStore[], at = new Date()): string[] {
  const hooksAfter = { ...handle.hooks, ...change.hooks };
  const edited = editJsonText(handle.text, change.edits);
  const { text, removed } = versioned(handle, edited, Object.keys(hooksAfter));
  const after = validated(text, hooksAfter);
  const users = handle.pack ? slidesUsing(handle.pack, decks) : { decks: [], slides: [] };
  refuseBreaks(handle, after, users.slides, Object.keys(hooksAfter));
  writeFiles(handle, change, text, at);
  const before = handle.pack?.version ?? after.version;
  const gone = removed.filter((n) => n.startsWith("layout:")).map((n) => n.slice("layout:".length));
  const named = removed.filter((n) => !(n.startsWith("slot:") && gone.includes(n.slice("slot:".length).split("/")[0]!)));
  const version = removed.length
    ? [`version ${before} -> ${after.version}: removed ${named.join(", ")}`, ...repin(decks, after.name, before, after.version)]
    : [`version ${after.version} kept: nothing a slide names was removed`];
  return [...change.lines, ...version];
}

/**
 * Make one change to a pack under its lock: open it inside the lock, plan the
 * change from what is on disk, then validate, check and write it.
 *
 * @param plan - builds the change from the freshly opened pack.
 * @returns the lines `applyPackChange` returns.
 */
export async function writePack(dir: string, decks: DeckStore[], plan: (handle: PackHandle) => PackChange): Promise<string[]> {
  return withLock(join(dirname(dir), ".locks", basename(dir)), () => {
    const handle = openPack(dir);
    return applyPackChange(handle, plan(handle), decks);
  });
}
