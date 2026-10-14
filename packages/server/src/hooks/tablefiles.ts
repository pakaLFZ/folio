/**
 * Table files: which version of a `<subject>.table.json` file was last drawn
 * (recorded when the page reads it, live view and print alike), and what the
 * file says made it (its optional `source` block).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readTableFile, type TableSource } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import { atomicWrite, formatJson, readJson } from "../fsutil.js";
import { sha256File } from "./trace.js";

/** The trace of one table file. */
export interface TableFileTrace {
  path: string;
  sha256: string | null;
  drawn: { sha256: string; at: string } | null;
  matches: boolean | null;
  source: TableSource | null;
  problem: string | null;
}

const drawnPath = (store: DeckStore, path: string) => join(store.stateDir, "tables", `${path.replace(/[^\w.-]/g, "_")}.json`);

/**
 * Record that a table file was drawn: its sha256 and the time.
 *
 * @param path - the deck-relative path of the `.table.json` file.
 */
export function recordTableDrawn(store: DeckStore, path: string): void {
  const full = join(store.dir, path);
  if (!existsSync(full)) return;
  const sha256 = sha256File(full);
  const before = readJson<{ sha256?: string } | null>(drawnPath(store, path), null);
  if (before?.sha256 !== sha256) atomicWrite(drawnPath(store, path), formatJson({ path, sha256, at: new Date().toISOString() }));
}

/**
 * What folio knows of a table file.
 *
 * @returns its current sha256, the one last drawn and whether they match, and
 *   its source block (or the problem that makes the file unusable).
 */
export function tableFileTrace(store: DeckStore, path: string): TableFileTrace {
  const full = join(store.dir, path);
  const drawn = readJson<{ sha256: string; at: string } | null>(drawnPath(store, path), null);
  const exists = existsSync(full);
  const sha256 = exists ? sha256File(full) : null;
  let read: ReturnType<typeof readTableFile> | null = null;
  try {
    read = exists ? readTableFile(JSON.parse(readFileSync(full, "utf8"))) : null;
  } catch (error) {
    read = { ok: false, reason: `it is not JSON: ${(error as Error).message}` };
  }
  const problem = !exists ? "the file does not exist" : read && !read.ok ? read.reason : null;
  return { path, sha256, drawn: drawn ? { sha256: drawn.sha256, at: drawn.at } : null, matches: drawn && sha256 ? drawn.sha256 === sha256 : null, source: read?.ok ? read.source : null, problem };
}
