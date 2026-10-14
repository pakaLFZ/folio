/**
 * The folio warning record and its code catalog.
 *
 * Field names map onto LSP `Diagnostic` and SARIF 2.1.0 `result`: `severity` is
 * SARIF `level`, `kind` is SARIF `kind`, `state` is SARIF `baselineState`, `id`
 * is `partialFingerprints["folio/v1"]`. A warning never fails a build; "error"
 * is a severity label only. Codes are never reused or renumbered.
 */
import { blake2s } from "@noble/hashes/blake2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

export type FolioSeverity = "error" | "warning" | "note";
export type FolioState = "new" | "unchanged" | "updated" | "absent";
export type FolioSource = "overflow" | "rule" | "spec" | "figure" | "hook" | "comment" | "ack" | "order" | "render" | "draft" | "vocabulary";

export interface FolioLocation {
  deck: string;
  slide: string;
  slot?: string;
  jsonPath?: string;
}

export interface FolioAck {
  by: string;
  reason: string;
  at: string;
  until?: string;
  status: "accepted" | "underReview";
}

export interface FolioWarning {
  id: string;
  code: string;
  severity: FolioSeverity;
  kind: "fail" | "open";
  source: FolioSource;
  message: string;
  args: Record<string, string | number>;
  location: FolioLocation;
  related?: { location: FolioLocation; message: string }[];
  fix?: { description: string; applicability: "safe" | "review" | "placeholder"; edit?: unknown };
  state: FolioState;
  firstSeen: string;
  lastSeen: string;
  ack?: FolioAck;
  docs: string;
}

interface CodeEntry {
  severity: FolioSeverity;
  kind: "fail" | "open";
  source: FolioSource;
  template: string;
  deprecated?: boolean;
}

/** The single code catalog: default severity, kind, source and message template. */
export const WARNING_CODES: Record<string, CodeEntry> = {
  "FOLIO-OVF-001": { severity: "warning", kind: "fail", source: "overflow", template: "Slot {slot} holds {lines} lines at {pt} pt; limit is {limit}.{wrapped}" },
  "FOLIO-OVF-002": { severity: "warning", kind: "fail", source: "overflow", template: "Slot {slot} text runs {overPt} pt past its box width; the slot does not wrap." },
  "FOLIO-OVF-003": { severity: "warning", kind: "fail", source: "overflow", template: "Table {slot} is {heightPt} pt tall with {rows} rows; its box holds {maxPt} pt." },
  "FOLIO-OVF-004": { severity: "warning", kind: "fail", source: "overflow", template: "Table {slot}: {cell} wraps onto {lines} lines; every table row is one line." },
  "FOLIO-OVF-005": { severity: "warning", kind: "fail", source: "overflow", template: "Slot {slot} sits below {above} and is left {heightPt} pt tall." },
  "FOLIO-OVF-006": { severity: "warning", kind: "fail", source: "overflow", template: "Block {slot} needs {heightPt} pt; its box holds {maxPt} pt." },
  "FOLIO-OVF-007": { severity: "warning", kind: "fail", source: "overflow", template: "Code block {slot}: {what} past the box; code never wraps." },
  "FOLIO-TXT-001": { severity: "warning", kind: "fail", source: "rule", template: "Slot {slot} has {chars} characters; the pack allows {limit}." },
  "FOLIO-SPEC-001": { severity: "error", kind: "fail", source: "spec", template: "Slide does not match layout {layout} at {jsonPath}: {reason}." },
  "FOLIO-SPEC-002": { severity: "error", kind: "fail", source: "spec", template: "Layout {layout} is not in pack {pack}." },
  "FOLIO-SPEC-003": { severity: "error", kind: "fail", source: "spec", template: "Slide file cannot be read: {reason}." },
  "FOLIO-FIG-001": { severity: "warning", kind: "fail", source: "figure", template: "Figure file {path} does not exist." },
  "FOLIO-FIG-002": { severity: "note", kind: "open", source: "figure", template: "Figure {path} is a plain image that no hook made; it cannot be traced. Draw it with a hook (folio hook list) or save it with folio_hook.save_traced(fig, path, script=__file__, inputs=[...])." },
  "FOLIO-FIG-003": { severity: "warning", kind: "fail", source: "figure", template: "Figure {path} was drawn at {w} x {h} pt; its box is now {bw} x {bh} pt. Run its script again, sized by folio_hook.slot_size: {command}" },
  "FOLIO-FIG-004": { severity: "note", kind: "open", source: "figure", template: "Figure {path} has a trace that does not describe it: {reason}. Save it again with folio_hook.save_traced." },
  "FOLIO-FIG-005": { severity: "warning", kind: "fail", source: "figure", template: "Figure {path} is outside the deck; a figure slot takes a path relative to the deck. Copy the file into <deck>/fig/ and write the slot as \"fig/<name>\"." },
  "FOLIO-TAB-001": { severity: "warning", kind: "fail", source: "figure", template: "Table file {path} cannot be used: {reason}." },
  "FOLIO-TAB-002": { severity: "note", kind: "open", source: "figure", template: "Table {slot} holds numbers typed into the slide, which nothing traces; use a table hook or a .table.json file with a source block." },
  "FOLIO-HOOK-001": { severity: "error", kind: "fail", source: "hook", template: "Hook input fails schema at {jsonPath}: {reason}." },
  "FOLIO-HOOK-002": { severity: "error", kind: "fail", source: "hook", template: "Hook {hook} exited with code {exit}." },
  "FOLIO-HOOK-003": { severity: "error", kind: "fail", source: "hook", template: "Hook {hook} timed out after {seconds} s." },
  "FOLIO-HOOK-004": { severity: "warning", kind: "fail", source: "hook", template: "Hook {hook} reported: {text}." },
  "FOLIO-HOOK-005": { severity: "warning", kind: "fail", source: "hook", template: "Output is {w}x{h}; slot expects {ew}x{eh}." },
  "FOLIO-HOOK-006": { severity: "error", kind: "fail", source: "hook", template: "Runtime {runtime} is not configured: until it is, each hooked slot falls back to what it was given as written (a text slot shows its raw text). Add it to folio.local.toml beside folio.toml: [runtimes] {runtime} = \"<path to a Python 3 with matplotlib>\". For python, a python3 or python on PATH is used when nothing is set; folio doctor says which it finds." },
  "FOLIO-HOOK-007": { severity: "error", kind: "fail", source: "hook", template: "Hook {hook} is paused after {failures} failures in a row; run folio queue resume {hook}." },
  "FOLIO-HOOK-008": { severity: "warning", kind: "fail", source: "hook", template: "Output is stale: hook {hook} version {version} failed its canary run." },
  "FOLIO-HOOK-009": { severity: "warning", kind: "fail", source: "hook", template: "Hook {hook} requires {requirement}, which runtime {runtime} cannot import." },
  "FOLIO-HOOK-010": { severity: "error", kind: "fail", source: "hook", template: "Hook {hook} is not in pack {pack}." },
  "FOLIO-HOOK-011": { severity: "note", kind: "open", source: "hook", template: "Slot is waiting for hook {hook} to fill it." },
  "FOLIO-HOOK-012": { severity: "error", kind: "fail", source: "hook", template: "Hook {hook} cannot fill this slot: {reason}." },
  "FOLIO-CMT-001": { severity: "note", kind: "open", source: "comment", template: "Comment {thread} by {author} awaits a reply." },
  "FOLIO-CMT-002": { severity: "warning", kind: "open", source: "comment", template: "Comment {thread} is orphaned: {reason}." },
  "FOLIO-ACK-001": { severity: "note", kind: "fail", source: "ack", template: "Acknowledgement of {target} is unused; the warning is gone." },
  "FOLIO-RND-001": { severity: "error", kind: "fail", source: "render", template: "Slide {slide} did not render: {reason}. Its picture and PDF page show an error box, and nothing on it was measured. If the web app is older than its sources, run pnpm build:web." },
  "FOLIO-DRF-001": { severity: "note", kind: "open", source: "draft", template: "Slot {slot} is {what}, drawn by the user in the editor: a sketch of intent, left out of the PDF and shots. Treat it as an instruction: draw the real element ({add}, with the template's styles, sized and aligned to the layout) or ask the user, then remove the draft ({rm}). Never just mark a draft final without making it right." },
  "FOLIO-VOC-001": { severity: "warning", kind: "fail", source: "vocabulary", template: "{slide}/{slot} uses \"{term}\"; the vocabulary bank says use \"{use}\" ({since})." },
  "FOLIO-ORD-001": { severity: "note", kind: "open", source: "order", template: "This slide file is not listed in the deck's order; it still renders, appended at the end in id order. Add it with `folio slide move <deck> <id> --to N`, or remove the file with `folio slide rm <deck> <id>`." },
};

/**
 * Fill a message template.
 *
 * @param template - text with `{name}` placeholders.
 * @param args - values for the placeholders.
 * @returns the message; an unknown placeholder is left as written.
 */
export function renderTemplate(template: string, args: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in args ? String(args[key]) : whole));
}

/**
 * The stable fingerprint of a warning.
 *
 * @param code - the warning code.
 * @param location - deck, stable slide id and slot.
 * @param subject - what distinguishes two warnings of one code in one slot: the
 *   JSON path, hook name or thread id; empty when nothing does.
 * @returns 16 hex digits of blake2s over the joined parts. Measured values,
 *   messages, slide positions and times are left out on purpose.
 */
export function fingerprint(code: string, location: FolioLocation, subject = ""): string {
  const key = [code, location.deck, location.slide, location.slot ?? "", subject].join("\u001f");
  return bytesToHex(blake2s(utf8ToBytes(key), { dkLen: 8 }));
}

/**
 * Build a warning from its code.
 *
 * @param code - a key of `WARNING_CODES`.
 * @param location - where the warning sits.
 * @param args - template values.
 * @param options - `subject` for the fingerprint, `at` as the time seen (ISO),
 *   and an optional `fix` or `related` list.
 * @returns a warning in state `new`; `diffWarnings` sets the real state.
 */
export function makeWarning(
  code: string,
  location: FolioLocation,
  args: Record<string, string | number>,
  options: { subject?: string; at: string; fix?: FolioWarning["fix"]; related?: FolioWarning["related"] },
): FolioWarning {
  const entry = WARNING_CODES[code];
  if (!entry) throw new Error(`unknown warning code ${code}`);
  const warning: FolioWarning = {
    id: fingerprint(code, location, options.subject),
    code,
    severity: entry.severity,
    kind: entry.kind,
    source: entry.source,
    message: renderTemplate(entry.template, args),
    args,
    location,
    state: "new",
    firstSeen: options.at,
    lastSeen: options.at,
    docs: `docs/warnings.md#${code.toLowerCase()}`,
  };
  if (options.fix) warning.fix = options.fix;
  if (options.related) warning.related = options.related;
  return warning;
}
