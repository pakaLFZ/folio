/**
 * Region comments, pure part: the record, which slots a region covers, whose
 * turn it is, the default region of a sketch, comment links, and the
 * before/after steps of a thread.
 */
import type { Box, Layout } from "./pack.js";

export interface Mark {
  tool: "pen" | "rect" | "arrow";
  points: [number, number][];
}

export interface Shots {
  region: string;
  slide: string;
}

/** A file attached to a message, stored in the comment's folder. */
export interface Attachment {
  file: string;
  name: string;
  type: string;
  bytes: number;
}

export interface CommentMessage {
  author: string;
  at: string;
  text: string;
  slideRev?: string;
  shots?: Shots;
  attachments?: Attachment[];
  /** The questionnaire this message asks, with its status mirrored from `questions/<id>.json`. */
  question?: QuestionRef;
}

/** A questionnaire as a thread message carries it. */
export interface QuestionRef {
  id: string;
  status: "open" | "answered" | "withdrawn";
}

export interface ComponentSnapshot {
  slot: string;
  role: string;
  text?: string | null;
  figure?: string | null;
  hook?: { hook: string; inputs: unknown; phase?: string; lastRun?: unknown } | null;
  /** A shape slot's shape as the slide holds it. */
  shape?: unknown;
  /** A block slot's text, code or `{code, language}` as the slide holds it. */
  block?: unknown;
  overflow?: { lines: number; limit: number } | null;
}

export type CommentStatus = "open" | "answered" | "held" | "resolved";

export interface FolioComment {
  id: string;
  deck: string;
  slide: string;
  slideRev: string;
  region: Box;
  marks: Mark[];
  components: ComponentSnapshot[];
  shots: Shots | null;
  thread: CommentMessage[];
  status: CommentStatus;
  assignee: string | null;
  /** Who follows the thread: its new messages count as their unread ones. */
  followers?: string[];
  /** Queue order: lower comes first. Missing means the creation time in ms. */
  rank?: number;
  /** When the user cleared this resolved comment off the board; it stays archived and searchable. */
  clearedAt?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Whether two boxes overlap.
 *
 * @returns true when they share any area.
 */
export function boxesIntersect(a: Box, b: Box): boolean {
  return a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];
}

/**
 * The slots a region covers.
 *
 * @param region - `[x, y, w, h]` in canvas units.
 * @param layout - the slide's layout.
 * @returns slot names whose box intersects the region, in layout order.
 */
export function intersectingSlots(region: Box, layout: Layout): string[] {
  return Object.entries(layout.slots)
    .filter(([, slot]) => boxesIntersect(region, slot.box))
    .map(([name]) => name);
}

/**
 * Whose turn it is in a thread.
 *
 * @param thread - the messages, oldest first.
 * @param user - the name the user writes under.
 * @returns `agent` when the user wrote last or answered the questionnaire a
 *   worker asked last, `user` when a worker did otherwise.
 */
export function commentTurn(thread: CommentMessage[], user = "user"): "agent" | "user" {
  const last = thread[thread.length - 1];
  return !last || last.author === user || last.question?.status === "answered" ? "agent" : "user";
}

/**
 * The bounding box of a sketch, the default region when none was dragged.
 *
 * @param marks - pen strokes, rectangles and arrows.
 * @param pad - margin added on every side, in canvas units.
 * @returns the box, or null when there are no points.
 */
export function marksBounds(marks: Mark[], pad = 6): Box | null {
  const pts = marks.flatMap((m) => m.points);
  if (!pts.length) return null;
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const x = Math.min(...xs) - pad;
  const y = Math.min(...ys) - pad;
  return [x, y, Math.max(...xs) + pad - x, Math.max(...ys) + pad - y];
}

/**
 * The link that opens a comment where it was made.
 *
 * @param root - the server root, e.g. `/` or `http://localhost:4310/`.
 * @returns `<root><deck8>/?slide=<id>&comment=<cid>`.
 */
export function commentLink(root: string, deck: string, slide: string, cid: string): string {
  return `${root.replace(/\/?$/, "/")}${deck}/?slide=${encodeURIComponent(slide)}&comment=${encodeURIComponent(cid)}`;
}

/**
 * Read a comment link.
 *
 * @param url - a full URL or a path with query.
 * @returns deck token, slide and comment id, or null when it is not a comment link.
 */
export function parseCommentLink(url: string): { deck: string; slide: string; comment: string } | null {
  const u = new URL(url, "http://x/");
  const deck = /\/([0-9a-f]{8})\/?$/.exec(u.pathname)?.[1];
  const slide = u.searchParams.get("slide");
  const comment = u.searchParams.get("comment");
  return deck && slide && comment ? { deck, slide, comment } : null;
}

/**
 * The before/after steps of a thread: the shots taken when the comment was
 * made and with every reply that found the slide changed.
 *
 * @returns one step per distinct revision, oldest first.
 */
export function revisionSteps(comment: FolioComment): { rev: string; at: string; shots: Shots | null; author: string }[] {
  const steps = [{ rev: comment.slideRev, at: comment.createdAt, shots: comment.shots, author: comment.thread[0]?.author ?? "user" }];
  for (const m of comment.thread.slice(1)) {
    if (m.slideRev && m.shots && m.slideRev !== steps[steps.length - 1]!.rev) steps.push({ rev: m.slideRev, at: m.at, shots: m.shots, author: m.author });
  }
  return steps;
}

/**
 * A new comment id.
 *
 * @param now - the time.
 * @param random - a few random characters.
 * @returns `c` followed by base-36 time and the random part; sorts by time.
 */
export function newCommentId(now: number, random: string): string {
  return `c${now.toString(36)}${random}`;
}

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/**
 * A file name safe to store: letters, digits, dot, dash and underscore only.
 *
 * @param name - the uploaded file's name.
 * @returns at most 80 characters, never empty, never starting with a dot.
 */
export function safeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^\.+/, "").slice(-80);
  return cleaned || "file";
}

/**
 * Whether an attachment is shown as an image.
 *
 * @returns true for raster and SVG image types.
 */
export function isImageAttachment(a: Pick<Attachment, "type">): boolean {
  return /^image\/(png|jpeg|gif|webp|svg\+xml)$/.test(a.type);
}

/**
 * A comment's queue rank.
 *
 * @returns the stored rank, or the creation time in ms when none is stored.
 */
export function rankOf(comment: Pick<FolioComment, "rank" | "createdAt">): number {
  return comment.rank ?? Date.parse(comment.createdAt);
}

/**
 * The rank that puts a card between two neighbours.
 *
 * @param before - the rank of the card above, or undefined at the top.
 * @param after - the rank of the card below, or undefined at the bottom.
 * @returns a number strictly between them (one step beyond an end).
 */
export function rankBetween(before: number | undefined, after: number | undefined): number {
  if (before === undefined && after === undefined) return Date.now();
  if (before === undefined) return after! - 1000;
  if (after === undefined) return before + 1000;
  return (before + after) / 2;
}

/**
 * Add or remove a follower.
 *
 * @returns the follower list after the change, without duplicates.
 */
export function withFollower(followers: string[] | undefined, name: string, follow = true): string[] {
  const set = new Set(followers ?? []);
  if (follow) set.add(name);
  else set.delete(name);
  return [...set];
}
