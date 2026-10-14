/**
 * What made what a figure or table slot shows: a hook's trace record, a table
 * file with its hash and source block, or nothing ("untraced": a plain image,
 * a table typed into the slide). Read by `folio trace`, the editor and the PDF.
 */
import { inputsHash, regenerateLine, slideRoot, type PageTrace, type TraceRecord } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import { toPosix } from "../posixpath.js";
import { figureFileTrace, hasFigureTrace, type FigureFileTrace } from "./figurefiles.js";
import { readSlideState } from "./state.js";
import { tableFileTrace, type TableFileTrace } from "./tablefiles.js";
import { readTrace, tracePath } from "./trace.js";

/** What `folio trace` and the editor show for one slot. */
export interface SlotTrace {
  state: "traced" | "file" | "untraced" | "none";
  phase: string | null;
  /** For `untraced`: the plain image's path, or `inline table`. */
  path?: string;
  trace: TraceRecord | null;
  tracePath: string | null;
  command: string | null;
  /** The `.table.json` file a table slot reads, hooked or not, or a script-drawn image with its trace file. */
  file?: TableFileTrace | FigureFileTrace;
}

const EMPTY = { phase: null, trace: null, tracePath: null, command: null };

/** The table file a slot value names, if any. */
function srcOf(value: unknown): string | null {
  const src = value && typeof value === "object" ? (value as { src?: unknown }).src : undefined;
  return typeof src === "string" ? src : null;
}

/**
 * The trace of what a slot shows.
 *
 * @returns `traced` with a hook's record and the line that makes it again
 *   (and the table file it read, if any); `file` for a table read from a file
 *   without a hook, or an image a script saved with its trace file;
 *   `untraced` for a plain image or an inline table; `none` for an empty
 *   slot or a hook that has not drawn yet.
 * @param boxNow - the slot's box now, compared with a script-drawn figure's.
 */
export function slotTrace(store: DeckStore, slide: string, slot: string, boxNow: { w: number; h: number } | null = null): SlotTrace {
  const spec = store.readSlide(slide)?.spec;
  const value = spec ? slideRoot(spec)?.props[slot] : undefined;
  if (typeof value === "string" && value && hasFigureTrace(store, value)) {
    const file = figureFileTrace(store, value, boxNow);
    return { state: "file", ...EMPTY, command: file.command, file };
  }
  if (typeof value === "string" && value) return { state: "untraced", ...EMPTY, path: value };
  const src = srcOf(value);
  const file = src ? { file: tableFileTrace(store, src) } : {};
  const state = readSlideState(store, slide)[slot];
  const trace = readTrace(store, state?.goodKey ?? null);
  if (trace && state?.goodKey) {
    const path = tracePath(store, state.goodKey);
    const phase = state.key === state.goodKey ? state.phase : state.phase === "ok" ? "drawing" : state.phase;
    return { state: "traced", phase, trace, tracePath: path, command: regenerateLine(trace, toPosix(path)), ...file };
  }
  if (src) return { state: "file", ...EMPTY, phase: state?.phase ?? null, ...file };
  if (value && typeof value === "object" && "columns" in value && !state) return { state: "untraced", ...EMPTY, path: "inline table" };
  return { state: "none", ...EMPTY, phase: state?.phase ?? null };
}

/** One slot's `/FolioTrace` entry, or null when the slot shows nothing traceable or untraceable. */
function pageEntry(t: SlotTrace): PageTrace["slots"][string] | null {
  if (t.state === "untraced") return { untraced: t.path! };
  const file = t.file?.sha256 ? { file: t.file.path, sha256: t.file.sha256 } : {};
  if (t.trace) return { hook: `${t.trace.hook.pack ? `${t.trace.hook.pack}/` : ""}${t.trace.hook.name}@${t.trace.hook.version}`, key: t.trace.key, inputs: inputsHash(t.trace.inputs), ...file };
  return t.file?.sha256 ? { file: t.file.path, sha256: t.file.sha256 } : null;
}

/**
 * What `/FolioTrace` lists for each printed page.
 *
 * @param slides - the slide ids printed, in order.
 * @returns one entry per page: each figure and table slot's hook, version,
 *   key and inputs hash, its table file and hash, or what is untraced.
 */
export function pageTraces(store: DeckStore, slides: string[]): PageTrace[] {
  return slides.map((slide) => {
    const spec = store.readSlide(slide)?.spec;
    const props = (spec ? slideRoot(spec)?.props : undefined) ?? {};
    const slots: PageTrace["slots"] = {};
    for (const slot of Object.keys(props).filter((k) => k.startsWith("fig") || k.startsWith("table:"))) {
      const entry = pageEntry(slotTrace(store, slide, slot));
      if (entry) slots[slot] = entry;
    }
    return { slide, slots };
  });
}
