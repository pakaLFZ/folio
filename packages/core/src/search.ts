/**
 * Comment search, pure part: every comment in any status, over the whole chat
 * (each message's text and its attachment names). Every term must occur in the
 * comment; hits rank by occurrences, then by recent activity.
 */
import type { CommentMessage, FolioComment } from "./comments.js";
import { viewOf } from "./inbox.js";

export const SEARCH_STATUSES = ["open", "answered", "held", "resolved", "archived", "queue", "progress", "review", "done"] as const;

export interface CommentSearchQuery {
  text?: string;
  deck?: string;
  slide?: string;
  slot?: string;
  status?: string[];
  author?: string;
  since?: string;
  limit?: number;
}

export interface SearchRecord {
  comment: FolioComment;
  deckNames: string[];
}

export interface MessageHit {
  index: number;
  author: string;
  at: string;
  hits: number;
  snippet: string;
}

export interface CommentHit {
  record: SearchRecord;
  view: ReturnType<typeof viewOf>;
  hits: number;
  messages: MessageHit[];
}

/**
 * The terms of a query: words, or `"quoted phrases"` kept whole.
 *
 * @returns lower-case terms, empty ones dropped.
 */
export function searchTerms(text: string | undefined): string[] {
  return [...(text ?? "").matchAll(/"([^"]*)"|(\S+)/g)].map((m) => (m[1] ?? m[2] ?? "").trim().toLowerCase()).filter(Boolean);
}

/**
 * Whether a comment is in one of the asked statuses.
 *
 * @param wanted - statuses or board columns; `archived` and `done` mean resolved.
 * @returns true when no status is asked or one matches.
 */
export function statusMatches(comment: FolioComment, wanted: string[] | undefined, user = "user"): boolean {
  if (!wanted?.length) return true;
  const own = new Set<string>([comment.status, viewOf(comment, user)]);
  if (comment.status === "resolved") own.add("archived");
  return wanted.some((s) => own.has(s.toLowerCase()));
}

/** How often a term occurs in a text. */
function occurrences(text: string, term: string): number {
  let n = 0;
  for (let i = text.indexOf(term); i >= 0; i = text.indexOf(term, i + term.length)) n += 1;
  return n;
}

/**
 * A short excerpt around the first match, every match in `[brackets]`.
 *
 * @param width - characters kept on each side of the first match.
 * @returns the excerpt on one line, with `…` where it was cut.
 */
export function searchSnippet(text: string, terms: string[], width = 40): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const lower = flat.toLowerCase();
  const found = terms.map((t) => ({ at: lower.indexOf(t), length: t.length })).filter((f) => f.at >= 0).sort((a, b) => a.at - b.at)[0] ?? { at: 0, length: width };
  const start = Math.max(0, found.at - width);
  const end = Math.min(flat.length, found.at + found.length + width);
  const pattern = new RegExp(terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gi");
  const marked = terms.length ? flat.slice(start, end).replace(pattern, (m) => `[${m}]`) : flat.slice(start, end);
  return `${start > 0 ? "…" : ""}${marked}${end < flat.length ? "…" : ""}`;
}

/**
 * Match one message: its text and its attachment names.
 *
 * @returns the occurrences, and a snippet from the text or else the first matching file name.
 */
function matchMessage(m: CommentMessage, terms: string[]): { hits: number; snippet: string } {
  const count = (s: string) => terms.reduce((n, t) => n + occurrences(s.toLowerCase(), t), 0);
  const names = (m.attachments ?? []).map((a) => a.name);
  const hits = count(m.text) + names.reduce((n, name) => n + count(name), 0);
  const named = names.find((name) => count(name) > 0);
  return { hits, snippet: count(m.text) || !named ? searchSnippet(m.text, terms) : `attached ${searchSnippet(named, terms)}` };
}

/**
 * Whether a record passes the filters other than the text.
 *
 * @returns true when deck, slide, slot, status, author and since all match.
 */
function passesFilters(r: SearchRecord, q: CommentSearchQuery, user: string): boolean {
  const c = r.comment;
  if (q.deck && !r.deckNames.includes(q.deck)) return false;
  if (q.slide && c.slide !== q.slide) return false;
  if (q.slot && !c.components.some((k) => k.slot === q.slot)) return false;
  if (q.author && !c.thread.some((m) => m.author === q.author)) return false;
  if (q.since && Date.parse(c.updatedAt) < Date.parse(q.since)) return false;
  return statusMatches(c, q.status, user);
}

/**
 * Match one comment against the terms.
 *
 * @returns the hit, or null when some term occurs nowhere in the chat.
 */
function matchComment(r: SearchRecord, terms: string[], user: string): CommentHit | null {
  const whole = r.comment.thread.flatMap((m) => [m.text, ...(m.attachments ?? []).map((a) => a.name)]).join("\n").toLowerCase();
  if (!terms.every((t) => whole.includes(t))) return null;
  const messages = r.comment.thread
    .map((m, index) => ({ index, author: m.author, at: m.at, ...matchMessage(m, terms) }))
    .filter((m) => m.hits > 0);
  return { record: r, view: viewOf(r.comment, user), hits: messages.reduce((n, m) => n + m.hits, 0), messages };
}

/**
 * Search comments.
 *
 * @param records - every comment with the names its deck answers to.
 * @param q - the query text and filters; an empty text lists what passes the filters.
 * @param user - the user's name, for the board column.
 * @returns hits by occurrences, then newest activity first, at most `limit`.
 */
export function searchComments(records: SearchRecord[], q: CommentSearchQuery, user = "user"): CommentHit[] {
  const terms = searchTerms(q.text);
  return records
    .filter((r) => passesFilters(r, q, user))
    .map((r) => matchComment(r, terms, user))
    .filter((h): h is CommentHit => !!h)
    .sort((a, b) => b.hits - a.hits || (a.record.comment.updatedAt < b.record.comment.updatedAt ? 1 : a.record.comment.updatedAt > b.record.comment.updatedAt ? -1 : 0))
    .slice(0, q.limit ?? 50);
}
