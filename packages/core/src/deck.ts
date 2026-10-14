/**
 * `deck.json`: a deck's name, its pack and its slide order.
 *
 * `id` is random and created once; the URL token is derived from it, so a
 * renamed or moved deck keeps its address.
 */
import { z } from "zod";

export const deckSchema = z.object({
  id: z.string().min(8),
  title: z.string(),
  template: z.string(),
  order: z.array(z.string()).default([]),
  archived: z.boolean().optional(),
  archivedAt: z.string().optional(),
});
export type Deck = z.infer<typeof deckSchema>;

/**
 * The slide ids of a deck in presentation order.
 *
 * @param deck - the parsed `deck.json`.
 * @param present - ids of the slide files that exist.
 * @returns `order` filtered to existing files, followed by any existing slide
 *   that `order` does not list, sorted by id, so a slide written by a worker
 *   before the order was updated still shows.
 */
export function slideOrder(deck: Deck, present: Iterable<string>): string[] {
  const exists = new Set(present);
  const ordered = deck.order.filter((id) => exists.has(id));
  const listed = new Set(ordered);
  const rest = [...exists].filter((id) => !listed.has(id)).sort();
  return [...ordered, ...rest];
}

/**
 * Move one slide to a new position.
 *
 * @param order - the current order.
 * @param id - the slide to move.
 * @param index - its new position, clamped to the list.
 * @returns a new order; unchanged when `id` is not in it.
 */
export function moveSlide(order: string[], id: string, index: number): string[] {
  const from = order.indexOf(id);
  if (from < 0) return order;
  const rest = order.filter((x) => x !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/**
 * Move several slides together so they land just before another slide,
 * keeping their order in the deck. The landing place is named by a slide id,
 * not a position, so a slide another writer inserts meanwhile does not shift
 * where the group lands.
 *
 * @param order - the current order.
 * @param ids - the slides to move; ids not in `order` are ignored.
 * @param before - the slide the group lands in front of; null for the end.
 * @returns a new order, or null when `before` is no longer in the deck or is
 *   itself one of the moving slides.
 */
export function moveSlides(order: string[], ids: string[], before: string | null): string[] | null {
  const moving = new Set(ids);
  const group = order.filter((id) => moving.has(id));
  const rest = order.filter((id) => !moving.has(id));
  const at = before === null ? rest.length : rest.indexOf(before);
  if (at < 0) return null;
  return [...rest.slice(0, at), ...group, ...rest.slice(at)];
}

/**
 * Insert new slides, in the given order, right after another slide.
 *
 * @param order - the current order, without the new ids.
 * @param ids - the new slide ids.
 * @param after - the slide they follow; at the end when null or missing.
 * @returns a new order.
 */
export function insertSlides(order: string[], ids: string[], after: string | null): string[] {
  const rest = order.filter((id) => !ids.includes(id));
  const found = after === null ? -1 : rest.indexOf(after);
  const at = found < 0 ? rest.length : found + 1;
  return [...rest.slice(0, at), ...ids, ...rest.slice(at)];
}
