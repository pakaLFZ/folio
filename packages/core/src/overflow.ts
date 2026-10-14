/**
 * Overflow: compare the line counts measured in the rendered DOM with each text
 * slot's limit. The measurement itself is done by the browser renderer; this
 * module only turns numbers into warnings, so preview, check and pdf agree.
 */
import type { ResolvedLayout } from "./overrides.js";
import type { Pack } from "./pack.js";
import { shapeTextSlots } from "./shapes.js";
import { lineLimitOf, textSlots } from "./theme.js";
import { makeWarning, type FolioWarning } from "./warnings.js";

/** One table cell whose text took more than one line. */
export interface WrappedCell {
  /** `header, column 2` or `row 3, column 1` (1-based). */
  cell: string;
  lines: number;
}

/**
 * One slot as measured by the renderer. Text slots give `lines` and `overPt`;
 * a slot placed `below` another also gives its laid-out box height; a table
 * gives its rendered height, its body row count and the cells that wrapped.
 */
export interface MeasuredSlot {
  slot: string;
  lines: number;
  /** The text of each rendered line, as the page broke it; given when a text slot holds more than one line. */
  lineTexts?: string[];
  overPt: number;
  boxPt?: number;
  table?: { heightPt: number; rows: number; wrapped: WrappedCell[] };
  /** A block's height as its content needs it (padding and border included), and each code line wider than the box (1-based). */
  block?: { heightPt: number; wide: { line: number; overPt: number }[] };
}

/** One text slot's limit, from `textSlots()`. */
export interface SlotLimit {
  slot: string;
  limit: number;
  size: number;
  wrap: boolean;
}

/**
 * Warnings for slots that hold more lines than allowed, or run past a
 * non-wrapping box's width.
 *
 * @param where - deck and slide id of the measured slide.
 * @param measured - the renderer's measurement of each text slot.
 * @param limits - the layout's limits for the same slots.
 * @param at - the time of the measurement (ISO).
 * @returns FOLIO-OVF-001 per slot over its line limit, quoting each rendered
 *   line when the page gave them, and FOLIO-OVF-002 per
 *   non-wrapping slot whose text is wider than its box. Slots without a limit
 *   are ignored.
 */
export function overflowWarnings(where: { deck: string; slide: string }, measured: MeasuredSlot[], limits: SlotLimit[], at: string): FolioWarning[] {
  const bySlot = new Map(limits.map((l) => [l.slot, l]));
  const out: FolioWarning[] = [];
  for (const m of measured) {
    const limit = bySlot.get(m.slot);
    if (!limit) continue;
    const location = { ...where, slot: m.slot };
    if (m.lines > limit.limit) {
      out.push(makeWarning("FOLIO-OVF-001", location, { slot: m.slot, lines: m.lines, pt: limit.size, limit: limit.limit, wrapped: wrappedAs(m.lineTexts, m.lines - limit.limit) }, { at, fix: { description: `Shorten the text of ${m.slot} to ${limit.limit} line${limit.limit === 1 ? "" : "s"}.`, applicability: "review" } }));
    }
    if (!limit.wrap && m.overPt > 0.5) {
      out.push(makeWarning("FOLIO-OVF-002", location, { slot: m.slot, overPt: Math.round(m.overPt * 10) / 10 }, { at }));
    }
  }
  return out;
}

/**
 * Where a slot's text broke, for the OVF-001 message.
 *
 * @param lineTexts - each rendered line's text, if measured.
 * @param over - how many lines the slot holds past its limit.
 * @returns ` It wraps as: "AGENTS WRITE THE" / "DECK".` for up to six lines;
 *   for more, its last lines, one more than it is over (` It ends: "..." /
 *   "...".`), since paragraph gaps count as lines that hold no text; "" when
 *   the page gave no lines.
 */
export function wrappedAs(lineTexts: string[] | undefined, over: number): string {
  if (!lineTexts?.length) return "";
  const quote = (lines: string[]) => lines.map((t) => JSON.stringify(t)).join(" / ");
  return lineTexts.length <= 6 ? ` It wraps as: ${quote(lineTexts)}.` : ` It ends: ${quote(lineTexts.slice(-(over + 1)))}.`;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Every overflow warning of one measured slide: text lines and width, table
 * height and wrapped cells, and slots that flow below another and are left
 * with no height.
 *
 * @param where - deck and slide id.
 * @param pack - the slide's pack; `layout` its layout.
 * @param measured - the renderer's measurement of each slot.
 * @param at - the time of the measurement (ISO).
 * @param props - the slide's props: the text a shape holds is measured
 *   against the lines its text box holds.
 * @returns FOLIO-OVF-001/002 as `overflowWarnings`, with the line limit of a
 *   flowed text slot taken from its laid-out height, and of a shape's text from its text box; FOLIO-OVF-003 per table
 *   taller than its box, FOLIO-OVF-004 per wrapped cell, FOLIO-OVF-005 per
 *   flowed slot whose height is zero or less, FOLIO-OVF-006/007 per block
 *   (`blockWarnings`).
 */
export function slideOverflowWarnings(where: { deck: string; slide: string }, pack: Pack, layout: ResolvedLayout, measured: MeasuredSlot[], at: string, props: Record<string, unknown> = {}): FolioWarning[] {
  const boxOf = new Map(measured.map((m) => [m.slot, m.boxPt]));
  const limits = textSlots(pack, layout).map((t) => ({ slot: t.name, limit: lineLimitOf(t.slot, t.style, Math.max(0, boxOf.get(t.name) ?? t.slot.box[3])), size: t.style.size, wrap: t.style.wrap }));
  for (const t of shapeTextSlots(pack, layout, props)) limits.push({ slot: t.name, limit: t.lineLimit, size: t.style.size, wrap: t.style.wrap });
  const out = overflowWarnings(where, measured, limits, at);
  for (const m of measured) {
    const slot = layout.slots[m.slot];
    if (!slot) continue;
    const location = { ...where, slot: m.slot };
    const boxPt = m.boxPt ?? slot.box[3];
    if (slot.below && m.boxPt !== undefined && m.boxPt <= 0) {
      out.push(makeWarning("FOLIO-OVF-005", location, { slot: m.slot, above: slot.below.slot, heightPt: round1(m.boxPt) }, { at, fix: { description: `Shorten ${slot.below.slot}, so that ${m.slot} below it keeps some height.`, applicability: "review" } }));
    }
    if (m.block) out.push(...blockWarnings(location, m.block, boxPt, at));
    if (!m.table) continue;
    if (m.table.heightPt > boxPt + 0.5) {
      out.push(makeWarning("FOLIO-OVF-003", location, { slot: m.slot, heightPt: round1(m.table.heightPt), rows: m.table.rows, maxPt: round1(boxPt) }, { at, fix: { description: `Remove rows from ${m.slot}, or split the table over two slides.`, applicability: "review" } }));
    }
    for (const cell of m.table.wrapped) {
      out.push(makeWarning("FOLIO-OVF-004", location, { slot: m.slot, cell: cell.cell, lines: cell.lines }, { at, subject: cell.cell, fix: { description: `Shorten the text of ${cell.cell} in ${m.slot} to one line.`, applicability: "review" } }));
    }
  }
  return out;
}

/**
 * The overflow warnings of one measured block.
 *
 * @param maxPt - the height its box gives: the box, or the flowed height.
 * @returns FOLIO-OVF-006 when its content needs more than `maxPt`, and one
 *   FOLIO-OVF-007 naming every code line wider than the box.
 */
export function blockWarnings(location: { deck: string; slide: string; slot: string }, block: NonNullable<MeasuredSlot["block"]>, maxPt: number, at: string): FolioWarning[] {
  const out: FolioWarning[] = [];
  const slot = location.slot;
  if (block.heightPt > maxPt + 0.5) {
    out.push(makeWarning("FOLIO-OVF-006", location, { slot, heightPt: round1(block.heightPt), maxPt: round1(maxPt) }, { at, fix: { description: `Shorten the content of ${slot}, or give its box more height.`, applicability: "review" } }));
  }
  if (block.wide.length) {
    const over = round1(Math.max(...block.wide.map((w) => w.overPt)));
    const what = block.wide.length === 1 ? `line ${block.wide[0]!.line} runs ${over} pt` : `lines ${block.wide.map((w) => w.line).join(", ")} run up to ${over} pt`;
    out.push(makeWarning("FOLIO-OVF-007", location, { slot, what }, { at, fix: { description: `Break the long lines of ${slot}, or widen its box.`, applicability: "review" } }));
  }
  return out;
}
