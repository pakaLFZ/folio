/**
 * A figure drawn by a script, pure part: the trace file `folio_hook.save_traced`
 * writes beside the image (`<image>.trace.json`), reading it, the line that
 * draws the figure again, and whether it still fits its slot's box.
 */
import { z } from "zod";
import { shellWord } from "./provenance.js";
import { tableSourceSchema } from "./tabletrace.js";

const SHA256 = z.string().regex(/^[0-9a-f]{64}$/, { error: "sha256 must be 64 lowercase hex digits" });
const POSITIVE = z.number().positive();

/** The trace file of a script-drawn figure. */
export const figureFileTraceSchema = z.strictObject({
  trace: z.literal(1),
  kind: z.literal("figure-file"),
  file: z.string().min(1),
  box: z.strictObject({ w: POSITIVE, h: POSITIVE }),
  dpi: POSITIVE,
  format: z.enum(["png", "svg", "pdf"]),
  cwd: z.string().min(1),
  source: tableSourceSchema,
  output: z.strictObject({ sha256: SHA256, bytes: z.number().int().nonnegative() }),
});
export type FigureFileRecord = z.infer<typeof figureFileTraceSchema>;

/** A box more than this many pt off the one a figure was drawn at needs a redraw. */
export const BOX_TOLERANCE_PT = 0.5;

/** The trace file that sits beside an image. */
export function figureTraceName(image: string): string {
  return `${image}.trace.json`;
}

/**
 * Read a figure trace file's parsed JSON.
 *
 * @returns the record, or the first problem with its path.
 */
export function readFigureTrace(json: unknown): { ok: true; record: FigureFileRecord } | { ok: false; reason: string } {
  const parsed = figureFileTraceSchema.safeParse(json);
  if (parsed.success) return { ok: true, record: parsed.data };
  const issue = parsed.error.issues[0];
  return { ok: false, reason: `${issue?.path.map(String).join(".") || "(root)"}: ${issue?.message ?? "invalid"}` };
}

/** The line that draws the figure again: the recorded command, run where it was run. */
export function redrawLine(record: FigureFileRecord): string {
  return `cd ${shellWord(record.cwd)} && ${record.source.command ?? `folio py ${shellWord(record.source.script)}`}`;
}

/** Whether a figure drawn at `drawn` fits a slot box of `now`, within `BOX_TOLERANCE_PT`. */
export function boxFits(drawn: { w: number; h: number }, now: { w: number; h: number }): boolean {
  return Math.abs(drawn.w - now.w) <= BOX_TOLERANCE_PT && Math.abs(drawn.h - now.h) <= BOX_TOLERANCE_PT;
}
