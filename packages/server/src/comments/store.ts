/**
 * Comment files: `comments/<cid>.json` with its screenshots in `comments/<cid>/`,
 * one file per comment so the user and parallel workers never share a file. A
 * resolved comment moves to `comments/.archive/YYYY-MM-DD/`; nothing is deleted.
 * Unsent drafts live in `.folio/drafts/<user>/`, where workers never look.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { newCommentId, type FolioComment, type Mark } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import { atomicWrite, dayOf, formatJson, readJson, renameRetrying } from "../fsutil.js";

export interface Draft {
  id: string;
  deck: string;
  slide: string;
  slideRev: string;
  region: [number, number, number, number] | null;
  marks: Mark[];
  text: string;
  uploads: string[];
  updatedAt: string;
}

/** The comments folder of a deck. */
export function commentsDir(store: DeckStore): string {
  return join(store.dir, "comments");
}

/**
 * Where a comment's file is: live, or in a dated archive folder.
 *
 * @returns the path, or null when no such comment exists.
 */
export function commentPath(store: DeckStore, cid: string): string | null {
  const live = join(commentsDir(store), `${cid}.json`);
  if (existsSync(live)) return live;
  const archive = join(commentsDir(store), ".archive");
  if (!existsSync(archive)) return null;
  for (const day of readdirSync(archive)) {
    const p = join(archive, day, `${cid}.json`);
    if (existsSync(p)) return p;
  }
  return null;
}

/** Read one comment, live or archived. */
export function readComment(store: DeckStore, cid: string): FolioComment | null {
  const p = commentPath(store, cid);
  return p ? readJson<FolioComment | null>(p, null) : null;
}

/** Write a comment where it currently lives. */
export function writeComment(store: DeckStore, comment: FolioComment): void {
  atomicWrite(commentPath(store, comment.id) ?? join(commentsDir(store), `${comment.id}.json`), formatJson(comment));
}

/**
 * Every comment of a deck.
 *
 * @param archived - include resolved, archived comments.
 * @returns comments, oldest first.
 */
export function listComments(store: DeckStore, archived = false): FolioComment[] {
  const dir = commentsDir(store);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => join(dir, f));
  if (archived && existsSync(join(dir, ".archive"))) {
    for (const day of readdirSync(join(dir, ".archive")).filter((d) => !d.startsWith("."))) files.push(...readdirSync(join(dir, ".archive", day)).filter((f) => f.endsWith(".json")).map((f) => join(dir, ".archive", day, f)));
  }
  return files.map((f) => readJson<FolioComment | null>(f, null)).filter((c): c is FolioComment => !!c).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

/** A fresh comment id. */
export function freshCommentId(): string {
  return newCommentId(Date.now(), randomBytes(2).toString("hex"));
}

/**
 * Move a resolved comment and its screenshots into today's archive.
 *
 * A comment already archived (a second request for the same move) stays where
 * it is.
 *
 * @returns the archived comment path.
 */
export function archiveComment(store: DeckStore, cid: string): string {
  const from = join(commentsDir(store), `${cid}.json`);
  const already = existsSync(from) ? null : commentPath(store, cid);
  if (already) return already;
  const dayDir = join(commentsDir(store), ".archive", dayOf());
  mkdirSync(dayDir, { recursive: true });
  renameRetrying(from, join(dayDir, `${cid}.json`));
  if (existsSync(join(commentsDir(store), cid))) renameRetrying(join(commentsDir(store), cid), join(dayDir, cid));
  return join(dayDir, `${cid}.json`);
}

/**
 * Bring an archived comment back to the live folder.
 *
 * @returns true when it was archived and is now live.
 */
export function unarchiveComment(store: DeckStore, cid: string): boolean {
  const p = commentPath(store, cid);
  if (!p || dirname(p) === commentsDir(store)) return false;
  renameRetrying(p, join(commentsDir(store), `${cid}.json`));
  if (existsSync(join(dirname(p), cid))) renameRetrying(join(dirname(p), cid), join(commentsDir(store), cid));
  return true;
}

/** The folder of a comment's screenshots, live or archived. */
export function shotsDir(store: DeckStore, cid: string): string {
  const p = commentPath(store, cid);
  return join(p ? dirname(p) : commentsDir(store), cid);
}

/** The drafts folder of a user in a deck. */
function draftsDir(store: DeckStore, user: string): string {
  return join(store.stateDir, "drafts", user);
}

/** Every draft of a user in a deck. */
export function listDrafts(store: DeckStore, user: string): Draft[] {
  const dir = draftsDir(store, user);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => readJson<Draft | null>(join(dir, f), null)).filter((d): d is Draft => !!d);
}

/** Save a draft (called about once a second while the user writes). */
export function saveDraft(store: DeckStore, user: string, draft: Draft): void {
  atomicWrite(join(draftsDir(store, user), `${draft.id}.json`), formatJson(draft));
}

/**
 * Retire a draft: sent drafts and discarded ones move to the drafts archive.
 *
 * @returns true when the draft existed.
 */
export function retireDraft(store: DeckStore, user: string, id: string): boolean {
  const from = join(draftsDir(store, user), `${id}.json`);
  if (!existsSync(from)) return false;
  const to = join(draftsDir(store, user), ".archive", dayOf());
  mkdirSync(to, { recursive: true });
  renameRetrying(from, join(to, `${id}.json`));
  return true;
}

/** The user's read state across the workspace: messages seen per comment. */
export function readState(root: string, user: string): Record<string, number> {
  return readJson<Record<string, number>>(join(root, ".folio", "inbox", `${user}.json`), {});
}

/** Record that the user has seen a comment's messages up to `count`. */
export function markRead(root: string, user: string, seen: Record<string, number>): void {
  const state = readState(root, user);
  atomicWrite(join(root, ".folio", "inbox", `${user}.json`), formatJson({ ...state, ...seen }));
}
