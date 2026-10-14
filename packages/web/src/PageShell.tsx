/**
 * The board and the deck editor in one document. The board, once shown, stays
 * mounted and only hides while a deck is open, so coming back finds it
 * scrolled and filtered as it was left; a deck is mounted fresh each time it
 * is opened. The page that comes in fades in over the one that leaves.
 */
import { useEffect, useMemo, useState } from "react";
import { boot, setBoot } from "./boot";
import { DeckEditor } from "./editor/DeckEditor";
import { useEditorExtensions } from "./extensions";
import { InboxPage } from "./inbox/InboxPage";
import { cn } from "./ui/cn";
import { followInPlace, type Arrival } from "./nav";

interface Shown {
  page: "inbox" | "deck";
  /** Remounts the board when it is opened on a history entry other than the one it was left on. */
  board: number | null;
  boardEntry: number;
  deck: number;
  moved: boolean;
}

/**
 * The next shown state for an arrival.
 *
 * @returns the state with the arriving page shown.
 */
function arrive(s: Shown, a: Arrival): Shown {
  if (a.key !== "inbox") return { ...s, page: "deck", deck: s.deck + 1, boardEntry: s.page === "inbox" ? a.left : s.boardEntry, moved: true };
  const kept = s.board !== null && s.boardEntry === a.entry;
  return { ...s, page: "inbox", board: kept ? s.board : (s.board ?? 0) + 1, moved: true };
}

/**
 * The application's board and deck pages.
 *
 * @param props.first - the page the server served.
 */
export function PageShell({ first }: { first: "inbox" | "deck" }) {
  const [shown, setShown] = useState<Shown>({ page: first, board: first === "inbox" ? 0 : null, boardEntry: -1, deck: 0, moved: false });
  useEffect(
    () =>
      followInPlace(first === "inbox" ? "inbox" : `deck:${boot.deck!.token}`, (a) => {
        setBoot(a.boot);
        setShown((s) => arrive(s, a));
      }),
    [first],
  );
  const onBoard = shown.page === "inbox";
  const board = useMemo(() => <InboxPage />, []);
  return (
    <>
      {shown.board !== null ? (
        <div key={`board-${shown.board}`} className={cn("page", onBoard ? "h-full" : "page-away", onBoard && shown.moved && "page-in")} inert={!onBoard} aria-hidden={!onBoard}>
          {board}
        </div>
      ) : null}
      {onBoard ? null : (
        <div key={`deck-${shown.deck}`} className={cn("h-full", shown.moved && "page-in")}>
          <DeckEditor useExtensions={useEditorExtensions} />
        </div>
      )}
    </>
  );
}
