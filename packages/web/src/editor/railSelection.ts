/**
 * Which slides the rail has selected. The current slide is always one of
 * them; the anchor is where a Shift range starts, and the head is where it
 * ends, which Shift+Arrow moves.
 */
import type { DeckState } from "./deckState";

export interface RailSelection {
  ids: string[];
  anchor: string | null;
  head: string | null;
}

export const NO_SELECTION: RailSelection = { ids: [], anchor: null, head: null };

/**
 * The selected slides in deck order.
 *
 * @returns the selection, or just the current slide when the selection does
 *   not hold it (the current slide was changed some other way).
 */
export function selectedIds(state: DeckState): string[] {
  const chosen = new Set(state.selection.ids);
  if (!state.current || !chosen.has(state.current)) return state.current ? [state.current] : [];
  return state.manifest.filter((e) => chosen.has(e.id)).map((e) => e.id);
}

/** The ids from one slide to another, inclusive, in deck order. */
function rangeOf(state: DeckState, from: string, to: string): string[] {
  const ids = state.manifest.map((e) => e.id);
  const [a, b] = [ids.indexOf(from), ids.indexOf(to)].sort((x, y) => x - y);
  return a! < 0 ? [to] : ids.slice(a, b! + 1);
}

/**
 * The state after a click on a thumbnail.
 *
 * @param how - `toggle` (Ctrl or Cmd) adds or removes the slide without
 *   changing the current one; `range` (Shift) selects from the anchor; `one`
 *   selects only this slide and makes it current.
 */
export function clickSlide(state: DeckState, id: string, how: "one" | "toggle" | "range"): DeckState {
  const ids = selectedIds(state);
  if (how === "one") return { ...state, current: id, selectedSlot: null, selection: { ids: [id], anchor: id, head: id } };
  if (how === "range") {
    const anchor = state.selection.anchor && ids.includes(state.selection.anchor) ? state.selection.anchor : (state.current ?? id);
    const range = rangeOf(state, anchor, id);
    return { ...state, selection: { ids: state.current && !range.includes(state.current) ? [...range, state.current] : range, anchor, head: id } };
  }
  if (id === state.current) return state;
  const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
  return { ...state, selection: { ids: next, anchor: id, head: id } };
}

/**
 * Extend the selection by one slide up or down from its head (Shift+Arrow).
 *
 * @param step - -1 for up, 1 for down.
 */
export function extendSelection(state: DeckState, step: -1 | 1): DeckState {
  const order = state.manifest.map((e) => e.id);
  const ids = selectedIds(state);
  const anchor = state.selection.anchor && ids.includes(state.selection.anchor) ? state.selection.anchor : state.current;
  const head = state.selection.head && ids.includes(state.selection.head) ? state.selection.head : anchor;
  if (!anchor || !head) return state;
  const next = order[Math.max(0, Math.min(order.length - 1, order.indexOf(head) + step))]!;
  return clickSlide({ ...state, selection: { ids, anchor, head } }, next, "range");
}

/** Collapse the selection to the current slide. */
export function collapseSelection(state: DeckState): DeckState {
  return { ...state, selection: { ids: state.current ? [state.current] : [], anchor: state.current, head: state.current } };
}

/** Select a set of slides and make the first current, after a paste or duplicate. */
export function selectSlides(state: DeckState, ids: string[]): DeckState {
  if (!ids.length) return state;
  return { ...state, current: ids[0]!, selectedSlot: null, selection: { ids, anchor: ids[0]!, head: ids[ids.length - 1]! } };
}
