/**
 * The rail as a sortable list of equal slots. While a group is dragged the
 * other slides close up in deck order and a gap of the group's size opens at
 * a slot index of that shortened list; the group sits in the gap.
 */
import { moveSlides } from "@folio/core";

/** The order without the dragged slides. */
const rest = (order: string[], moving: string[]) => order.filter((id) => !moving.includes(id));

/**
 * The slot each slide stands in while the group's gap is at `gap`.
 *
 * @param gap - 0 is above every other slide, `order.length - moving.length` after them.
 */
export function dragSlots(order: string[], moving: string[], gap: number): Map<string, number> {
  const slots = new Map<string, number>();
  rest(order, moving).forEach((id, i) => slots.set(id, i < gap ? i : i + moving.length));
  order.filter((id) => moving.includes(id)).forEach((id, j) => slots.set(id, gap + j));
  return slots;
}

/** The gap where the group stands before it moves: in front of the slide that followed its first member. */
export function homeGap(order: string[], moving: string[]): number {
  const first = order.findIndex((id) => moving.includes(id));
  return first < 0 ? 0 : order.slice(0, first).filter((id) => !moving.includes(id)).length;
}

/**
 * The gap that puts the grabbed slide in the slot under the pointer.
 *
 * @param slot - the slot under the pointer.
 * @param grab - the grabbed slide's place within the group.
 */
export function gapUnder(slot: number, grab: number, count: number, moving: number): number {
  return Math.max(0, Math.min(count - moving, slot - grab));
}

/**
 * Where a group dropped in a gap lands.
 *
 * @returns the slide it lands in front of (null for the end), or undefined
 *   when the order would not change.
 */
export function gapLanding(order: string[], moving: string[], gap: number): string | null | undefined {
  const before = rest(order, moving)[gap] ?? null;
  const after = moveSlides(order, moving, before);
  return after && after.join() !== order.join() ? before : undefined;
}

/** Whether a slot is within `reach` slots of a span of slots. */
export const nearSpan = (slot: number, from: number, to: number, reach: number) => slot >= from - reach && slot <= to + reach;
