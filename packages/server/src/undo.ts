import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import type { DeckStore } from "./deckstore.js";
import { archive, atomicWrite, formatJson, readJson, withLock } from "./fsutil.js";
import { relative } from "./posixpath.js";
import type { WriteRecording } from "./write-recording.js";

type Bytes = string | null;
export interface UndoFile { path: string; before: Bytes; after: Bytes; beforeRev: string | null; afterRev: string | null }
export interface UndoEntry { files: UndoFile[]; ops: string[]; at: string }
export interface UndoLists { undo: UndoEntry[]; redo: UndoEntry[] }
export type UndoResult = { ok: true; entry: UndoEntry } | { ok: false; reason: string };

const ignored = (path: string) => path.startsWith(".folio/") || path.startsWith(".shots/");
const rev = (bytes: Bytes) => bytes === null ? null : createHash("sha256").update(Buffer.from(bytes, "base64")).digest("hex");
const file = (store: DeckStore, path: string) => join(store.dir, ...path.split("/"));

function paths(dir: string, store: DeckStore): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    const rel = relative(store.dir, full);
    if (ignored(rel)) return [];
    return statSync(full).isDirectory() ? paths(full, store) : [rel];
  });
}

const listPath = (store: DeckStore) => join(store.stateDir, "undo", "history.json");
export const readUndo = (store: DeckStore): UndoLists => readJson(listPath(store), { undo: [], redo: [] });

/** Keep a pending screenshot enrichment from making its user's comment write stale. */
export function refreshDerivedComment(store: DeckStore, path: string, before: Buffer): void {
  const rel = relative(store.dir, path);
  const lists = readUndo(store);
  const oldRev = createHash("sha256").update(before).digest("hex");
  const item = lists.undo.slice().reverse().flatMap((entry) => entry.files).find((file) => file.path === rel && file.afterRev === oldRev);
  if (!item || !existsSync(path)) return;
  const bytes = readFileSync(path);
  item.after = bytes.toString("base64");
  item.afterRev = createHash("sha256").update(bytes).digest("hex");
  atomicWrite(listPath(store), formatJson(lists));
}

export function recordUndo(store: DeckStore, recording: WriteRecording, ops: string[]): void {
  const root = resolve(store.dir);
  const files = [...recording.before].filter(([full]) => full.startsWith(`${root}${sep}`) && !recording.conflicted.has(full)).sort(([a], [b]) => a.localeCompare(b)).flatMap(([full, before]) => {
    const path = relative(store.dir, full);
    if (ignored(path)) return [];
    const old = before?.toString("base64") ?? null;
    const now = existsSync(full) ? readFileSync(full).toString("base64") : null;
    return old === now ? [] : [{ path, before: old, after: now, beforeRev: rev(old), afterRev: rev(now) }];
  });
  if (!files.length) return;
  const lists = readUndo(store);
  lists.undo.push({ files, ops, at: new Date().toISOString() });
  lists.undo = lists.undo.slice(-200);
  lists.redo = [];
  atomicWrite(listPath(store), formatJson(lists));
}

function currentRev(store: DeckStore, path: string): string | null {
  return existsSync(file(store, path)) ? createHash("sha256").update(readFileSync(file(store, path))).digest("hex") : null;
}

function apply(store: DeckStore, entry: UndoEntry, direction: "undo" | "redo"): void {
  for (const item of entry.files) {
    const bytes = direction === "undo" ? item.before : item.after;
    if (bytes === null) {
      const path = file(store, item.path);
      if (existsSync(path)) archive(path, join(dirname(path), ".archive"));
    }
    else atomicWrite(file(store, item.path), Buffer.from(bytes, "base64"));
  }
  store.reloadDeck();
}

export async function stepUndo(store: DeckStore, direction: "undo" | "redo"): Promise<UndoResult> {
  return withLock(join(store.stateDir, "locks", "undo"), () => {
    const lists = readUndo(store);
    const source = lists[direction];
    const entry = source.at(-1);
    if (!entry) return { ok: false, reason: `nothing to ${direction}` };
    const changed = entry.files.find((item) => currentRev(store, item.path) !== (direction === "undo" ? item.afterRev : item.beforeRev));
    if (changed) {
      const reason = `${changed.path} changed since this operation`;
      store.log({ worker: "user", op: direction, refused: reason, ops: entry.ops });
      return { ok: false, reason };
    }
    apply(store, entry, direction);
    source.pop();
    lists[direction === "undo" ? "redo" : "undo"].push(entry);
    atomicWrite(listPath(store), formatJson(lists));
    store.log({ worker: "user", op: direction, ops: entry.ops });
    return { ok: true, entry };
  });
}

export async function restoreSlide(store: DeckStore, id: string): Promise<string> {
  if (!/^[a-zA-Z0-9_-]+$/.test(id)) throw new Error(`invalid slide ${id}`);
  return withLock(join(store.stateDir, "locks", "deck"), () => {
    if (store.readSlide(id)) throw new Error(`slide ${id} already exists`);
    const root = join(store.slidesDir, ".archive");
    const copies = paths(root, store).filter((path) => path.endsWith(`/${id}.json`) || path.endsWith(`_${id}.json`));
    if (!copies.length) throw new Error(`slide ${id} has no archived copy`);
    const archivedAt = (path: string) => {
      const sidecar = file(store, path.replace(/\.json$/, ".order.json"));
      return statSync(existsSync(sidecar) ? sidecar : file(store, path)).mtimeMs;
    };
    const latest = copies.sort((a, b) => archivedAt(b) - archivedAt(a) || b.localeCompare(a))[0]!;
    const bytes = readFileSync(file(store, latest));
    const metadata = file(store, latest.replace(/\.json$/, ".order.json"));
    const history = readUndo(store).undo.slice().reverse().find((entry) => entry.files.some((item) => item.path === `slides/${id}.json` && item.after === null));
    const prior = history?.files.find((item) => item.path === "deck.json")?.before;
    const priorOrder: string[] = prior ? JSON.parse(Buffer.from(prior, "base64").toString()).order ?? [] : [];
    store.reloadDeck();
    const current = store.slideIds();
    const previous = existsSync(metadata) ? readJson<{ previous: string | null }>(metadata, { previous: null }).previous : priorOrder[priorOrder.indexOf(id) - 1];
    const at = previous && current.includes(previous) ? current.indexOf(previous) + 1 : 0;
    atomicWrite(file(store, `slides/${id}.json`), bytes);
    rmSync(file(store, latest));
    rmSync(metadata, { force: true });
    store.deck = { ...store.deck, order: [...current.slice(0, at), id, ...current.slice(at)] };
    atomicWrite(join(store.dir, "deck.json"), formatJson(store.deck));
    store.log({ worker: "cli", op: "restore", slide: id, from: latest });
    return id;
  });
}
