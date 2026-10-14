/**
 * Baseline diff and acknowledgement of warnings between two runs.
 *
 * `new`/`unchanged`/`updated`/`absent` follow SARIF `baselineState`. An
 * acknowledgement is an external suppression with a reason; it lapses when the
 * warning changes, when its date passes, and is reported when it goes unused.
 */
import { makeWarning, type FolioAck, type FolioWarning } from "./warnings.js";

/**
 * Compare this run's warnings with the previous run's.
 *
 * @param previous - warnings stored after the last run (may include `absent` ones).
 * @param current - warnings found now, each in state `new`.
 * @param at - the time of this run (ISO).
 * @returns current warnings with `state` and `firstSeen` carried over, followed
 *   by previously present warnings that are now gone, in state `absent`.
 */
export function diffWarnings(previous: FolioWarning[], current: FolioWarning[], at: string): FolioWarning[] {
  const before = new Map(previous.filter((w) => w.state !== "absent").map((w) => [w.id, w]));
  const seen = new Set<string>();
  const out: FolioWarning[] = current.map((warning) => {
    seen.add(warning.id);
    const old = before.get(warning.id);
    if (!old) return { ...warning, state: "new" as const, firstSeen: at, lastSeen: at };
    const same = JSON.stringify(old.args) === JSON.stringify(warning.args);
    return { ...warning, state: same ? ("unchanged" as const) : ("updated" as const), firstSeen: old.firstSeen, lastSeen: at, ack: old.ack };
  });
  for (const old of before.values()) {
    if (!seen.has(old.id)) out.push({ ...old, state: "absent" });
  }
  return out;
}

/**
 * Attach acknowledgements and report the ones that no longer apply.
 *
 * @param warnings - output of `diffWarnings`.
 * @param acks - acknowledgements by warning id, as stored by `folio ack`.
 * @param at - the time of this run (ISO), to expire dated acks.
 * @returns the warnings with `ack` set where it still holds, plus one
 *   FOLIO-ACK-001 note per ack whose warning is absent or missing.
 */
export function applyAcks(warnings: FolioWarning[], acks: Record<string, FolioAck & { target?: FolioWarning["location"] }>, at: string): FolioWarning[] {
  const present = new Map(warnings.filter((w) => w.state !== "absent").map((w) => [w.id, w]));
  const out = warnings.map((warning) => {
    const { ack: _dropped, ...bare } = warning;
    const ack = acks[warning.id];
    if (!ack || warning.state === "absent" || warning.source === "comment") return bare;
    if (warning.state === "updated" || (ack.until && ack.until < at)) return bare;
    return { ...bare, ack };
  });
  for (const [id, ack] of Object.entries(acks)) {
    if (present.has(id)) continue;
    const location = ack.target ?? { deck: "", slide: "" };
    out.push(makeWarning("FOLIO-ACK-001", location, { target: id }, { subject: id, at }));
  }
  return out;
}

/**
 * Whether a warning counts toward the default totals.
 *
 * @param warning - any warning.
 * @returns false for absent and acknowledged warnings, true otherwise.
 */
export function isActive(warning: FolioWarning): boolean {
  return warning.state !== "absent" && !warning.ack;
}
