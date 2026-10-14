/**
 * The vocabulary bank, pure part: the user's words for slide text, kept as
 * Markdown. Only the first `Use | Never | Since` table is parsed; every other
 * section is text. An optional front matter names what the bank inherits
 * (`pack`, `templates/<pack>`, `decks/<deck>`) and what it drops. Banks
 * resolve nearest first: the nearest entry of a name and the nearest section
 * of a heading win.
 */

export interface VocabEntry {
  use: string;
  never: string;
  since: string;
}

export interface VocabSection {
  heading: string;
  lines: string[];
}

export interface VocabBank {
  /** null when the file names none: a deck then inherits `[pack]`, a pack nothing. */
  inherits: string[] | null;
  drop: string[];
  preamble: string[];
  wordsHeading: string;
  entries: VocabEntry[];
  /** Every `## ` section in file order, the words section without its table. */
  sections: VocabSection[];
}

export type OriginEntry = VocabEntry & { origin: string };

export interface ResolvedBank {
  preamble: string[];
  wordsHeading: string;
  entries: OriginEntry[];
  sections: (VocabSection & { origin: string })[];
}

export const WORDS_HEADING = "Words to use, and their replacements";
export const TABLE_HEADER = ["use", "never", "since"];
export const EMPTY_RESOLVED: ResolvedBank = { preamble: [], wordsHeading: WORDS_HEADING, entries: [], sections: [] };

/** The name of an entry, its Use cell with case, spacing and Unicode forms folded. */
export const entryKey = (use: string): string => use.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** Whether a section is the dated log of the user's edits, never sent to an agent with the rules. */
export const isEditLog = (heading: string): boolean => /^status\b/i.test(heading.trim()) || /\blog\b/i.test(heading);

/**
 * Split on a separator outside round brackets and quotes.
 *
 * @returns the trimmed, non-empty parts.
 */
export function splitOutside(text: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let quote = "";
  let current = "";
  for (const ch of text) {
    if (quote) quote = ch === quote ? "" : quote;
    else if (ch === '"') quote = ch;
    else if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === separator && depth === 0 && !quote) {
      parts.push(current);
      current = "";
    } else current += ch;
  }
  parts.push(current);
  return parts.map((p) => p.trim()).filter(Boolean);
}

/** The cells of a Markdown table row, `\|` kept as a literal bar. */
export function tableCells(line: string): string[] | null {
  const trimmed = line.trim();
  if (!trimmed.startsWith("|")) return null;
  const cells = trimmed.replace(/^\||\|$/g, "").split(/(?<!\\)\|/);
  return cells.map((c) => c.trim().replace(/\\\|/g, "|"));
}

/** A table row from cells, bars escaped. */
export const tableRow = (cells: string[]): string => `| ${cells.map((c) => c.replace(/\|/g, "\\|")).join(" | ")} |`;

const isSeparatorRow = (cells: string[]): boolean => cells.every((c) => /^:?-{1,}:?$/.test(c));
const isHeaderRow = (cells: string[] | null): boolean => !!cells && cells.length >= 3 && cells.slice(0, 3).map((c) => c.toLowerCase()).join("|") === TABLE_HEADER.join("|");

/** `[a, "b, c"]` as a list. */
function parseList(value: string): string[] {
  const inner = value.trim().replace(/^\[|\]$/g, "");
  return splitOutside(inner, ",").map((v) => v.replace(/^"(.*)"$/, "$1"));
}

/**
 * Split off the front matter.
 *
 * @returns its key/value lines and the body's lines.
 */
export function splitFrontMatter(text: string): { front: Record<string, string> | null; body: string[] } {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return { front: null, body: lines };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end < 0) return { front: null, body: lines };
  const front = Object.fromEntries(lines.slice(1, end).map((l) => l.match(/^(\w+):\s*(.*)$/)).filter((m): m is RegExpMatchArray => !!m).map((m) => [m[1]!, m[2]!]));
  return { front, body: lines.slice(end + 1) };
}

/** Where the word table sits in a list of lines: its header row and the line after its last row. */
export function findTable(lines: string[]): { header: number; end: number } | null {
  const header = lines.findIndex((l) => isHeaderRow(tableCells(l)));
  if (header < 0) return null;
  let end = header + 1;
  while (end < lines.length && tableCells(lines[end]!)) end += 1;
  return { header, end };
}

/** Parse the table rows between header and end. */
function tableEntries(lines: string[], table: { header: number; end: number }): VocabEntry[] {
  return lines
    .slice(table.header + 1, table.end)
    .map((l) => tableCells(l)!)
    .filter((cells) => !isSeparatorRow(cells) && cells.some(Boolean))
    .map(([use = "", never = "", since = ""]) => ({ use, never, since }));
}

/** Lines without leading and trailing blank lines. */
export function trimLines(lines: string[]): string[] {
  const text = lines.join("\n").trim();
  return text ? text.split("\n") : [];
}

/** Group lines under their `## ` headings; lines before the first are the preamble. */
function sectionsOf(lines: string[]): { preamble: string[]; sections: VocabSection[] } {
  const preamble: string[] = [];
  const sections: VocabSection[] = [];
  for (const line of lines) {
    const heading = /^##\s+(.*)$/.exec(line);
    if (heading) sections.push({ heading: heading[1]!.trim(), lines: [] });
    else (sections.at(-1)?.lines ?? preamble).push(line);
  }
  return { preamble: trimLines(preamble), sections: sections.map((s) => ({ heading: s.heading, lines: trimLines(s.lines) })) };
}

/**
 * Parse a bank file.
 *
 * @param text - the Markdown.
 * @returns its front matter values, entries and sections.
 */
export function parseBank(text: string): VocabBank {
  const { front, body } = splitFrontMatter(text);
  const { preamble, sections } = sectionsOf(body);
  let wordsHeading = WORDS_HEADING;
  let entries: VocabEntry[] = [];
  for (const section of sections) {
    const table = findTable(section.lines);
    if (!table) continue;
    wordsHeading = section.heading;
    entries = tableEntries(section.lines, table);
    section.lines = trimLines([...section.lines.slice(0, table.header), ...section.lines.slice(table.end)]);
    break;
  }
  return { inherits: front?.inherits !== undefined ? parseList(front.inherits) : null, drop: front?.drop ? parseList(front.drop) : [], preamble, wordsHeading, entries, sections };
}

/** A bank's own content, with every entry and section marked by its origin. */
export function ownResolved(bank: VocabBank, origin: string): ResolvedBank {
  return {
    preamble: bank.preamble,
    wordsHeading: bank.wordsHeading,
    entries: bank.entries.map((e) => ({ ...e, origin })),
    sections: bank.sections.map((s) => ({ ...s, origin })),
  };
}

/** Two resolved banks as one: the near bank's entries and sections win by name; an empty near section does not hide a far one. */
export function combine(near: ResolvedBank, far: ResolvedBank): ResolvedBank {
  const names = new Set(near.entries.map((e) => entryKey(e.use)));
  const farHeadings = new Set(far.sections.map((s) => s.heading.toLowerCase()));
  const nearSections = near.sections.filter((s) => s.lines.length || !farHeadings.has(s.heading.toLowerCase()));
  const headings = new Set(nearSections.map((s) => s.heading.toLowerCase()));
  return {
    preamble: near.preamble.length ? near.preamble : far.preamble,
    wordsHeading: near.entries.length || !far.entries.length ? near.wordsHeading : far.wordsHeading,
    entries: [...near.entries, ...far.entries.filter((e) => !names.has(entryKey(e.use)))],
    sections: [...nearSections, ...far.sections.filter((s) => !headings.has(s.heading.toLowerCase()))],
  };
}

/** Remove what `drop` names: an entry by its Use cell, or one Never term of an entry. */
export function applyDrop(bank: ResolvedBank, drop: string[]): ResolvedBank {
  const keys = new Set(drop.map(entryKey));
  const entries = bank.entries.filter((e) => !keys.has(entryKey(e.use))).flatMap((e) => {
    const terms = splitOutside(e.never, ",");
    const kept = terms.filter((t) => !keys.has(entryKey(t)));
    if (kept.length === terms.length) return [e];
    return kept.length ? [{ ...e, never: kept.join(", ") }] : [];
  });
  return { ...bank, entries };
}

/**
 * Resolve a bank over what it inherits.
 *
 * @param own - the bank and its origin label.
 * @param inherited - each inherited bank already resolved, nearest first.
 * @returns the effective bank.
 */
export function resolveBank(own: { bank: VocabBank; origin: string }, inherited: ResolvedBank[]): ResolvedBank {
  const far = applyDrop(inherited.reduce(combine, EMPTY_RESOLVED), own.bank.drop);
  return combine(ownResolved(own.bank, own.origin), far);
}

/**
 * Whether a Never term is a description rather than a word: wholly in
 * brackets, starting with "any ", holding a bracket, or holding a spaced slash.
 */
export function isDescriptiveTerm(term: string): boolean {
  return /^\(.*\)$/.test(term) || /^any\s/i.test(term) || /[()]/.test(term) || /\s\/|\/\s/.test(term);
}

/** The matchable terms of a Never cell. */
export function neverTerms(never: string): string[] {
  return splitOutside(never, ",").filter((t) => !isDescriptiveTerm(t));
}

const fold = (text: string): string => text.normalize("NFKC").toLowerCase();
const escapeRegex = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Whether a term occurs in text as a whole word, case and Unicode forms folded, spaces as any run of spaces. */
export function containsTerm(text: string, term: string): boolean {
  const body = fold(term).trim().split(/\s+/).map(escapeRegex).join("\\s+");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])`, "u").test(fold(text));
}

/**
 * The Never terms a text uses.
 *
 * @param text - plain text (markup already removed).
 * @param entries - the resolved entries.
 * @returns one hit per term found, with its entry.
 */
export function vocabHits<E extends VocabEntry>(text: string, entries: E[]): { term: string; entry: E }[] {
  return entries.flatMap((entry) => neverTerms(entry.never).filter((term) => containsTerm(text, term)).map((term) => ({ term, entry })));
}

/**
 * The bank as Markdown.
 *
 * @param bank - resolved.
 * @param options - `origins` adds an Origin column; `log` keeps the edit log;
 *   `level` is the title's heading level (sections one below); `title: false`
 *   leaves the title out.
 * @returns the text, without front matter.
 */
export function renderBank(bank: ResolvedBank, options: { origins?: boolean; log?: boolean; level?: number; title?: boolean } = {}): string {
  const h = "#".repeat(options.level ?? 1);
  const header = options.origins ? ["Use", "Never", "Since", "Origin"] : ["Use", "Never", "Since"];
  const rows = bank.entries.map((e) => tableRow(options.origins ? [e.use, e.never, e.since, e.origin] : [e.use, e.never, e.since]));
  const words = bank.sections.find((s) => s.heading === bank.wordsHeading);
  const title = options.title === false ? [] : [`${h} Vocabulary bank`, ""];
  const out = [...title, ...bank.preamble.filter((l) => !/^#\s/.test(l)), "", `${h}# ${bank.wordsHeading}`, "", ...(words?.lines.length ? [...words.lines, ""] : []), tableRow(header), `|${header.map(() => "---").join("|")}|`, ...rows];
  for (const s of bank.sections) {
    if (s === words || (!options.log && isEditLog(s.heading))) continue;
    out.push("", `${h}# ${s.heading}`, "", ...s.lines);
  }
  return `${out.join("\n").replace(/\n{3,}/g, "\n\n").trim()}\n`;
}
