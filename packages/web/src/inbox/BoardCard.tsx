/**
 * One card on the inbox board: the region's thumbnail, where it is, the last
 * message and who wrote it. Dragging moves it; the small buttons do the same
 * moves from the keyboard. A draft is the same card: an empty dashed preview
 * (it has no screenshot until sent), a link that opens it on its slide, and one
 * action, "Discard draft".
 */
import { ArrowDown, ArrowUp, Check, Pause, Play, X } from "lucide-react";
import type { InboxRow } from "@folio/core";
import { at } from "../boot";
import { cn } from "../ui/cn";
import { Tip } from "../ui/tooltip";
import type { CardDnd } from "./boardDndParts";
import { ago, rowLink } from "./inboxData";

export type Move = { kind: "column"; column: "queue" | "held" | "done" } | { kind: "step"; delta: -1 | 1 } | { kind: "discard" };

/** A small square action on a card, named by the chrome's tooltip. */
function Act({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} onClick={(e) => (e.preventDefault(), e.stopPropagation(), onClick())} className="flex size-6 items-center justify-center rounded-chip text-ink-muted hover:bg-whisper hover:text-ink [&_svg]:size-3.5">
        {children}
      </button>
    </Tip>
  );
}

/**
 * The card.
 *
 * @param props.row - the inbox row.
 * @param props.filter - the board filter, carried into the editor link.
 * @param props.onMove - a move from the card's buttons.
 * @param props.dnd - the drag wiring for the card and its link, from `DragCard`.
 * @param props.onOpen - opens the card's chat beside the board (a modified
 *   click opens its slide instead); a draft always opens on its slide.
 * @param props.deckShown - names the deck before the slide; off when the
 *   board shows one deck (single deck mode), where the slide id leads.
 */
export function BoardCard({ row, filter, onMove, onOpen, dnd, deckShown = true }: { row: InboxRow; filter: URLSearchParams; onMove: (m: Move) => void; onOpen: () => void; dnd?: CardDnd; deckShown?: boolean }) {
  const draft = row.view === "drafts";
  return (
    <li {...dnd?.liProps} className="group relative rounded-card bg-surface outline outline-1 outline-line" data-card={row.id}>
      <a {...dnd?.linkProps} href={rowLink(row)} draggable={false} onClick={(e) => !draft && !(e.metaKey || e.ctrlKey || e.shiftKey) && (e.preventDefault(), e.stopPropagation(), onOpen())} className="block rounded-card p-2 focus-visible:outline-2">
        <Preview row={row} />
        <span className="flex items-center gap-1.5 text-[11px] text-ink-faint">
          {row.unread && row.following ? <span className="size-1.5 shrink-0 rounded-full bg-ink" aria-label={`${row.unread} unread`} /> : null}
          {deckShown ? <span className="truncate text-ink-muted">{row.deckTitle}</span> : null}
          <span className={cn("num shrink-0", !deckShown && "text-ink-muted")}>{row.slide}</span>
          <span className="num ml-auto shrink-0">{ago(row.updatedAt)}</span>
        </span>
        <span className="mt-1 line-clamp-3 text-[12px] leading-snug">
          {draft ? null : <span className="num text-[10px] text-ink-muted">{row.lastAuthor} </span>}
          {row.lastMessage || (draft ? "(sketch only)" : "(attachment)")}
        </span>
        {row.assignee || row.orphaned ? (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {row.assignee ? <span className="num rounded-chip border border-line px-2 text-[10px] leading-4 text-ink-muted">{row.assignee}</span> : null}
            {row.orphaned ? <span className="rounded-chip border border-danger/40 px-2 text-[10px] leading-4 text-danger">{row.orphaned}</span> : null}
          </span>
        ) : null}
      </a>
      <CardActions row={row} onMove={onMove} />
    </li>
  );
}

/** The region's screenshot; a draft, which has none yet, shows an empty dashed frame. */
function Preview({ row }: { row: InboxRow }) {
  if (row.view === "drafts") return <span aria-hidden className="mb-1.5 block h-14 rounded-chip bg-paper outline outline-1 -outline-offset-1 outline-dashed outline-line-strong" />;
  return (
    <span className="mb-1.5 block h-14 overflow-hidden rounded-chip bg-paper outline outline-1 outline-line-soft">
      <img src={at(`${row.deck}/comments/${row.id}/shot-region.png`)} alt="" draggable={false} className="size-full object-cover object-left-top" onError={(e) => ((e.target as HTMLImageElement).style.visibility = "hidden")} />
    </span>
  );
}

const ACTIONS = "glass absolute -right-px -top-px flex items-center gap-0.5 rounded-none rounded-bl-card rounded-tr-card p-0.5 opacity-0 transition-opacity duration-[120ms] group-focus-within:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100";

/** The card's move buttons: up and down the queue, hold or release, resolve; a draft's discard. */
function CardActions({ row, onMove }: { row: InboxRow; onMove: (m: Move) => void }) {
  const queue = row.view === "queue";
  if (row.view === "drafts") return <div className={ACTIONS}><Act label="Discard draft" onClick={() => onMove({ kind: "discard" })}><X /></Act></div>;
  return (
    <div className={ACTIONS}>
      {queue ? <Act label="Move up the queue" onClick={() => onMove({ kind: "step", delta: -1 })}><ArrowUp /></Act> : null}
      {queue ? <Act label="Move down the queue" onClick={() => onMove({ kind: "step", delta: 1 })}><ArrowDown /></Act> : null}
      {row.view === "held" || row.view === "done" ? <Act label="Back to the queue" onClick={() => onMove({ kind: "column", column: "queue" })}><Play /></Act> : <Act label="Hold" onClick={() => onMove({ kind: "column", column: "held" })}><Pause /></Act>}
      {row.view !== "done" ? <Act label="Resolve" onClick={() => onMove({ kind: "column", column: "done" })}><Check /></Act> : null}
    </div>
  );
}
