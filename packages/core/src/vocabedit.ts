/**
 * Edits of a vocabulary bank file as text: a row added, replaced or removed,
 * the front matter's `inherits` and `drop`, one section's lines. Everything
 * else in the file is kept byte for byte, so the bank stays the user's
 * Markdown.
 */
import { entryKey, findTable, isEditLog, parseBank, splitFrontMatter, tableCells, tableRow, trimLines, WORDS_HEADING, type VocabEntry } from "./vocabulary.js";

const quoteItem = (item: string): string => (/[,[\]"]/.test(item) ? `"${item.replace(/"/g, "'")}"` : item);
const formatList = (items: string[]): string => `[${items.map(quoteItem).join(", ")}]`;

/** A new deck bank: front matter, a title, an empty word table and an empty edit log. */
export function newBankText(inherits: string[] = ["pack"]): string {
  return [
    "---",
    `inherits: ${formatList(inherits)}`,
    "---",
    "# Vocabulary bank",
    "",
    "The user's words and phrasing for this deck's slide text. Read it before writing any slide text; after the user edits a slide's text, log what changed (`folio vocab edits`) and add the rule here.",
    "",
    `## ${WORDS_HEADING}`,
    "",
    tableRow(["Use", "Never", "Since"]),
    "|---|---|---|",
    "",
    "## Status (log of the user's edits)",
    "",
  ].join("\n");
}

/** Split a file into its front matter lines (with fences) and body lines. */
function partsOf(text: string): { front: string[]; body: string[] } {
  const { front, body } = splitFrontMatter(text);
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  return { front: front ? lines.slice(0, lines.length - body.length) : [], body };
}

const join = (front: string[], body: string[]): string => [...front, ...body].join("\n");

/**
 * Set front matter keys, keeping every other key.
 *
 * @param values - lists to write; an empty `drop` removes the key.
 */
export function setFrontMatter(text: string, values: { inherits?: string[]; drop?: string[] }): string {
  const { front, body } = partsOf(text);
  const lines = front.length ? front.slice(1, -1) : [];
  for (const [key, list] of Object.entries(values)) {
    const at = lines.findIndex((l) => l.startsWith(`${key}:`));
    const line = `${key}: ${formatList(list)}`;
    if (key === "drop" && !list.length) {
      if (at >= 0) lines.splice(at, 1);
    } else if (at >= 0) lines[at] = line;
    else lines.push(line);
  }
  return join(lines.length ? ["---", ...lines, "---"] : [], body);
}

/** Add an item to the front matter's `drop`, once. */
export function addDrop(text: string, item: string): string {
  const drop = parseBank(text).drop;
  return drop.some((d) => entryKey(d) === entryKey(item)) ? text : setFrontMatter(text, { drop: [...drop, item] });
}

/** The body lines with a word table, made after the preamble when there is none. */
function withTable(body: string[]): string[] {
  if (findTable(body)) return body;
  const first = body.findIndex((l) => /^##\s/.test(l));
  const section = [`## ${WORDS_HEADING}`, "", tableRow(["Use", "Never", "Since"]), "|---|---|---|", ""];
  return first < 0 ? [...trimLines(body), "", ...section] : [...body.slice(0, first), ...section, ...body.slice(first)];
}

/** The line index of the row named `key` in the table, or -1. */
function rowIndex(body: string[], key: string): number {
  const table = findTable(body)!;
  for (let i = table.header + 2; i < table.end; i += 1) if (entryKey(tableCells(body[i]!)?.[0] ?? "") === entryKey(key)) return i;
  return -1;
}

/**
 * Write one row of the word table.
 *
 * @param entry - the row.
 * @param replace - the Use cell of the row it replaces; by default the entry's own.
 * @returns the text with that row replaced in place, or appended after the last row.
 */
export function upsertRow(text: string, entry: VocabEntry, replace = entry.use): string {
  const { front, body: raw } = partsOf(text);
  const body = withTable(raw);
  const at = rowIndex(body, replace);
  const line = tableRow([entry.use, entry.never, entry.since]);
  if (at >= 0) body[at] = line;
  else body.splice(findTable(body)!.end, 0, line);
  return join(front, body);
}

/**
 * Remove the row named `use`.
 *
 * @returns the text, unchanged when no row has that name.
 */
export function removeRow(text: string, use: string): string {
  const { front, body } = partsOf(text);
  if (!findTable(body)) return text;
  const at = rowIndex(body, use);
  if (at >= 0) body.splice(at, 1);
  return join(front, body);
}

/**
 * Set one section's lines, keeping its heading.
 *
 * @param heading - the `## ` heading, matched without case.
 * @param lines - the new lines.
 * @returns the text; a missing section is added before the edit log, or at the end.
 */
export function setSection(text: string, heading: string, lines: string[]): string {
  const { front, body } = partsOf(text);
  const headingAt = (match: (h: string) => boolean) => body.findIndex((l) => /^##\s/.test(l) && match(l.replace(/^##\s+/, "").trim()));
  const at = headingAt((h) => h.toLowerCase() === heading.trim().toLowerCase());
  const block = [`## ${heading.trim()}`, "", ...trimLines(lines), ""];
  if (at >= 0) {
    const next = body.findIndex((l, i) => i > at && /^##\s/.test(l));
    const end = next < 0 ? body.length : next;
    const table = findTable(body.slice(at, end));
    const kept = table ? ["", ...body.slice(at + table.header, at + table.end)] : [];
    body.splice(at, end - at, ...block.slice(0, -1), ...kept, "");
  } else {
    const log = headingAt(isEditLog);
    body.splice(log < 0 ? body.length : log, 0, ...(log < 0 ? ["", ...block] : block));
  }
  return join(front, body);
}
