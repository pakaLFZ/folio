/**
 * Figures drawn by a script: the trace file `folio_hook.save_traced` writes
 * beside the image, read back and compared with the image and its slot's box.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { boxFits, figureTraceName, readFigureTrace, redrawLine, type FigureFileRecord, type FolioWarning, makeWarning } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import type { TableFileTrace } from "./tablefiles.js";
import { sha256File } from "./trace.js";

/** What folio knows of a script-drawn figure; the table-file fields mean the same. */
export interface FigureFileTrace extends TableFileTrace {
  kind: "figure-file";
  box: { w: number; h: number } | null;
  boxNow: { w: number; h: number } | null;
  dpi: number | null;
  command: string | null;
}

/** Whether an image has a trace file beside it. */
export function hasFigureTrace(store: DeckStore, path: string): boolean {
  return existsSync(join(store.dir, figureTraceName(path)));
}

function readRecord(file: string): ReturnType<typeof readFigureTrace> {
  try {
    return readFigureTrace(JSON.parse(readFileSync(file, "utf8")));
  } catch (error) {
    return { ok: false, reason: `it is not JSON: ${(error as Error).message}` };
  }
}

/** Why a trace file does not describe its image, or null when it does. */
function problemOf(path: string, sha256: string | null, read: ReturnType<typeof readFigureTrace>): string | null {
  if (!sha256) return "the image does not exist";
  if (!read.ok) return `${figureTraceName(basename(path))} ${read.reason}`;
  if (read.record.file !== basename(path)) return `the trace is of ${read.record.file}, not ${basename(path)}`;
  return read.record.output.sha256 === sha256 ? null : "the image changed after save_traced wrote it";
}

/**
 * The trace of a script-drawn figure.
 *
 * @param path - the image, relative to the deck.
 * @param boxNow - the slot's box now, when known.
 */
export function figureFileTrace(store: DeckStore, path: string, boxNow: { w: number; h: number } | null): FigureFileTrace {
  const full = join(store.dir, path);
  const sha256 = existsSync(full) ? sha256File(full) : null;
  const read = readRecord(`${full}.trace.json`);
  const record: FigureFileRecord | null = read.ok ? read.record : null;
  return {
    kind: "figure-file", path, sha256, boxNow,
    drawn: record ? { sha256: record.output.sha256, at: record.source.at ?? "" } : null,
    matches: record && sha256 ? record.output.sha256 === sha256 : null,
    source: record?.source ?? null,
    problem: problemOf(path, sha256, read),
    box: record?.box ?? null, dpi: record?.dpi ?? null,
    command: record ? redrawLine(record) : null,
  };
}

/**
 * The warnings of a figure slot holding a traced image: `FOLIO-FIG-004` when
 * the trace does not describe it, `FOLIO-FIG-003` when its box changed.
 */
export function figureFileWarnings(t: FigureFileTrace, where: FolioWarning["location"], at: string): FolioWarning[] {
  if (t.problem) return [makeWarning("FOLIO-FIG-004", where, { path: t.path, reason: t.problem }, { at })];
  if (!t.box || !t.boxNow || boxFits(t.box, t.boxNow)) return [];
  const args = { path: t.path, w: t.box.w, h: t.box.h, bw: t.boxNow.w, bh: t.boxNow.h, command: t.command ?? "" };
  return [makeWarning("FOLIO-FIG-003", where, args, { at, fix: { description: `Run the script that drew ${t.path} again at the new box: ${t.command}`, applicability: "review" } })];
}
