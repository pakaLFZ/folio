/**
 * The landing page's deck list, kept current without a reload: read once from
 * `api/decks?archived=1`, then changed in place by the workspace channel's
 * `deck.added`, `deck.changed` and `deck.removed`, whoever made the change.
 * Every (re)connection of the stream reads the list again, so a deck that
 * appeared while the stream was down, or before it first connected, is not
 * missed.
 */
import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { call } from "../api";
import { onStatus, subscribe } from "../stream/client";
import { applyDeckEvent } from "./deckEvents";
import type { DeckRow } from "./DeckRows";

const CHANNEL = "workspace";

/** Every deck, archived ones included, live; null until the first read. */
export function useLiveDecks(): { decks: DeckRow[] | null; setDecks: Dispatch<SetStateAction<DeckRow[] | null>>; error: string | null; setError: (e: string | null) => void } {
  const [decks, setDecks] = useState<DeckRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const read = useCallback(() => {
    void call<{ decks: DeckRow[] }>("api/decks?archived=1").then((r) => (setDecks(r.decks), setError(null)), (e: Error) => setError(e.message));
  }, []);
  useEffect(() => {
    read();
    const offStatus = onStatus((connected) => connected && read());
    const off = subscribe([CHANNEL], (m) => (m.type === "resync" ? read() : setDecks((all) => (all ? applyDeckEvent(all, m) : all))));
    return () => (offStatus(), off());
  }, [read]);
  return { decks, setDecks, error, setError };
}
