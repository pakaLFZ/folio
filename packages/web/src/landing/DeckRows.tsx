/**
 * The landing page's deck list: the search, sort and Archived row above it,
 * and one row per deck. A row's Archive (or, in the archived list, Unarchive)
 * button shows on hover or keyboard focus, just left of the token; clicking it
 * never follows the row's link.
 */
import { Archive, ArchiveRestore, Search } from "lucide-react";
import type { MouseEvent } from "react";
import { at } from "../boot";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Input } from "../ui/field";
import { Segmented } from "../ui/segmented";
import { Tip } from "../ui/tooltip";

export interface DeckRow {
  token: string;
  title: string;
  editedAt: string;
  archived: boolean;
}

export type SortKey = "edited" | "name";

const SORTS: { value: SortKey; label: string; title: string }[] = [
  { value: "edited", label: "Edited", title: "Last edited first" },
  { value: "name", label: "Name", title: "By name, A to Z" },
];

/**
 * Search, sort and the Archived toggle.
 *
 * @param props.archivedCount - how many decks are archived; the toggle hides at zero unless it is on.
 */
export function DeckToolbar({ query, onQuery, sort, onSort, archivedCount, showArchived, onShowArchived }: { query: string; onQuery: (q: string) => void; sort: SortKey; onSort: (s: SortKey) => void; archivedCount: number; showArchived: boolean; onShowArchived: (on: boolean) => void }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <label className="relative min-w-0 flex-1">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
        <Input type="search" aria-label="Search decks" placeholder="Search by title or token" value={query} onChange={(e) => onQuery(e.target.value)} className="pl-8" />
      </label>
      <Segmented<SortKey> label="Sort decks" value={sort} onChange={onSort} className="shrink-0" options={SORTS} />
      {archivedCount || showArchived ? (
        <Button variant="ghost" size="sm" aria-label={`Archived (${archivedCount})`} aria-pressed={showArchived} onClick={() => onShowArchived(!showArchived)} className={cn("shrink-0 font-normal", showArchived ? "bg-whisper text-ink" : "text-ink-muted")}>
          Archived ({archivedCount})
        </Button>
      ) : null}
    </div>
  );
}

/**
 * One deck: its title, the archive button and its token, all one link.
 *
 * @param props.onArchive - called with the deck when its button is clicked.
 */
export function DeckItem({ deck, onArchive }: { deck: DeckRow; onArchive: (deck: DeckRow) => void }) {
  const verb = deck.archived ? "Unarchive" : "Archive";
  const click = (e: MouseEvent) => (e.preventDefault(), e.stopPropagation(), onArchive(deck));
  return (
    <li className="group">
      <a href={at(`${deck.token}/`)} className="flex items-center gap-x-3 px-4 py-3 hover:bg-whisper">
        <span className={cn("min-w-0 flex-1 truncate font-medium", deck.archived && "text-ink-muted")}>{deck.title}</span>
        <Tip label={verb}>
          <button type="button" aria-label={`${verb} ${deck.title}`} onClick={click} className="-my-1.5 flex size-7 shrink-0 items-center justify-center rounded-chip text-ink-muted opacity-0 transition-[opacity,background-color,color] duration-[120ms] hover:bg-line-soft hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 group-focus-within:opacity-100 [&_svg]:size-3.5">
            {deck.archived ? <ArchiveRestore aria-hidden /> : <Archive aria-hidden />}
          </button>
        </Tip>
        <span className="num text-[11px] text-ink-faint">/{deck.token}/</span>
      </a>
    </li>
  );
}
