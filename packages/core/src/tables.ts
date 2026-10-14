/**
 * Table slots: the content a slide gives, the named style the pack gives, and
 * the height that follows from the rows. Every row is one line; a table that
 * outgrows its box, or a cell that wraps, is an overflow warning, never a
 * smaller font.
 */
import { z } from "zod";
import { deepMerge, type RefinedSlot } from "./overrides.js";
import type { Pack, TableStyle } from "./pack.js";

const SHAPE = '{"columns": ["..."], "rows": [["..."]]}';

/** The rows of a table, inline in the slide or in a `<subject>.table.json` file beside it. */
export const tableDataSchema = z
  .strictObject({
    columns: z.array(z.string(), { error: `columns must be an array of strings, one per column; write ${SHAPE}` }).min(1, { error: "columns is empty; name at least one column" }),
    rows: z.array(z.array(z.string(), { error: "each row must be an array of strings, one per cell" }), { error: `rows must be an array of rows; write ${SHAPE}` }),
  })
  .superRefine((table, ctx) => {
    table.rows.forEach((row, i) => {
      if (row.length !== table.columns.length) ctx.addIssue({ code: "custom", path: ["rows", i], message: `row ${i + 1} has ${row.length} cells; the table has ${table.columns.length} columns (${table.columns.map((c) => JSON.stringify(c)).join(", ")}), so every row has ${table.columns.length} cells` });
    });
  });
export type TableData = z.infer<typeof tableDataSchema>;

/**
 * The slide value of a table slot.
 *
 * @param styles - the pack's table style names; `tableStyle` must be one of them.
 * @returns rows inline, or `{src}` naming a deck-relative `.table.json` file;
 *   either may carry `tableStyle` to pick another named style of the pack.
 */
export function tableValueSchema(styles: string[]) {
  const tableStyle = z
    .string()
    .refine((name) => styles.includes(name), { error: (issue) => `tableStyle "${String(issue.input)}" is not one of the pack's table styles (known: ${styles.join(", ") || "none"})` })
    .optional();
  const inline = tableDataSchema.safeExtend({ tableStyle });
  const file = z.strictObject({
    src: z.string().regex(/\.table\.json$/, { error: 'src must name a "<subject>.table.json" file, relative to the deck' }),
    tableStyle,
  });
  return z.union([inline, file], { error: `a table is ${SHAPE} or {"src": "<subject>.table.json"}` }).nullable();
}
export type TableValue = { columns: string[]; rows: string[][]; tableStyle?: string } | { src: string; tableStyle?: string };

/**
 * The style a table is drawn with: the slide's `tableStyle` wins over the
 * slot's, and the slot's `table` override is laid over either.
 *
 * @param pack - the pack.
 * @param slot - the table slot.
 * @param value - the slide's value of the slot, or null.
 * @returns the style name and style; a slide naming an unknown style falls back
 *   to the slot's (the spec check reports the name).
 */
export function tableStyleOf(pack: Pack, slot: RefinedSlot, value: unknown): { name: string; style: TableStyle } {
  const requested = value && typeof value === "object" ? (value as { tableStyle?: unknown }).tableStyle : undefined;
  const name = typeof requested === "string" && pack.tables[requested] ? requested : (slot.tableStyle ?? "");
  return { name, style: deepMerge(pack.tables[name]!, slot.table) };
}

/** The height of one row in pt: one line plus the top and bottom cell padding. */
export function tableRowHeight(style: TableStyle): number {
  return style.size * style.lineHeight + style.cellPad[0] + style.cellPad[2];
}

/**
 * The height a table takes: the header row (when the style has one) plus one
 * line per body row.
 *
 * @param style - the table style.
 * @param rows - the number of body rows.
 */
export function tableHeight(style: TableStyle, rows: number): number {
  return (rows + (style.header ? 1 : 0)) * tableRowHeight(style);
}

/**
 * How many body rows fit a height.
 *
 * @returns the largest row count whose table height is within `heightPt`.
 */
export function tableRowsThatFit(style: TableStyle, heightPt: number): number {
  return Math.max(0, Math.floor((heightPt + 0.01) / tableRowHeight(style)) - (style.header ? 1 : 0));
}

/** The alignment of column `index` (0-based); an array shorter than the table leaves the rest left. */
export function columnAlign(style: TableStyle, index: number): "left" | "center" | "right" {
  return typeof style.align === "string" ? style.align : (style.align[index] ?? "left");
}
