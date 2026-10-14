/**
 * Flow: a slot that declares `below` starts under another slot's rendered
 * bottom plus a gap, and keeps its own box bottom, so it grows or shrinks. The
 * renderer measures how far each followed slot's content reaches; this module
 * only turns those numbers into boxes, so the live view and print agree.
 */
import type { Box, Layout } from "./pack.js";

/**
 * Every slot's box after flow.
 *
 * @param layout - the layout (its `below` references are validated at pack load).
 * @param reach - for slots whose content was measured, how far it reaches below
 *   the slot's top, in pt (a table's height, the bottom of a text's last line).
 *   A slot not in it reaches its box bottom.
 * @returns the box of every slot. A flowed box's height may be zero or less when
 *   the slot above reaches past its bottom; that is an overflow, not clamped here.
 */
export function flowBoxes(layout: Layout, reach: Record<string, number>): Record<string, Box> {
  const boxes: Record<string, Box> = {};
  const place = (name: string, seen: Set<string>): Box => {
    const known = boxes[name];
    if (known) return known;
    const slot = layout.slots[name]!;
    const [x, y, w, h] = slot.box;
    const above = slot.below && layout.slots[slot.below.slot] && !seen.has(name) ? slot.below : null;
    if (!above) return (boxes[name] = slot.box);
    const top = bottomOf(above.slot, place(above.slot, new Set([...seen, name])), reach) + above.gap;
    return (boxes[name] = [x, top, w, y + h - top]);
  };
  for (const name of Object.keys(layout.slots)) place(name, new Set());
  return boxes;
}

/** The rendered bottom of a slot: its top plus its content's reach, or its box bottom when unmeasured. */
function bottomOf(name: string, box: Box, reach: Record<string, number>): number {
  const r = reach[name];
  return box[1] + (r === undefined ? box[3] : r);
}

/** The slots some other slot sits below; only these need their reach measured. */
export function followedSlots(layout: Layout): Set<string> {
  return new Set(Object.values(layout.slots).flatMap((s) => (s.below ? [s.below.slot] : [])));
}
