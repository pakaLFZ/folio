/**
 * The vocabulary bank against slides: FOLIO-VOC-001 for a Never term in a
 * text slot, the text a user's save changed, and the coalescing of a typing
 * burst into one edit record.
 */
import { plainText } from "./markup.js";
import { slideLayout } from "./overrides.js";
import { isTextRole, type Pack } from "./pack.js";
import { resolveAliases, slideRoot, type SlideSpec } from "./schema.js";
import { vocabHits, type VocabEntry } from "./vocabulary.js";
import { makeWarning, type FolioWarning } from "./warnings.js";

/** One recorded rewrite of a text slot by the user. */
export interface VocabEdit {
  deck: string;
  slide: string;
  slot: string;
  before: string;
  after: string;
  /** When the edit began (ISO). */
  at: string;
  /** When the last save of the burst landed (ISO). */
  until: string;
  by: string;
  /** Who wrote the text before the user changed it, from the deck's write log; null when unknown. */
  beforeBy: string | null;
}

/** Two saves of one slot within this many ms, the second starting where the first ended, are one edit. */
export const EDIT_BURST_MS = 120_000;

/**
 * The text slots of a slide and their markup.
 *
 * @returns one item per text-role slot holding a string, in layout order.
 */
export function slideTexts(spec: SlideSpec, pack: Pack): { slot: string; text: string }[] {
  const root = slideRoot(spec);
  const layout = root && pack.layouts[root.layout] ? slideLayout(pack, root.layout, root.props) : undefined;
  if (!root || !layout) return [];
  const props = resolveAliases(root.props, layout.aliases);
  return Object.entries(layout.slots)
    .filter(([name, slot]) => isTextRole(slot.role) && typeof props[name] === "string")
    .map(([name]) => ({ slot: name, text: props[name] as string }));
}

/**
 * FOLIO-VOC-001: each Never term of the bank used in a text slot.
 *
 * @param where - deck token and slide id.
 * @param entries - the resolved bank's entries.
 * @returns one warning per slot and term; never a refusal.
 */
export function slideVocabWarnings(where: { deck: string; slide: string }, spec: SlideSpec, pack: Pack, entries: VocabEntry[], at: string): FolioWarning[] {
  if (!entries.length) return [];
  return slideTexts(spec, pack).flatMap(({ slot, text }) =>
    vocabHits(plainText(text), entries).map(({ term, entry }) =>
      makeWarning("FOLIO-VOC-001", { ...where, slot }, { slide: where.slide, slot, term, use: entry.use, since: entry.since }, { at, subject: term.toLowerCase() }),
    ),
  );
}

/**
 * The text slots a write changed.
 *
 * @returns before and after markup of each changed slot ("" for an empty slot).
 */
export function changedTexts(before: SlideSpec, after: SlideSpec, pack: Pack): { slot: string; before: string; after: string }[] {
  const old = new Map(slideTexts(before, pack).map((t) => [t.slot, t.text]));
  const now = new Map(slideTexts(after, pack).map((t) => [t.slot, t.text]));
  return [...new Set([...old.keys(), ...now.keys()])]
    .map((slot) => ({ slot, before: old.get(slot) ?? "", after: now.get(slot) ?? "" }))
    .filter((c) => c.before !== c.after);
}

/**
 * Add an edit to the records, folding it into the slot's last record when it
 * continues that record's burst.
 *
 * @param records - the deck's records, oldest first.
 * @param next - the new edit.
 * @returns the records to store: the last one of the slot extended (or
 *   removed when the burst ends where it began), or the edit appended.
 */
export function foldEdit(records: VocabEdit[], next: VocabEdit, burstMs = EDIT_BURST_MS): VocabEdit[] {
  const at = records.reduce((found, r, i) => (r.deck === next.deck && r.slide === next.slide && r.slot === next.slot ? i : found), -1);
  const last = records[at];
  const continues = last && last.by === next.by && last.after === next.before && Date.parse(next.at) - Date.parse(last.until) <= burstMs;
  if (!continues) return [...records, next];
  const merged = { ...last, after: next.after, until: next.until };
  return merged.after === merged.before ? records.filter((_, i) => i !== at) : records.map((r, i) => (i === at ? merged : r));
}
