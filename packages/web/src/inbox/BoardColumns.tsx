/**
 * The board's columns: Drafts, then the task columns Queue, In progress,
 * Review, Held and Done. Task cards drag between the task columns; drafts are
 * not tasks yet, so the Drafts column neither gives nor takes a card.
 */
import { useState, type ReactNode, type Ref } from "react";
import type { InboxRow, InboxView } from "@folio/core";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { BoardCard, type Move } from "./BoardCard";
import { useDropColumn, type BoardColumn } from "./boardDnd";
import { ColumnCards, DragCard } from "./boardDndParts";
import { ClearColumn } from "./ClearColumn";

export type Column = BoardColumn & { view: InboxView };

export const COLUMNS: Column[] = [
  { view: "drafts", title: "Drafts", drop: null },
  { view: "queue", title: "Queue", drop: "queue" },
  { view: "progress", title: "In progress", drop: null },
  { view: "review", title: "Review", drop: null },
  { view: "held", title: "Held", drop: "held" },
  { view: "done", title: "Done", drop: "done" },
];
const DONE_SHOWN = 30;
const EMPTY: Partial<Record<InboxView, string>> = { drafts: "No drafts", queue: "No task waits for an agent.", review: "Nothing needs you." };

type CardProps = { filter: URLSearchParams; deckShown: boolean; onMove: (row: InboxRow, m: Move) => void; onOpen: (row: InboxRow) => void };

/** A column's frame: its title, count and "Clear all" over its list of cards. */
function ColumnShell({ col, rows, listRef, drop, children }: { col: Column; rows: InboxRow[]; listRef?: Ref<HTMLUListElement>; drop?: { accepts: boolean; over: boolean }; children: ReactNode }) {
  return (
    <section aria-label={col.title} className="flex w-[280px] shrink-0 snap-start flex-col rounded-pane bg-column sm:w-auto sm:min-w-[280px] sm:flex-1">
      <header className="flex items-center px-[var(--panel-pad)] pb-0.5 pt-2.5">
        <h2 className="flex items-baseline gap-2 text-[12px] font-medium">{col.title}<span className="num text-[11px] font-normal text-ink-faint">{rows.length}</span></h2>
        {rows.length ? <ClearColumn view={col.view} title={col.title} rows={rows} /> : null}
      </header>
      <ul
        ref={listRef}
        data-drop={drop?.accepts ? (drop.over ? "over" : "open") : undefined}
        className={cn("scroll-stable flex min-h-24 flex-1 flex-col gap-1.5 rounded-pane pl-[var(--panel-pad)] pr-[calc(var(--panel-pad)-var(--scrollbar-w))] pb-2 pt-1 transition-colors duration-[120ms]", drop?.accepts && "outline outline-1 -outline-offset-1 outline-line-strong", drop?.over && "bg-whisper outline-ink/40")}
      >
        {children}
      </ul>
    </section>
  );
}

const emptyLine = (text: string) => <li className="px-1 py-3 text-[11px] text-ink-faint">{text}</li>;

/** The user's drafts, newest first: plain cards that open on their slide. */
function DraftsColumn({ col, rows, filter, deckShown, onMove }: { col: Column; rows: InboxRow[] } & CardProps) {
  const newest = [...rows].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return (
    <ColumnShell col={col} rows={rows}>
      {newest.map((r) => <BoardCard key={r.id} row={r} filter={filter} deckShown={deckShown} onMove={(m) => onMove(r, m)} onOpen={() => {}} />)}
      {newest.length ? null : emptyLine(EMPTY.drafts!)}
    </ColumnShell>
  );
}

/** A task column with its drop zone. */
function TaskColumn({ col, rows, filter, deckShown, onMove, onOpen }: { col: Column; rows: InboxRow[] } & CardProps) {
  const [more, setMore] = useState(false);
  const { rows: placed, accepts, over, setNodeRef } = useDropColumn(col.view, col.drop);
  const shown = col.view === "done" && !more ? placed.slice(0, DONE_SHOWN) : placed;
  return (
    <ColumnShell col={col} rows={rows} listRef={setNodeRef} drop={{ accepts, over }}>
      <ColumnCards view={col.view} ids={shown.map((r) => r.id)}>
        {shown.map((r) => (
          <DragCard key={r.id} row={r} sourceOnly={!col.drop}>
            {(dnd) => <BoardCard row={r} filter={filter} deckShown={deckShown} dnd={dnd} onMove={(m) => onMove(r, m)} onOpen={() => onOpen(r)} />}
          </DragCard>
        ))}
      </ColumnCards>
      {placed.length ? null : emptyLine(accepts ? "Drop here" : EMPTY[col.view] ?? "Empty")}
      {rows.length > shown.length ? <li><Button size="sm" onClick={() => setMore(true)}>Show {rows.length - shown.length} more</Button></li> : null}
    </ColumnShell>
  );
}

/** One column of the board: drafts or tasks. */
export function BoardColumnView(props: { col: Column; rows: InboxRow[] } & CardProps) {
  return props.col.view === "drafts" ? <DraftsColumn {...props} /> : <TaskColumn {...props} />;
}
