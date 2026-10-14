/**
 * The landing page at `/`: every deck the server holds, by title and address,
 * the way to the inbox, and the New deck button. A search field narrows the
 * rows by title or token as it is typed; the sort, by last edit (newest
 * first) or by name, is remembered per browser. Archiving a deck hides it;
 * the Archived toggle lists the archived decks, each with Unarchive. The list
 * follows the workspace live (`liveDecks.ts`), keeping the search, the sort
 * and the scroll. Also the page a forgotten deck address falls back to.
 */
import { Inbox } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { call } from "../api";
import { at } from "../boot";
import { Button } from "../ui/button";
import { ThemeSwitch } from "../ui/ThemeSwitch";
import { DeckItem, DeckToolbar, type DeckRow, type SortKey } from "./DeckRows";
import { useLiveDecks } from "./liveDecks";
import { NewDeck } from "./NewDeck";

const SORT_KEY = "folio-landing-sort";

const ORDER: Record<SortKey, (a: DeckRow, b: DeckRow) => number> = {
  edited: (a, b) => b.editedAt.localeCompare(a.editedAt),
  name: (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }),
};

function storedSort(): SortKey {
  try {
    return localStorage.getItem(SORT_KEY) === "name" ? "name" : "edited";
  } catch {
    return "edited";
  }
}

function storeSort(sort: SortKey): void {
  try {
    localStorage.setItem(SORT_KEY, sort);
  } catch {
    return;
  }
}

/** The decks whose title or token holds the query, in the chosen order. */
function shownDecks(decks: DeckRow[], query: string, sort: SortKey): DeckRow[] {
  const q = query.trim().toLowerCase().replace(/^\/+|\/+$/g, "");
  return decks.filter((d) => d.title.toLowerCase().includes(q) || d.token.includes(q)).sort(ORDER[sort]);
}

/** Every deck, archived ones included, the unread count, and archiving. */
function useWorkspace() {
  const { decks, setDecks, error, setError } = useLiveDecks();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    void call<{ unread: number }>("api/inbox?view=open").then((r) => setUnread(r.unread), () => {});
  }, []);
  const toggleArchived = (deck: DeckRow) => {
    setError(null);
    call<{ archived: boolean }>(`api/decks/${deck.token}/${deck.archived ? "unarchive" : "archive"}`, { method: "POST" }).then(
      (r) => setDecks((all) => all?.map((d) => (d.token === deck.token ? { ...d, archived: r.archived } : d)) ?? null),
      (e: Error) => setError(e.message),
    );
  };
  return { decks, error, unread, toggleArchived };
}

/** The page. */
export function Landing() {
  const { decks, error, unread, toggleArchived } = useWorkspace();
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>(storedSort);
  const [showArchived, setShowArchived] = useState(false);
  const pool = useMemo(() => (decks ?? []).filter((d) => d.archived === showArchived), [decks, showArchived]);
  const shown = useMemo(() => shownDecks(pool, query, sort), [pool, query, sort]);
  const archivedCount = decks?.filter((d) => d.archived).length ?? 0;
  const onSort = (next: SortKey) => (setSort(next), storeSort(next));
  useEffect(() => {
    if (showArchived && decks && !archivedCount) setShowArchived(false);
  }, [showArchived, decks, archivedCount]);
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <header className="mb-6 flex items-center justify-between gap-3">
          <h1 className="text-[13px] font-medium">folio</h1>
          <span className="flex items-center gap-1">
            <NewDeck />
            <Button asChild variant="outline" size="sm"><a href={at("inbox")}><Inbox />Inbox{unread ? <span className="num rounded-chip bg-ink px-1.5 text-[10px] leading-4 text-on-ink">{unread}</span> : null}</a></Button>
            <ThemeSwitch />
          </span>
        </header>
        {error ? <p role="alert" className="mb-3 text-danger">{error}</p> : null}
        {decks === null && !error ? <p className="text-ink-faint">Reading the workspace</p> : null}
        {decks?.length === 0 ? <p className="text-ink-muted">No decks yet. Make one with New deck, or: folio init-deck decks/NAME --template PACK</p> : null}
        {decks?.length ? <DeckToolbar query={query} onQuery={setQuery} sort={sort} onSort={onSort} archivedCount={archivedCount} showArchived={showArchived} onShowArchived={setShowArchived} /> : null}
        {decks?.length && !pool.length ? <p className="text-ink-muted">Every deck is archived.</p> : null}
        {pool.length && !shown.length ? <p className="text-ink-muted">No deck matches {query.trim()}.</p> : null}
        <ul className={shown.length ? "divide-y divide-line-soft rounded-card border border-line bg-surface" : "hidden"}>
          {shown.map((d) => <DeckItem key={d.token} deck={d} onArchive={toggleArchived} />)}
        </ul>
      </div>
    </div>
  );
}
