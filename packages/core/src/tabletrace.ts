/**
 * Where a table's numbers come from, pure part: the optional `source` block a
 * producing script writes into a `.table.json` file, reading such a file, and
 * which inline tables hold numbers that nothing traces.
 */
import { z } from "zod";
import { tableDataSchema, type TableData } from "./tables.js";

/** What made a `.table.json` file, written by the script that made it; folio never guesses it. */
export const tableSourceSchema = z.strictObject({
  script: z.string().min(1, { error: "source.script is empty; name the script that wrote this table" }),
  command: z.string().optional(),
  inputs: z.array(z.strictObject({ path: z.string().min(1), sha256: z.string().regex(/^[0-9a-f]{64}$/, { error: "sha256 must be 64 lowercase hex digits" }) })).optional(),
  at: z.string().optional(),
});
export type TableSource = z.infer<typeof tableSourceSchema>;

/**
 * Read a `.table.json` file's parsed JSON.
 *
 * @returns the table and its source block (null when it has none), or the
 *   first problem with its path: a bad table, a bad source block, or a key
 *   that is neither.
 */
export function readTableFile(json: unknown): { ok: true; table: TableData; source: TableSource | null } | { ok: false; reason: string } {
  if (!json || typeof json !== "object" || Array.isArray(json)) return { ok: false, reason: 'it is not {"columns": [...], "rows": [[...]]}' };
  const { columns, rows, source, ...rest } = json as Record<string, unknown>;
  const extra = Object.keys(rest)[0];
  if (extra) return { ok: false, reason: `${extra}: unknown key; a table file holds columns, rows and an optional source` };
  const table = tableDataSchema.safeParse({ columns, rows });
  if (!table.success) return { ok: false, reason: issueText(table.error.issues[0]) };
  if (source === undefined) return { ok: true, table: table.data, source: null };
  const parsed = tableSourceSchema.safeParse(source);
  if (!parsed.success) return { ok: false, reason: `source.${issueText(parsed.error.issues[0])}` };
  return { ok: true, table: table.data, source: parsed.data };
}

function issueText(issue: { path: PropertyKey[]; message: string } | undefined): string {
  return `${issue?.path.map(String).join(".") || "(root)"}: ${issue?.message ?? "invalid"}`;
}

/**
 * A numeric cell: after inline markup (`**`, `_{}`, `^{}`) is removed and the
 * ends trimmed, an optional sign (`+`, `-`, U+2212), digits with an optional
 * decimal part (or a leading-dot decimal), thousands commas allowed, an
 * optional exponent (`e-3`), then optionally `%` or up to three unit words
 * (each starting with a letter, `°`, `µ` or `Å`, then letters, digits and
 * `/ ^ - · °`), e.g. `0.52`, `-1.2e-3`, `12 %`, `0.68 eV`, `300 K`, `1.5 kJ mol^-1`.
 */
const NUMERIC = /^[+\-\u2212]?(?:(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?|\.\d+)(?:[eE][+\-\u2212]?\d+)?\s*(?:%|[A-Za-z\u00b0\u00b5\u00c5][A-Za-z\u00b0\u00b5\u00c50-9/^\-\u2212\u00b7]*(?:\s+[A-Za-z\u00b0\u00b5\u00c5][A-Za-z\u00b0\u00b5\u00c50-9/^\-\u2212\u00b7]*){0,2})?$/;

/**
 * Whether a table cell holds a number (see `NUMERIC`).
 *
 * @returns true for a cell whose text is a number with an optional unit.
 */
export function isNumericCell(cell: string): boolean {
  const text = cell.replace(/\*\*/g, "").replace(/[_^]\{([^}]*)\}/g, "^$1").trim();
  return NUMERIC.test(text);
}

/**
 * Whether an inline table holds numbers: any body cell is numeric. Headers do not count.
 */
export function hasNumbers(table: Pick<TableData, "rows">): boolean {
  return table.rows.some((row) => row.some(isNumericCell));
}
