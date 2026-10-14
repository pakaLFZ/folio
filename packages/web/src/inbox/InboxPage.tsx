/**
 * The inbox at `/inbox`, as a task board: the user's Drafts, then Queue, In
 * progress, Review, Held and Done. Comments are the agents' tasks. Dragging
 * orders the queue (agents take the top card) and moves cards between the task
 * columns; a draft opens on its slide. Board settings hide any column but the
 * last one shown.
 */
import { useEffect, useMemo, useState } from "react";
import { rankBetween, type InboxRow } from "@folio/core";
import { call } from "../api";
import { Select } from "../ui/select";
import { ThemeSwitch } from "../ui/ThemeSwitch";
import { BoardCard, type Move } from "./BoardCard";
import { BoardColumnView, COLUMNS, type Column } from "./BoardColumns";
import { BoardSettings, HiddenMatches, hiddenColumns, hiddenOf, storedHidden, storeHidden } from "./BoardSettings";
import { BoardDnd } from "./boardDnd";
import { ChatPanel } from "./ChatPanel";
import { originParams, ReturnButton } from "./ReturnButton";
import { useFollowNotifications } from "./notify";
import { deckScope, filterFromUrl, moveCard, singleDeckMode, useInbox } from "./inboxData";

/** The header: the way back to the deck, title, unread count, search, the deck filter and the settings. */
function BoardHeader({ data, filter, update, settings }: { data: ReturnType<typeof useInbox>; filter: URLSearchParams; update: (k: string, v: string) => void; settings: React.ReactNode }) {
  const cards = (data?.rows ?? []).filter((r) => r.view !== "drafts");
  const decks = new Map<string, { value: string; label: string; count: number }>();
  for (const r of cards) {
    const d = decks.get(r.deck) ?? { value: r.deck, label: r.deckTitle, count: 0 };
    decks.set(r.deck, { ...d, count: d.count + 1 });
  }
  return (
    <header className="flex flex-wrap items-center gap-2 px-3 pb-2 pt-3 sm:px-4">
      <ReturnButton />
      <h1 className="text-[13px] font-medium">Inbox</h1>
      <span className="num text-[11px] text-ink-faint">{data ? `${data.unread} unread` : singleDeckMode ? "reading the deck" : "reading every deck"}</span>
      <span className="flex-1" />
      <input value={filter.get("search") ?? ""} onChange={(e) => update("search", e.target.value)} placeholder="Search" aria-label="Search messages and slots" className="h-8 w-40 rounded-control border border-line bg-raised px-3 text-[12px] sm:w-56" />
      {singleDeckMode ? null : <Select label="Deck" all="Every deck" value={filter.get("deck") ?? ""} options={[...decks.values()]} allCount={cards.length} onChange={(v) => update("deck", v)} />}
      {settings}
      <ThemeSwitch />
    </header>
  );
}

/** Retire a draft to the drafts archive. */
function discardDraft(row: InboxRow): Promise<unknown> {
  return call(`${row.deck}/drafts/${row.id}/discard`, { method: "POST", json: {} });
}

/**
 * Card moves: a drop at a place in a column, and the card buttons.
 *
 * @param byView - the cards per column, in board order.
 * @returns the drop and move handlers.
 */
function boardMoves(byView: Record<string, InboxRow[]>) {
  const queue = byView.queue ?? [];
  const onDrop = (row: InboxRow, col: Column, index: number) => {
    if (!col.drop) return Promise.resolve();
    const others = queue.filter((r) => r.id !== row.id);
    return moveCard(row, col.drop, col.view === "queue" ? rankBetween(others[index - 1]?.rank, others[index]?.rank) : undefined);
  };
  const onMove = (row: InboxRow, m: Move) => {
    if (m.kind === "discard") return void discardDraft(row).catch(() => {});
    if (m.kind === "column") return void moveCard(row, m.column, m.column === "queue" ? rankBetween(queue.at(-1)?.rank, undefined) : undefined);
    const i = queue.findIndex((r) => r.id === row.id);
    const j = i + m.delta;
    if (j < 0 || j >= queue.length) return;
    const [lo, hi] = m.delta < 0 ? [queue[j - 1]?.rank, queue[j]!.rank] : [queue[j]!.rank, queue[j + 1]?.rank];
    void moveCard(row, "queue", rankBetween(lo, hi));
  };
  return { onDrop, onMove };
}

/**
 * The board filter, kept in the URL so Back restores it.
 *
 * @returns the filter and a setter for one key (an empty value removes it).
 */
function useBoardFilter(): [URLSearchParams, (k: string, v: string) => void] {
  const [filter, setFilter] = useState(() => {
    const f = filterFromUrl();
    f.set("view", "board");
    const hidden = f.has("hide") || f.has("done") ? hiddenOf(f, COLUMNS) : hiddenColumns(storedHidden(), COLUMNS);
    f.delete("done");
    f.delete("hide");
    if (hidden.length) f.set("hide", hidden.join(","));
    return f;
  });
  const update = (k: string, v: string) => {
    const next = new URLSearchParams(filter);
    if (v) next.set(k, v);
    else next.delete(k);
    setFilter(next);
    history.replaceState(history.state, "", `?${new URLSearchParams([...originParams(), ...next])}`);
  };
  return [filter, update];
}

/** The page. */
export function InboxPage() {
  const [filter, update] = useBoardFilter();
  const [scope] = useState(() => deckScope());
  const query = useMemo(() => {
    const q = new URLSearchParams(filter);
    q.set("view", "all");
    q.delete("done");
    q.delete("hide");
    q.delete("deck");
    if (scope) q.set("scope", scope);
    return q.toString();
  }, [filter, scope]);
  const data = useInbox(query);
  const deck = singleDeckMode ? null : filter.get("deck");
  const rows = useMemo(() => (data?.rows ?? []).filter((r) => !deck || r.deck === deck || r.deckTitle === deck), [data, deck]);
  const [chat, setChat] = useState<InboxRow | null>(null);
  useFollowNotifications();
  useEffect(() => {
    if (!chat) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setChat(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [chat]);
  const byView = useMemo(() => {
    const out: Record<string, InboxRow[]> = {};
    for (const r of rows) (out[r.view] ??= []).push(r);
    return out;
  }, [rows]);
  const { onDrop, onMove } = boardMoves(byView);
  const hidden = useMemo(() => hiddenOf(filter, COLUMNS), [filter]);
  const shown = useMemo(() => COLUMNS.filter((c) => !hidden.includes(c.view)), [hidden]);
  const setShown = (view: string, on: boolean) => {
    const next = hiddenColumns(on ? hidden.filter((v) => v !== view) : [...hidden, view], COLUMNS);
    storeHidden(next);
    update("hide", next.join(","));
  };
  return (
    <div className="flex h-full flex-col">
      <BoardHeader data={data} filter={filter} update={update} settings={<BoardSettings columns={COLUMNS} hidden={hidden} onShown={setShown} />} />
      {filter.get("search") ? <HiddenMatches columns={COLUMNS.filter((c) => hidden.includes(c.view)).map((c) => ({ ...c, count: byView[c.view]?.length ?? 0 }))} onShow={(view) => setShown(view, true)} /> : null}
      <div className="relative flex min-h-0 flex-1">
        <BoardDnd byView={byView} columns={shown} onDrop={(row, target, index) => onDrop(row, COLUMNS.find((c) => c.drop === target)!, index)} renderLifted={(r) => <BoardCard row={r} filter={filter} deckShown={!scope} onMove={() => {}} onOpen={() => {}} />}>
        <main onClick={() => setChat(null)} className="flex min-h-0 flex-1 snap-x snap-mandatory gap-2 overflow-x-auto px-3 pb-3 has-[[data-placeholder]]:snap-none sm:snap-none sm:px-4">
          {shown.map((col) => <BoardColumnView key={col.view} col={col} rows={byView[col.view] ?? []} filter={filter} deckShown={!scope} onMove={onMove} onOpen={setChat} />)}
        </main>
        </BoardDnd>
        {chat ? <ChatPanel row={(data?.rows ?? []).find((r) => r.id === chat.id) ?? chat} onClose={() => setChat(null)} /> : null}
      </div>
    </div>
  );
}
