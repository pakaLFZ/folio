/**
 * Warning reports: totals, the human line format, GitHub annotations, the
 * `--json` document and a SARIF 2.1.0 log. Pure: each returns a value.
 */
import { isActive } from "./baseline.js";
import { WARNING_CODES, type FolioWarning } from "./warnings.js";

export interface WarningSummary {
  error: number;
  warning: number;
  note: number;
  new: number;
  acknowledged: number;
  absent: number;
}

/**
 * Count warnings by severity and state.
 *
 * @param warnings - a full run, including absent and acknowledged ones.
 * @returns severity counts of active warnings, and counts of new, acknowledged
 *   and absent ones.
 */
export function summarize(warnings: FolioWarning[]): WarningSummary {
  const s: WarningSummary = { error: 0, warning: 0, note: 0, new: 0, acknowledged: 0, absent: 0 };
  for (const w of warnings) {
    if (w.state === "absent") s.absent += 1;
    else if (w.ack) s.acknowledged += 1;
    else {
      s[w.severity] += 1;
      if (w.state === "new") s.new += 1;
    }
  }
  return s;
}

/**
 * The one-line total, ordered errors, warnings, notes.
 *
 * @param s - output of `summarize`.
 * @returns e.g. `0 errors, 3 warnings (1 new), 1 note, 2 acknowledged`.
 */
export function summaryLine(s: WarningSummary): string {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  const parts = [plural(s.error, "error"), `${plural(s.warning, "warning")}${s.new ? ` (${s.new} new)` : ""}`, plural(s.note, "note")];
  if (s.acknowledged) parts.push(`${s.acknowledged} acknowledged`);
  return parts.join(", ");
}

/**
 * Human-readable report, one line per active warning and a total.
 *
 * @param warnings - a full run.
 * @param all - include acknowledged warnings, marked `[ack]`.
 * @returns lines such as `s003/note  warning  FOLIO-OVF-001  Slot note holds ...`.
 */
export function formatHuman(warnings: FolioWarning[], all = false): string {
  const shown = warnings.filter((w) => w.state !== "absent" && (all || !w.ack));
  const lines = shown.map((w) => {
    const where = `${w.location.slide}${w.location.slot ? `/${w.location.slot}` : ""}`;
    const flags = `${w.state === "new" ? " [new]" : ""}${w.ack ? " [ack]" : ""}`;
    return `${where.padEnd(18)} ${w.severity.padEnd(7)} ${w.code.padEnd(15)} ${w.message}${flags}`;
  });
  lines.push(summaryLine(summarize(warnings)));
  return lines.join("\n");
}

/**
 * GitHub Actions annotation lines for active warnings.
 *
 * @param warnings - a full run.
 * @param fileOf - maps a warning to the file it lives in, relative to the repo.
 * @returns `::warning file=...,title=CODE::message` lines.
 */
export function formatGithub(warnings: FolioWarning[], fileOf: (w: FolioWarning) => string): string {
  const level = { error: "error", warning: "warning", note: "notice" } as const;
  return warnings
    .filter(isActive)
    .map((w) => `::${level[w.severity]} file=${fileOf(w)},title=${w.code}::${w.message.replace(/\n/g, " ")}`)
    .join("\n");
}

/**
 * The `--json` document.
 *
 * @param warnings - a full run.
 * @returns `{version: 1, summary, warnings}` with stable key order.
 */
export function toJsonReport(warnings: FolioWarning[]) {
  return { version: 1, summary: summarize(warnings), warnings };
}

/**
 * A SARIF 2.1.0 log of a run.
 *
 * @param warnings - a full run.
 * @param fileOf - maps a warning to its file, used as the artifact location.
 * @param toolVersion - folio's version string.
 * @returns a SARIF log object with the code catalog as rules.
 */
export function toSarif(warnings: FolioWarning[], fileOf: (w: FolioWarning) => string, toolVersion: string) {
  const rules = Object.entries(WARNING_CODES).map(([id, e]) => ({
    id,
    shortDescription: { text: e.template },
    helpUri: `docs/warnings.md#${id.toLowerCase()}`,
    defaultConfiguration: { level: e.severity },
  }));
  const results = warnings.map((w) => ({
    ruleId: w.code,
    level: w.severity,
    kind: w.kind,
    message: { text: w.message },
    locations: [{ physicalLocation: { artifactLocation: { uri: fileOf(w) } }, logicalLocations: [{ fullyQualifiedName: [w.location.deck, w.location.slide, w.location.slot].filter(Boolean).join("/") }] }],
    partialFingerprints: { "folio/v1": w.id },
    baselineState: w.state,
    ...(w.ack ? { suppressions: [{ kind: "external", status: w.ack.status, justification: w.ack.reason }] } : {}),
  }));
  return {
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    version: "2.1.0",
    runs: [{ tool: { driver: { name: "folio", version: toolVersion, rules } }, results }],
  };
}
