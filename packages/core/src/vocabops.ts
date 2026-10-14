/**
 * One change to a deck's own vocabulary bank, the same for the editor and the
 * CLI. A change always lands in the deck's own file: an inherited row edited
 * becomes the deck's own row, an inherited row deleted becomes a `drop` item;
 * the pack's bank and other decks' banks are never written.
 */
import { addDrop, newBankText, removeRow, setSection, upsertRow } from "./vocabedit.js";
import { entryKey, parseBank, splitOutside, type ResolvedBank, type VocabEntry } from "./vocabulary.js";

export type VocabOp =
  | { kind: "set"; from?: string; use: string; never: string; since?: string }
  | { kind: "delete"; use: string }
  | { kind: "section"; heading: string; text: string };

const has = (entries: { use: string }[], use: string): boolean => entries.some((e) => entryKey(e.use) === entryKey(use));

/**
 * Apply one change.
 *
 * @param own - the deck's bank file, or null when it has none (it is made, inheriting the pack).
 * @param inherited - what the deck inherits, resolved, after its own drops.
 * @param op - the change.
 * @param today - `YYYY-MM-DD`, the Since of a new row.
 * @returns the new file text, or why the change cannot be made.
 */
export function applyVocabOp(own: string | null, inherited: ResolvedBank, op: VocabOp, today: string): { ok: true; text: string } | { ok: false; reason: string } {
  const text = own ?? newBankText();
  const mine = parseBank(text).entries;
  if (op.kind === "section") return op.heading.trim() ? { ok: true, text: setSection(text, op.heading, op.text.split("\n")) } : { ok: false, reason: "a section needs a heading" };
  if (op.kind === "delete") {
    if (!has(mine, op.use) && !has(inherited.entries, op.use)) return { ok: false, reason: `no word "${op.use}" in the bank` };
    const removed = removeRow(text, op.use);
    return { ok: true, text: has(inherited.entries, op.use) ? addDrop(removed, op.use) : removed };
  }
  if (!op.use.trim()) return { ok: false, reason: "a word needs its Use cell" };
  const from = op.from ?? op.use;
  const previous = [...mine, ...inherited.entries].find((e) => entryKey(e.use) === entryKey(from));
  const entry: VocabEntry = { use: op.use.trim(), never: op.never.trim(), since: op.since ?? previous?.since ?? today };
  const written = upsertRow(text, entry, has(mine, from) ? from : entry.use);
  const renamed = entryKey(from) !== entryKey(entry.use) && has(inherited.entries, from);
  return { ok: true, text: renamed ? addDrop(written, from) : written };
}

/** The Since cell of a row added today: the date, the slide and the user's words when given. */
export function sinceCell(today: string, slide?: string, quote?: string): string {
  return [today, slide ? `slide ${slide}` : "", quote ? `user: "${quote}"` : ""].filter(Boolean).join(", ");
}

/**
 * How an incoming entry meets a bank: new, a duplicate (same words), or a
 * conflict (same Use, other Never terms).
 */
export function entryStanding(entry: VocabEntry, entries: VocabEntry[]): "new" | "duplicate" | "conflict" {
  const same = entries.find((e) => entryKey(e.use) === entryKey(entry.use));
  if (!same) return "new";
  const terms = (n: string) => splitOutside(n, ",").map(entryKey).sort().join("|");
  return terms(same.never) === terms(entry.never) ? "duplicate" : "conflict";
}
