/**
 * Tables on slides are as tall as the rows they happen to hold, and the
 * text under them was moved by hand to sit below. In folio a table slot's
 * height is a maximum and a text slot can flow `below` it, so a proposal
 * gives the text slot under a table a `below` with the gap the slides show,
 * and lets the table grow down to that text's bottom.
 */
import { isTextRole, type Box } from "@folio/core";
import type { DraftSlot } from "./slots.js";

const overlapsX = (a: Box, b: Box) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2];
const bottom = (b: Box) => b[1] + b[3];
const round = (v: number) => Math.round(v * 10) / 10;

/** The nearest slot under a table, across its width. */
function under(table: DraftSlot, slots: DraftSlot[]): DraftSlot | undefined {
  return slots.filter((s) => s !== table && s.box[1] >= bottom(table.box) - 1 && overlapsX(s.box, table.box)).sort((a, b) => a.box[1] - b.box[1])[0];
}

/** Give the text slot under each table a `below` with the measured gap; captions keep their place. */
export function flowUnderTables(slots: DraftSlot[]): void {
  for (const table of slots.filter((s) => s.role === "table")) {
    const next = under(table, slots);
    if (next && isTextRole(next.role) && next.role !== "caption" && !next.below) next.below = { slot: table.name!, gap: round(next.box[1] - bottom(table.box)) };
  }
}

/** Let each table grow down to the bottom of the text flowing below it, or to just above the next slot or the page's foot. */
export function growTables(slots: DraftSlot[], canvasH: number): void {
  for (const table of slots.filter((s) => s.role === "table")) {
    const flowing = slots.find((s) => s.below?.slot === table.name);
    const next = under(table, slots);
    const limit = flowing ? bottom(flowing.box) - flowing.below!.gap : next ? next.box[1] - 8 : canvasH - 8;
    table.box = [table.box[0], table.box[1], table.box[2], round(Math.max(limit - table.box[1], table.box[3]))];
  }
}

/** Whether two slots are the same for a proposal: a table by its top and width, a flowing slot by its sides and bottom. */
export function sameSlot(a: DraftSlot, b: DraftSlot): boolean {
  if (a.name !== b.name || a.role !== b.role || Boolean(a.below) !== Boolean(b.below)) return false;
  const near = (i: number[]) => i.every((k) => Math.abs((k === 4 ? bottom(a.box) : a.box[k]!) - (k === 4 ? bottom(b.box) : b.box[k]!)) <= 1);
  if (a.role === "table") return near([0, 1, 2]);
  if (a.below) return near([0, 2, 4]);
  return near([0, 1, 2, 3]);
}
