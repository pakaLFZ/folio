/**
 * What `folio watch` reports: the things the user did that an agent should act
 * on, found by comparing what was seen before with what is there now, and the
 * one line each is printed as. Only the user's own actions count.
 */
import type { FolioComment } from "./comments.js";
import type { Questionnaire } from "./questions.js";
import type { ViewingTab } from "./viewing.js";

export type WatchKind = "comment" | "message" | "reopened" | "held" | "answers" | "viewing";
export type WatchTopic = "comments" | "answers" | "viewing";

export const WATCH_TOPICS: readonly WatchTopic[] = ["comments", "answers", "viewing"];
export const DEFAULT_WATCH_TOPICS: readonly WatchTopic[] = ["comments", "answers"];
export const WATCH_TEXT_LIMIT = 200;

export interface WatchEvent {
  at: string;
  kind: WatchKind;
  id: string;
  /** The workspace-relative deck folder, e.g. `decks/example`. */
  deck: string;
  slide: string | null;
  slots: string[];
  author: string;
  text: string;
  /** The command that prints it in full. */
  read: string;
}

/** What was last seen of a comment: enough to tell what is new. */
export interface CommentSeen {
  messages: number;
  status: FolioComment["status"];
}

/**
 * Parse `--for`.
 *
 * @returns the topics; throws naming the unknown one and the allowed ones.
 */
export function parseWatchTopics(value: string | undefined): WatchTopic[] {
  if (!value) return [...DEFAULT_WATCH_TOPICS];
  const topics = value.split(",").map((t) => t.trim()).filter(Boolean);
  const unknown = topics.find((t) => !WATCH_TOPICS.includes(t as WatchTopic));
  if (unknown) throw new Error(`--for ${unknown} is not a watch topic; use any of ${WATCH_TOPICS.join(",")}`);
  return topics as WatchTopic[];
}

/** Text cut to the line's limit, on one line. */
export function clipWatchText(text: string, limit = WATCH_TEXT_LIMIT): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > limit ? `${flat.slice(0, limit - 3)}...` : flat;
}

const slotsOf = (c: FolioComment) => c.components.map((k) => k.slot);

function commentEvent(c: FolioComment, deck: string, kind: WatchKind, at: string, author: string, text: string): WatchEvent {
  return { at, kind, id: c.id, deck, slide: c.slide, slots: slotsOf(c), author, text: clipWatchText(text), read: `folio comment show ${c.id}` };
}

/**
 * The user's actions on a comment since it was last seen.
 *
 * @param before - what was seen, or undefined for a comment not seen yet.
 * @param user - the workspace's user; nobody else's messages count.
 * @returns the events, oldest first: a new comment, each new message, then a reopen or a hold.
 */
export function commentEvents(before: CommentSeen | undefined, after: FolioComment, deck: string, user: string): WatchEvent[] {
  const from = before?.messages ?? 0;
  const fresh = after.thread.slice(from).map((m, i) => ({ m, index: from + i })).filter(({ m }) => m.author === user);
  const out = fresh.map(({ m, index }) => commentEvent(after, deck, index === 0 ? "comment" : "message", m.at, m.author, m.text));
  if (!before || fresh.length || before.status === after.status) return out;
  const last = after.thread.at(-1)?.text ?? "";
  if (after.status === "open") out.push(commentEvent(after, deck, "reopened", after.updatedAt, user, last));
  if (after.status === "held") out.push(commentEvent(after, deck, "held", after.updatedAt, user, last));
  return out;
}

/**
 * The user's messages after a time, for `--since`.
 *
 * @returns one event per message (or the comment itself) by the user after `since`.
 */
export function commentEventsSince(c: FolioComment, deck: string, user: string, since: string): WatchEvent[] {
  return c.thread.flatMap((m, index) => (m.author === user && m.at > since ? [commentEvent(c, deck, index === 0 ? "comment" : "message", m.at, m.author, m.text)] : []));
}

/** A questionnaire's answers in a line: `framing=Numbers; keep=a,b`. */
function answersText(q: Questionnaire): string {
  const one = (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v));
  const values = Object.entries(q.answers?.values ?? {}).map(([k, v]) => `${k}=${Array.isArray(v) ? v.map(one).join(",") : one(v)}`);
  return `${q.title}: ${values.join("; ") || "no answers"}`;
}

/**
 * A questionnaire the user has submitted since `before` (its last seen `updatedAt`).
 *
 * @returns the event, or null when nothing new was submitted by the user.
 */
export function answersEvent(beforeUpdatedAt: string | undefined, q: Questionnaire, deck: string, user: string): WatchEvent | null {
  if (q.status !== "answered" || !q.answers || q.answers.by !== user || beforeUpdatedAt === q.updatedAt) return null;
  return { at: q.answers.at, kind: "answers", id: q.id, deck, slide: q.slide ?? null, slots: [], author: user, text: clipWatchText(answersText(q)), read: `folio answers ${deck} ${q.id}` };
}

/**
 * The user moved to another deck or slide.
 *
 * @param before - the top tab last seen, or null.
 * @returns the event, or null when the deck and slide are the same.
 */
export function viewingEvent(before: ViewingTab | null, now: ViewingTab | null, user: string, at: string): WatchEvent | null {
  if (!now || (before && before.deck === now.deck && before.slide?.id === now.slide?.id)) return null;
  const where = now.slide ? `${now.slide.id}, ${now.slide.position} of ${now.slide.of}${now.slide.title ? ` "${now.slide.title}"` : ""}` : "no slide";
  return { at, kind: "viewing", id: now.tab, deck: now.deck, slide: now.slide?.id ?? null, slots: now.selection.slot ? [now.selection.slot] : [], author: user, text: clipWatchText(`now on ${where}`), read: "folio viewing" };
}

/** The event's topic, for `--for`. */
export function watchTopicOf(kind: WatchKind): WatchTopic {
  return kind === "answers" ? "answers" : kind === "viewing" ? "viewing" : "comments";
}

/**
 * The line `folio watch` prints.
 *
 * @returns one line, without the newline.
 */
export function watchLine(e: WatchEvent, json = false): string {
  if (json) return JSON.stringify(e);
  const slots = e.slots.length ? e.slots.join(", ") : "whole slide";
  return `${e.at} ${e.kind} ${e.id} ${e.deck} ${e.slide ?? "-"} [${slots}] ${e.author}: ${JSON.stringify(e.text)} -> ${e.read}`;
}
