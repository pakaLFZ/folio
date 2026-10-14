/**
 * Hook files of a deck: cached figures `.folio/hooks/<key>.png|svg` and text
 * or table outputs `<key>.out.json`, with a `<key>.json` beside each, one slot-state file per slide, and the per-date
 * hook log. Only the serving process writes slot state, one file per slide.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import { appendJsonl, atomicWrite, dayOf, formatJson, readJson } from "../fsutil.js";

export type SlotPhase = "ok" | "waiting" | "drawing" | "failed" | "paused" | "stale" | "invalid";

export interface SlotState {
  key: string;
  hook: string;
  stamp: string;
  goodKey: string | null;
  goodStamp: string | null;
  phase: SlotPhase;
  record: RunRecord | null;
  at: string;
}

export type SlideHookState = Record<string, SlotState>;

/** Where hook outputs are cached: a deck, or a workspace for direct calls (`dir` is the folder inputs resolve against). */
export type HookCache = Pick<DeckStore, "dir" | "stateDir">;

/** Folder of a deck's hook files. */
export function hooksDir(store: HookCache): string {
  return join(store.stateDir, "hooks");
}

/**
 * Path of a cached figure.
 *
 * @param key - the cache key.
 * @param ext - `png` or `svg`.
 */
export function figurePath(store: HookCache, key: string, ext = "png"): string {
  return join(hooksDir(store), `${key}.${ext}`);
}

/** The extension of a cached text or table output. */
export const OUTPUT_EXT = "out.json";

/**
 * Whether an output for a key is in the cache.
 *
 * @returns the extension found (`png`, `svg`, `pdf` or `out.json`), or null.
 */
export function cachedExt(store: HookCache, key: string): string | null {
  for (const ext of ["png", "svg", "pdf", OUTPUT_EXT]) if (existsSync(figurePath(store, key, ext))) return ext;
  return null;
}

/**
 * A cached text or table output with the input it was made from.
 *
 * @returns `{input, output}`, or null for a figure or a missing key.
 */
export function readOutput(store: HookCache, key: string | null): { input: unknown; output: unknown } | null {
  return key ? readJson<{ input: unknown; output: unknown } | null>(figurePath(store, key, OUTPUT_EXT), null) : null;
}

/** Read the hook state of one slide. */
export function readSlideState(store: DeckStore, slide: string): SlideHookState {
  return readJson<SlideHookState>(join(hooksDir(store), "slots", `${slide}.json`), {});
}

/**
 * Write the hook state of one slot of a slide.
 *
 * @param store - the deck.
 * @param slide - the slide id.
 * @param slot - the slot name.
 * @param state - the new state, or null to drop the slot (no longer hooked).
 * @returns the whole slide state after the write.
 */
export function writeSlotState(store: DeckStore, slide: string, slot: string, state: SlotState | null): SlideHookState {
  const all = readSlideState(store, slide);
  if (state) all[slot] = state;
  else delete all[slot];
  atomicWrite(join(hooksDir(store), "slots", `${slide}.json`), formatJson(all));
  return all;
}

/**
 * Every slide's hook state in a deck.
 *
 * @returns slot states by slide id.
 */
export function deckHookState(store: DeckStore): Record<string, SlideHookState> {
  const dir = join(hooksDir(store), "slots");
  if (!existsSync(dir)) return {};
  return Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => [f.slice(0, -5), readJson<SlideHookState>(join(dir, f), {})]));
}

/**
 * Append a record to the deck's hook log.
 *
 * @param record - a run record or a queue state change.
 */
export function logHook(store: DeckStore, record: Record<string, unknown>): void {
  appendJsonl(join(hooksDir(store), "log", `${dayOf()}.jsonl`), { at: new Date().toISOString(), ...record });
}

/**
 * What the browser needs of a slot's state.
 *
 * @returns phase, the last good key and its extension, a figure's box in pt
 *   (from its trace, so it is drawn at the size it was made for), and for a
 *   text or table hook the last good output with the input it was made from,
 *   and whether it is for the slot's current input.
 */
export function slotView(store: DeckStore, state: SlotState) {
  const ext = state.goodKey ? cachedExt(store, state.goodKey) : null;
  const box = ext && ext !== OUTPUT_EXT ? readJson<{ box?: { w: number; h: number } } | null>(join(hooksDir(store), `${state.goodKey}.json`), null)?.box : undefined;
  return { phase: state.phase, goodKey: state.goodKey, ext, ...(box ? { box: { w: box.w, h: box.h } } : {}), ...(ext === OUTPUT_EXT ? { output: readOutput(store, state.goodKey), current: state.goodKey === state.key } : {}) };
}

/**
 * The last good text or table output of every hooked slot of a slide.
 *
 * @returns `{input, output}` by slot name; figures are left out.
 */
export function slideOutputs(store: DeckStore, slide: string): Record<string, { input: unknown; output: unknown } | null> {
  return Object.fromEntries(Object.entries(readSlideState(store, slide)).map(([slot, s]) => [slot, readOutput(store, s.goodKey)]));
}
