/**
 * Inbox data in the browser: rows across every deck, kept live, with the
 * filter held in the URL so Back restores the list as it was.
 */
import { useEffect, useState } from "react";
import type { InboxRow, InboxView } from "@folio/core";
import { call } from "../api";
import { at, boot } from "../boot";
import { subscribe } from "../stream/client";

/**
 * Send a move to the server: to Done this resolves the comment, the same
 * action the Comments tab's hover Resolve icon and dragging a card to Done
 * perform (`CommentService.move`).
 *
 * @param row - the card.
 * @param column - its new column.
 * @param rank - its new queue rank, if it changes.
 */
export function moveCard(row: InboxRow, column: "queue" | "held" | "done", rank?: number): Promise<unknown> {
  return call("api/inbox/move", { method: "POST", json: { deck: row.deck, id: row.id, column, ...(rank !== undefined ? { rank } : {}) } });
}

export interface InboxData {
  rows: InboxRow[];
  counts: Record<InboxView, number>;
  unread: number;
}

export const FILTER_KEYS = ["view", "deck", "search", "newerThanDays", "hide", "done"] as const;

/**
 * The inbox filter in a URL's query.
 *
 * @returns the filter as query parameters; the default view is the whole board.
 */
export function filterFromUrl(search = location.search): URLSearchParams {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of FILTER_KEYS) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  if (!out.get("view")) out.set("view", "board");
  return out;
}

/** Single deck mode: folio.toml leaves `[editor] show_deck_list` off (the default). */
export const singleDeckMode = boot.editor?.showDeckList !== true;

/**
 * The one deck the board shows in single deck mode: the deck the user came
 * from (`?from=<token>`), else the workspace's only deck.
 *
 * @returns its token, or null for every deck (deck list mode, or no `from`
 *   in a workspace of several decks).
 */
export function deckScope(search = location.search): string | null {
  if (!singleDeckMode) return null;
  return new URLSearchParams(search).get("from") || boot.inbox?.onlyDeck || null;
}

/**
 * Follow the inbox for a filter.
 *
 * @param filter - the query to send.
 * @returns the rows, the counts per view and the unread total, or null while loading.
 */
export function useInbox(filter: string): InboxData | null {
  const [data, setData] = useState<InboxData | null>(null);
  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | undefined;
    const load = () => void call<InboxData>(`api/inbox?${filter}`).then(setData, () => {});
    const soon = () => (clearTimeout(pending), (pending = setTimeout(load, 60)));
    load();
    const off = subscribe(["*"], (m) => (m.type === "comment" || m.type === "draft" || m.type === "resync" ? soon() : undefined));
    const timer = setInterval(load, 30_000);
    return () => (off(), clearInterval(timer), clearTimeout(pending));
  }, [filter]);
  return data;
}

/**
 * The address that opens a row where it was made.
 *
 * @param row - an inbox row.
 * @returns the editor URL for a comment, or for a draft.
 */
export function rowLink(row: InboxRow): string {
  const q = new URLSearchParams({ slide: row.slide });
  if (row.view === "drafts") q.set("draft", row.id);
  else q.set("comment", row.id);
  return at(`${row.deck}/?${q}`);
}

/**
 * How long ago a time was, briefly.
 *
 * @returns e.g. `4 min`, `3 h`, `2 d`.
 */
export function ago(iso: string, now = Date.now()): string {
  const s = Math.max(0, (now - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.round(s / 60)} min`;
  if (s < 86400) return `${Math.round(s / 3600)} h`;
  return `${Math.round(s / 86400)} d`;
}
