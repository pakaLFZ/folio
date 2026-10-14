/**
 * The comment inbox, pure part: one index row per comment across every deck,
 * the views, unread state, and filtering.
 */
import { commentTurn, rankOf, type FolioComment } from "./comments.js";

/** The board's columns, left to right, then the user's drafts. */
export type InboxView = "queue" | "progress" | "review" | "held" | "done" | "drafts";
export const BOARD_COLUMNS = ["queue", "progress", "review", "held", "done"] as const;

export interface InboxRow {
  id: string;
  deck: string;
  deckTitle: string;
  slide: string;
  slots: string[];
  roles: string[];
  status: FolioComment["status"] | "draft";
  view: InboxView;
  turn: "agent" | "user";
  lastMessage: string;
  lastAuthor: string;
  authors: string[];
  assignee: string | null;
  rank: number;
  updatedAt: string;
  createdAt: string;
  unread: number;
  following: boolean;
  followers: string[];
  orphaned: string | null;
  text: string;
}

/** Messages the user has seen, per comment id. */
export type ReadState = Record<string, number>;

/**
 * Which board column a comment belongs to.
 *
 * @returns `done` once resolved, `held` when parked, `review` when a worker
 *   replied last or marked it answered, `progress` when a worker claimed it,
 *   `queue` otherwise.
 */
export function viewOf(comment: FolioComment, user = "user"): InboxView {
  if (comment.status === "resolved") return "done";
  if (comment.status === "held") return "held";
  if (comment.status === "answered" || commentTurn(comment.thread, user) === "user") return "review";
  return comment.assignee ? "progress" : "queue";
}

/** Whether the board lists a comment: every one but a resolved comment the user cleared off it. */
export function onBoard(comment: FolioComment): boolean {
  return !(comment.status === "resolved" && comment.clearedAt);
}

/**
 * Whether "Clear all" on a column may still clear a comment: it is on the
 * board and still in that column (it may have moved since the user looked).
 */
export function clearable(comment: FolioComment, column: InboxView, user = "user"): boolean {
  return onBoard(comment) && viewOf(comment, user) === column;
}

/**
 * Build the inbox index.
 *
 * @param comments - every comment with its deck title and orphan reason.
 * @param read - the user's read state.
 * @param user - the user's name.
 * @returns one row per comment on the board, newest activity first.
 */
export function inboxIndex(comments: { comment: FolioComment; deckTitle: string; orphaned: string | null }[], read: ReadState, user = "user"): InboxRow[] {
  return comments
    .filter(({ comment }) => onBoard(comment))
    .map(({ comment: c, deckTitle, orphaned }) => {
      const last = c.thread[c.thread.length - 1];
      const unread = c.thread.slice(read[c.id] ?? 0).filter((m) => m.author !== user).length;
      return {
        id: c.id, deck: c.deck, deckTitle, slide: c.slide,
        slots: c.components.map((k) => k.slot), roles: [...new Set(c.components.map((k) => k.role))],
        status: c.status, view: viewOf(c, user), turn: commentTurn(c.thread, user),
        lastMessage: last?.text ?? "", lastAuthor: last?.author ?? user,
        authors: [...new Set(c.thread.map((m) => m.author))], assignee: c.assignee, rank: rankOf(c),
        updatedAt: c.updatedAt, createdAt: c.createdAt, unread, orphaned,
        following: (c.followers ?? [c.thread[0]?.author ?? user]).includes(user), followers: c.followers ?? [c.thread[0]?.author ?? user],
        text: c.thread.map((m) => m.text).join("\n").toLowerCase(),
      };
    })
    .sort(boardOrder);
}

/**
 * The order of cards: queue and in-progress cards by rank, the rest newest first.
 *
 * @returns a comparator result.
 */
export function boardOrder(a: Pick<InboxRow, "view" | "rank" | "updatedAt">, b: Pick<InboxRow, "view" | "rank" | "updatedAt">): number {
  const ranked = (v: InboxView) => v === "queue" || v === "progress";
  if (ranked(a.view) && ranked(b.view)) return a.rank - b.rank;
  return a.updatedAt < b.updatedAt ? 1 : -1;
}

/**
 * Comments in the order agents work them: the board's columns left to right
 * (Queue, In progress, Review, Held, Done), each in its board order, so the
 * Queue comes top first as `folio comment next` claims it.
 *
 * @returns a new array; the input is not changed.
 */
export function executionOrder<C extends FolioComment>(comments: C[], user = "user"): C[] {
  const column = (v: InboxView) => BOARD_COLUMNS.indexOf(v as (typeof BOARD_COLUMNS)[number]);
  return comments
    .map((comment) => ({ comment, view: viewOf(comment, user), rank: rankOf(comment), updatedAt: comment.updatedAt }))
    .sort((a, b) => column(a.view) - column(b.view) || boardOrder(a, b))
    .map((k) => k.comment);
}

export interface InboxQuery {
  view?: InboxView | "all" | "open" | "board";
  deck?: string;
  slide?: string;
  role?: string;
  author?: string;
  olderThanDays?: number;
  newerThanDays?: number;
  search?: string;
  following?: boolean | string;
}

/**
 * Filter the index.
 *
 * @param rows - from `inboxIndex`.
 * @param q - the filters; `open` is every column but done, `board` every column.
 * @param now - the time, for the age filters.
 * @returns the matching rows, order kept.
 */
export function filterInbox(rows: InboxRow[], q: InboxQuery, now = Date.now()): InboxRow[] {
  const day = 86_400_000;
  const needle = q.search?.trim().toLowerCase();
  return rows.filter((r) => {
    if (q.view === "open" ? r.view === "done" || r.view === "drafts" : q.view === "board" ? r.view === "drafts" : q.view && q.view !== "all" && r.view !== q.view) return false;
    if ((q.deck && r.deck !== q.deck && r.deckTitle !== q.deck) || (q.slide && r.slide !== q.slide)) return false;
    if ((q.role && !r.roles.includes(q.role)) || (q.author && !r.authors.includes(q.author))) return false;
    if ((q.following === true || q.following === "true" || q.following === "1") && !r.following) return false;
    const age = (now - Date.parse(r.updatedAt)) / day;
    if ((q.olderThanDays !== undefined && age < q.olderThanDays) || (q.newerThanDays !== undefined && age > q.newerThanDays)) return false;
    return !needle || r.text.includes(needle) || r.slots.some((s) => s.includes(needle));
  });
}

/**
 * Count rows per view.
 *
 * @returns the number of rows in each view.
 */
export function inboxCounts(rows: InboxRow[]): Record<InboxView, number> {
  const out: Record<InboxView, number> = { queue: 0, progress: 0, review: 0, held: 0, done: 0, drafts: 0 };
  for (const r of rows) out[r.view] += 1;
  return out;
}
