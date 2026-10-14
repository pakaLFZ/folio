/**
 * Printing a run of warnings in the formats `check`, `status` and `pdf` share,
 * and the exit policy: 0 by default, 1 only when the caller asked for it.
 */
import { relative } from "@folio/server";
import { formatGithub, formatHuman, isActive, summarize, toJsonReport, toSarif, type FolioWarning } from "@folio/core";
import type { DeckStore } from "@folio/server";

export interface ReportOptions {
  format: "human" | "json" | "sarif" | "github";
  all: boolean;
  maxWarnings: number | null;
  failOn: "new" | null;
}

export const REPORT_OPTIONS = {
  json: { type: "boolean" },
  sarif: { type: "boolean" },
  format: { type: "string" },
  all: { type: "boolean" },
  "max-warnings": { type: "string" },
  "fail-on": { type: "string" },
} as const;

/**
 * Read the shared report flags.
 *
 * @param values - parsed flags.
 * @returns the report options.
 */
export function reportOptions(values: Record<string, unknown>): ReportOptions {
  const format = values.json ? "json" : values.sarif ? "sarif" : values.format === "github" ? "github" : "human";
  return { format, all: !!values.all, maxWarnings: values["max-warnings"] !== undefined ? Number(values["max-warnings"]) : null, failOn: values["fail-on"] === "new" ? "new" : null };
}

/**
 * Print warnings and decide the exit code.
 *
 * @param warnings - the run.
 * @param stores - decks by token, to name files.
 * @param root - the workspace root, for relative paths.
 * @param options - format and exit policy.
 * @param preamble - text printed first in human mode (the open-comment table).
 * @param jsonExtra - fields printed ahead of the report's in JSON mode (`shot`'s pictures).
 * @returns 0, or 1 when `--max-warnings` or `--fail-on new` is exceeded.
 */
export function printReport(warnings: FolioWarning[], stores: Map<string, DeckStore>, root: string, options: ReportOptions, preamble = "", jsonExtra: Record<string, unknown> = {}): number {
  const fileOf = (w: FolioWarning) => {
    const store = stores.get(w.location.deck);
    return store ? relative(root, `${store.dir}/slides/${w.location.slide}.json`) : w.location.slide;
  };
  if (options.format === "json") process.stdout.write(`${JSON.stringify({ ...jsonExtra, ...toJsonReport(warnings) })}\n`);
  else if (options.format === "sarif") process.stdout.write(`${JSON.stringify(toSarif(warnings, fileOf, "0.1.0"), null, 2)}\n`);
  else if (options.format === "github") process.stdout.write(`${formatGithub(warnings, fileOf)}\n`);
  else process.stdout.write(`${preamble}${formatHuman(warnings, options.all)}\n`);
  const s = summarize(warnings);
  const activeCount = warnings.filter(isActive).length;
  if (options.maxWarnings !== null && activeCount > options.maxWarnings) return 1;
  if (options.failOn === "new" && s.new > 0) return 1;
  return 0;
}
