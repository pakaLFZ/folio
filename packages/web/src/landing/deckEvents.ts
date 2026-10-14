/** How one workspace event changes the landing page's deck list. */
import type { StreamMessage } from "@folio/core";
import type { DeckRow } from "./DeckRows";

/**
 * The list after one workspace event.
 *
 * @returns the list with the deck added, replaced or taken out; unchanged for other messages.
 */
export function applyDeckEvent(decks: DeckRow[], message: StreamMessage): DeckRow[] {
  const data = message.data as Partial<DeckRow> & { token: string };
  if (message.type === "deck.removed") return decks.filter((d) => d.token !== data.token);
  if (message.type !== "deck.added" && message.type !== "deck.changed") return decks;
  const row: DeckRow = { token: data.token, title: data.title ?? "", editedAt: data.editedAt ?? "", archived: data.archived === true };
  return decks.some((d) => d.token === row.token) ? decks.map((d) => (d.token === row.token ? row : d)) : [...decks, row];
}
