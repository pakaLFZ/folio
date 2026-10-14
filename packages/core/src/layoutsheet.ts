/**
 * The page geometry of a pack's layouts as rows of values: every slot's box
 * and what limits it, for `folio layouts`. Hook inputs are left out; `folio
 * hook show` prints them once.
 */
import { refinedBlockStyle } from "./blockstyle.js";
import type { Box, Layout, Pack, Slot } from "./pack.js";
import { tableRowsThatFit } from "./tables.js";
import { textSlots } from "./theme.js";

/** One slot of a layout: its box in pt and, by role, its limits. */
export interface SlotRow {
  name: string;
  role: string;
  box: Box;
  /** Text and tables: the font size in pt. */
  size?: number;
  /** Text: the line limit. */
  lines?: number;
  /** Text: the pack's character limit for the role. */
  chars?: number;
  /** Tables: the rows of one line that fit under the header. */
  rows?: number;
  /** Tables and blocks: the style name. */
  style?: string;
  /** Text: a hook that rewrites the text; figures: the hook that may draw it. */
  hook?: string;
  /** Figures: what the slot takes. */
  takes?: string;
  /** A slot that flows below another, as the layout states it. */
  below?: { slot: string; gap: number };
}

/** One layout of the sheet. */
export interface LayoutRow {
  name: string;
  description: string;
  background: string;
  slots: SlotRow[];
}

/** The whole sheet: the pack, the slide size and the layouts in the pack's order. */
export interface LayoutSheet {
  pack: string;
  slide: { w: number; h: number; unit: "pt" };
  layouts: LayoutRow[];
}

/**
 * The layouts of a pack as rows.
 *
 * @param pack - a loaded pack.
 * @param names - layouts to keep, in the pack's order; all when empty.
 * @returns the sheet, or the names the pack lacks with its layouts.
 */
export function layoutSheet(pack: Pack, names: string[] = []): { ok: true; sheet: LayoutSheet } | { ok: false; reason: string } {
  const known = Object.keys(pack.layouts);
  const missing = names.filter((n) => !pack.layouts[n]);
  if (missing.length) return { ok: false, reason: `no layout ${missing.join(", ")} in pack ${pack.name}@${pack.version}; its layouts: ${known.join(", ")}` };
  const chosen = names.length ? known.filter((n) => names.includes(n)) : known;
  const layouts = chosen.map((name) => layoutRow(pack, name, pack.layouts[name]!));
  return { ok: true, sheet: { pack: `${pack.name}@${pack.version}`, slide: { w: pack.canvas.w, h: pack.canvas.h, unit: "pt" }, layouts } };
}

/** One layout's rows, slots in declaration order. */
function layoutRow(pack: Pack, name: string, layout: Layout): LayoutRow {
  const text = new Map(textSlots(pack, layout).map((t) => [t.name, t]));
  const slots = Object.entries(layout.slots).map(([slotName, slot]) => {
    const t = text.get(slotName);
    const limits = t ? { size: t.style.size, lines: t.lineLimit, chars: pack.rules.maxChars[slot.role], hook: slot.hook ?? undefined } : roleLimits(pack, slot);
    return dropUndefined({ name: slotName, role: slot.role, box: slot.box, ...limits, below: slot.below ?? undefined });
  });
  return { name, description: layout.description, background: layout.background, slots };
}

/** The limits of a slot that is not plain text. */
function roleLimits(pack: Pack, slot: Slot): Partial<SlotRow> {
  if (slot.role === "figure") return { takes: slot.hook ? "file or hook" : "file", hook: slot.hook ?? undefined };
  if (slot.role === "block") return { style: refinedBlockStyle(pack, slot).name };
  const table = slot.role === "table" ? pack.tables[slot.tableStyle ?? ""] : undefined;
  if (table) return { size: table.size, rows: tableRowsThatFit(table, slot.box[3]), style: slot.tableStyle ?? undefined };
  return slot.style ? { style: slot.style } : {};
}

/** The row without its absent fields, so JSON shows only what applies. */
function dropUndefined(row: SlotRow): SlotRow {
  return Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)) as unknown as SlotRow;
}
