/**
 * Comment search over the whole workspace: every deck, every comment live or
 * archived, answered as plain JSON rows for the HTTP route and the CLI.
 */
import { basename } from "node:path";
import { commentLink, searchComments, SEARCH_STATUSES, type CommentSearchQuery, type MessageHit } from "@folio/core";
import type { DeckStore } from "../deckstore.js";
import { toPosix } from "../posixpath.js";
import { listComments } from "./store.js";

export interface SearchRow {
  id: string;
  deck: string;
  deckTitle: string;
  token: string;
  slide: string;
  slots: string[];
  status: string;
  view: string;
  author: string;
  followers: string[];
  assignee: string | null;
  createdAt: string;
  updatedAt: string;
  hits: number;
  messages: MessageHit[];
  excerpt: string;
  url: string;
}

/**
 * Read a search query from URL parameters.
 *
 * @returns the query; throws naming an unknown status or an unreadable date.
 */
export function searchQueryOf(params: URLSearchParams): CommentSearchQuery {
  const get = (k: string) => params.get(k)?.trim() || undefined;
  const status = get("status")?.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = status?.filter((s) => !(SEARCH_STATUSES as readonly string[]).includes(s)) ?? [];
  if (unknown.length) throw new Error(`unknown status ${unknown.join(", ")}; use ${SEARCH_STATUSES.join(", ")}`);
  const since = get("since");
  if (since && Number.isNaN(Date.parse(since))) throw new Error(`since ${since} is not a date; use YYYY-MM-DD or an ISO time`);
  const limit = get("limit") ? Number(get("limit")) : undefined;
  if (limit !== undefined && !(limit > 0)) throw new Error(`limit ${get("limit")} is not a positive number`);
  return { text: get("q"), deck: get("deck"), slide: get("slide"), slot: get("slot"), status, author: get("author"), since, limit };
}

/**
 * Search every comment of the given decks.
 *
 * @param user - the user's name, for the board column.
 * @returns the ranked rows and how many matched before the limit; throws naming an unknown deck.
 */
export function searchWorkspace(stores: DeckStore[], q: CommentSearchQuery, user: string): { hits: SearchRow[]; total: number } {
  const deck = q.deck ? stores.find((s) => [s.token, basename(s.dir), s.deck.title].includes(q.deck!) || toPosix(s.dir).endsWith(`/${q.deck!.replace(/\/+$/, "")}`)) : undefined;
  if (q.deck && !deck) throw new Error(`no deck ${q.deck}; decks are ${stores.map((s) => basename(s.dir)).join(", ")}`);
  const records = (deck ? [deck] : stores).flatMap((store) => listComments(store, true).map((comment) => ({ comment, deckNames: [store.token, basename(store.dir), store.deck.title], store })));
  const all = searchComments(records, { ...q, deck: undefined, limit: Infinity }, user);
  const hits = all.slice(0, q.limit ?? 50).map(({ record, view, hits, messages }): SearchRow => {
    const { comment: c, store } = record as (typeof records)[number];
    return {
      id: c.id, deck: basename(store.dir), deckTitle: store.deck.title, token: store.token, slide: c.slide, slots: c.components.map((k) => k.slot),
      status: c.status, view, author: c.thread[0]?.author ?? user, followers: c.followers ?? [c.thread[0]?.author ?? user], assignee: c.assignee,
      createdAt: c.createdAt, updatedAt: c.updatedAt, hits, messages, excerpt: (c.thread[0]?.text ?? "").replace(/\s+/g, " ").trim().slice(0, 120), url: commentLink("/", store.token, c.slide, c.id),
    };
  });
  return { hits, total: all.length };
}
