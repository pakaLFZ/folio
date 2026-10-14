/**
 * Vocabulary bank files: a deck's own `vocabulary.md`, its pack's, and those
 * it inherits, resolved nearest first; the one writer of a deck's bank; and
 * the record of the user's text edits in `.folio/vocab-edits.jsonl`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import {
  applyDrop, applyVocabOp, changedTexts, combine, EMPTY_RESOLVED, foldEdit, ownResolved, parseBank, pointerToken, resolveBank, revisionOf,
  type PatchOp, type ResolvedBank, type SlideSpec, type VocabBank, type VocabEdit, type VocabOp,
} from "@folio/core";
import type { DeckStore } from "./deckstore.js";
import { atomicWrite, withLock } from "./fsutil.js";
import type { Workspace } from "./workspace.js";

export const BANK_FILE = "vocabulary.md";

export interface DeckBank {
  /** The effective bank. */
  resolved: ResolvedBank;
  /** What the deck inherits, after its own drops: what shows when its own row is gone. */
  inherited: ResolvedBank;
  /** Every bank file that took part, nearest first. */
  files: { origin: string; path: string }[];
  /** Cycles and missing references, by name. */
  problems: string[];
  /** The deck's own file, or null when it has none. */
  own: string | null;
  /** The revision of the deck's own file ("none" without one). */
  rev: string;
}

const cache = new Map<string, { stamp: string; bank: VocabBank }>();

/** A bank file parsed, re-read only when its size or time changes; null when absent. */
function readBank(path: string): VocabBank | null {
  if (!existsSync(path)) return null;
  const stat = statSync(path);
  const stamp = `${stat.mtimeMs}:${stat.size}`;
  const hit = cache.get(path);
  if (hit?.stamp === stamp) return hit.bank;
  const bank = parseBank(readFileSync(path, "utf8"));
  cache.set(path, { stamp, bank });
  return bank;
}

export const deckBankFile = (store: DeckStore): string => join(store.dir, BANK_FILE);
export const deckOrigin = (store: DeckStore): string => `decks/${basename(store.dir)}`;
export const localDay = (at = new Date()): string => at.toLocaleDateString("en-CA");

interface Walk {
  workspace: Workspace;
  seen: Set<string>;
  files: DeckBank["files"];
  problems: string[];
}

/** A bank file resolved over what it inherits. */
function resolveFile(walk: Walk, path: string, origin: string, from: DeckStore | null, fallback: string[]): ResolvedBank {
  const bank = readBank(path);
  if (!bank) return EMPTY_RESOLVED;
  if (walk.seen.has(path)) {
    walk.problems.push(`${origin} is inherited in a cycle; cut there`);
    return EMPTY_RESOLVED;
  }
  walk.seen.add(path);
  walk.files.push({ origin, path });
  return resolveBank({ bank, origin }, inheritedOf(walk, bank, from, fallback));
}

/** Each bank a file inherits, resolved, nearest first. */
function inheritedOf(walk: Walk, bank: VocabBank, from: DeckStore | null, fallback: string[]): ResolvedBank[] {
  return (bank.inherits ?? fallback).map((ref) => resolveRef(walk, ref, from));
}

/** `pack`, `templates/<pack>` or `decks/<deck>`, resolved. */
function resolveRef(walk: Walk, ref: string, from: DeckStore | null): ResolvedBank {
  const { workspace } = walk;
  const packName = ref === "pack" ? (from && workspace.packOf(from)?.pack.name) : ref.startsWith("templates/") ? ref.slice("templates/".length) : null;
  if (packName) return resolveFile(walk, join(workspace.config.templatesDir, packName, BANK_FILE), `templates/${packName}`, null, []);
  const deck = ref.startsWith("decks/") ? workspace.findDeck(ref.slice("decks/".length)) : undefined;
  if (deck) return resolveDeck(walk, deck).resolved;
  walk.problems.push(`inherits ${ref}, which names no pack bank or deck`);
  return EMPTY_RESOLVED;
}

/** A deck's bank: its own file over what it inherits, or its pack's bank when it has none. */
function resolveDeck(walk: Walk, store: DeckStore): { resolved: ResolvedBank; inherited: ResolvedBank } {
  const path = deckBankFile(store);
  const bank = readBank(path);
  if (!bank) {
    const inherited = resolveRef(walk, "pack", store);
    return { resolved: inherited, inherited };
  }
  if (walk.seen.has(path)) {
    walk.problems.push(`${deckOrigin(store)} is inherited in a cycle; cut there`);
    return { resolved: EMPTY_RESOLVED, inherited: EMPTY_RESOLVED };
  }
  walk.seen.add(path);
  walk.files.push({ origin: deckOrigin(store), path });
  const inherited = applyDrop(inheritedOf(walk, bank, store, ["pack"]).reduce(combine, EMPTY_RESOLVED), bank.drop);
  return { resolved: combine(ownResolved(bank, deckOrigin(store)), inherited), inherited };
}

/**
 * The deck's bank, resolved.
 *
 * @returns the effective bank, what it inherits, the files and problems, and its own file.
 */
export function deckBank(workspace: Workspace, store: DeckStore): DeckBank {
  const walk: Walk = { workspace, seen: new Set(), files: [], problems: [] };
  const { resolved, inherited } = resolveDeck(walk, store);
  const path = deckBankFile(store);
  const own = existsSync(path) ? readFileSync(path, "utf8") : null;
  return { resolved, inherited, files: walk.files, problems: walk.problems, own, rev: own === null ? "none" : revisionOf(own) };
}

/**
 * A bank named the way `inherits` names one, resolved from a deck's view.
 *
 * @param ref - `pack`, `templates/<pack>` or `decks/<deck>`.
 * @returns the bank and the problems met.
 */
export function resolveBankRef(workspace: Workspace, store: DeckStore, ref: string): { resolved: ResolvedBank; problems: string[] } {
  const walk: Walk = { workspace, seen: new Set(), files: [], problems: [] };
  return { resolved: resolveRef(walk, ref, store), problems: walk.problems };
}

/**
 * Change the deck's own bank, once, against the revision the change was made on.
 *
 * @param ifRev - the revision the caller saw, or null to apply to whatever is there.
 * @returns the new revision, or 409 with the current one, or 422 with the reason.
 */
export async function changeDeckBank(workspace: Workspace, store: DeckStore, op: VocabOp, ifRev: string | null): Promise<{ ok: true; rev: string } | { ok: false; status: 409 | 422; reason: string }> {
  return withLock(join(store.stateDir, "locks", "vocabulary"), () => {
    const bank = deckBank(workspace, store);
    if (ifRev && ifRev !== bank.rev) return { ok: false, status: 409, reason: `the bank is at ${bank.rev}, not ${ifRev}` };
    const result = applyVocabOp(bank.own, bank.inherited, op, localDay());
    if (!result.ok) return { ok: false, status: 422, reason: result.reason };
    atomicWrite(deckBankFile(store), result.text);
    store.log({ worker: "vocabulary", op: "vocabulary", change: op.kind });
    return { ok: true, rev: revisionOf(result.text) };
  });
}

/** Write a deck's bank file whole (`folio vocab init` and `import`). */
export function writeDeckBank(store: DeckStore, text: string): void {
  atomicWrite(deckBankFile(store), text);
}

export const vocabEditsFile = (store: DeckStore): string => join(store.stateDir, "vocab-edits.jsonl");

/** The recorded user rewrites of a deck, oldest first. */
export function readVocabEdits(store: DeckStore): VocabEdit[] {
  const file = vocabEditsFile(store);
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as VocabEdit);
}

/** Whether a write-log record wrote a slot of a slide. */
function wroteSlot(record: { slide?: string; op?: string; ops?: PatchOp[] }, slide: string, slot: string): boolean {
  if (record.slide !== slide) return false;
  if (record.op === "new" || record.op === "paste") return true;
  return record.op === "patch" && !!record.ops?.some((o) => o.path.endsWith(`/props/${pointerToken(slot)}`) || o.path.endsWith("/props"));
}

/** Who last wrote a slot before the write of revision `skipRev`, from the deck's write log, newest day first. */
function lastWriter(store: DeckStore, slide: string, slot: string, skipRev: string): string | null {
  const dir = join(store.stateDir, "log");
  if (!existsSync(dir)) return null;
  for (const day of readdirSync(dir).filter((f) => f.endsWith(".jsonl")).sort().reverse().slice(0, 60)) {
    const records = readFileSync(join(dir, day), "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l) as { worker: string; rev?: string; slide?: string; op?: string; ops?: PatchOp[] });
    const found = records.reverse().find((r) => r.rev !== skipRev && wroteSlot(r, slide, slot));
    if (found) return found.worker;
  }
  return null;
}

/**
 * Record the text a user's save changed, one record per slot, a typing burst folded into one.
 *
 * @param rev - the revision the save wrote, so the log's own record of it is skipped.
 */
export async function recordUserEdits(workspace: Workspace, store: DeckStore, slide: string, before: SlideSpec, after: SlideSpec, rev: string, by = "user"): Promise<void> {
  const pack = workspace.packOf(store);
  const changes = pack ? changedTexts(before, after, pack.pack) : [];
  if (!changes.length) return;
  await withLock(join(store.stateDir, "locks", "vocab-edits"), () => {
    const at = new Date().toISOString();
    let records = readVocabEdits(store);
    for (const c of changes) records = foldEdit(records, { deck: basename(store.dir), slide, ...c, at, until: at, by, beforeBy: lastWriter(store, slide, c.slot, rev) });
    atomicWrite(vocabEditsFile(store), records.map((r) => `${JSON.stringify(r)}\n`).join(""));
  });
}
