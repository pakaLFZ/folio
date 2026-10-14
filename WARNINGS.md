# Folio warnings: standards and a recommended model

## (a) What the standards already settle

*Checked 2026-10-12 against the OASIS schema `sarif-schema-2.1.0.json` (oasis-tcs/sarif-spec): `level`, `kind`, `baselineState`, suppression `kind` and `status` hold exactly the values listed below. The Zero example remains press-level.*

**The shape of a diagnostic has converged across tools.** Every format below carries the same core: a severity, a stable code, a human message, a location, and optional related locations and fixes. The LSP `Diagnostic` has `range`, `severity` (Error 1, Warning 2, Information 3, Hint 4), `code`, `codeDescription.href`, `source`, `message`, `tags` (Unnecessary, Deprecated), `relatedInformation` and an opaque `data` field that is round-tripped to code actions.[^lsp] rustc's JSON has `message`, `code {code, explanation}`, `level` (error, warning, note, help, failure-note), `spans` and `children`; each span may carry `suggested_replacement` with `suggestion_applicability` of MachineApplicable, MaybeIncorrect, HasPlaceholders or Unspecified.[^rustc] ESLint's formatter output gives per-file `messages` with `ruleId`, `severity` (1 warn, 2 error), `line/column`, and `fix`/`suggestions`, plus `errorCount` and `warningCount` totals.[^eslintfmt] TypeScript uses numeric codes (TS2345) with a category of Error, Warning, Suggestion or Message. GitHub Actions turns `::warning file=…,line=…,col=…,endLine=…,title=…::message` lines into annotations.[^gha] RFC 9457 Problem Details (`type` URI, `title`, `status`, `detail`, `instance`, extensions) is the HTTP analogue: its `type` URI is the same idea as a code with a docs link.[^rfc]

**SARIF 2.1.0 is the exchange format for results that persist across runs.** A `result` has `ruleId`, `level` (none, note, warning, error), `kind` (fail, pass, open, review, informational, notApplicable), `message`, `locations`, `fingerprints` and `partialFingerprints`, `baselineState` (new, unchanged, updated, absent) and `suppressions` (each with `kind` inSource or external, `status` accepted, underReview or rejected, and a `justification`).[^sarif] Rules live once in `tool.driver.rules` with `id`, `shortDescription`, `helpUri` and `defaultConfiguration.level`. `level` says how bad a failure is; `kind` says whether the result is a failure at all, which suits "awaiting reply" states that are not defects.

**Warnings-as-errors is always opt-in.** `-Werror`, `eslint --max-warnings N` and pytest `-W error` all leave the default permissive and let a caller raise the bar. Python's `warnings` filters (default, error, ignore, always, module, once) and Node's `process.emitWarning(msg, {code})` with `--disable-warning=CODE` show filters keyed on category and code, not on message text.[^pywarn][^node]

**Suppression works best with a reason and an expiry signal.** ESLint bulk suppressions (v9.24, 2025) store per-file, per-rule counts in `eslint-suppressions.json`; a count that rises reports all violations again, and unused entries fail the run until `--prune-suppressions` is applied.[^eslintsup] Rust's `#[expect(lint, reason = "…")]` fires `unfulfilled_lint_expectations` once the warning disappears, and Ruff's RUF100 flags unused `noqa` comments.[^expect] Both stop dead suppressions from piling up. Neither mypy nor Ruff has a native baseline; third-party tools fill that gap.

**Agent-readable means stable codes plus structured fixes.** LSP `CodeAction` and SARIF `fixes` hold machine edits. rustc's applicability levels tell a tool which fixes are safe to apply without review. Vercel's experimental Zero language (2026) was reported to emit JSON-only diagnostics with stable codes and typed repair ids, aimed at agents.[^zero] This is a press-level claim, not a standard.

**Editors use three layers of display.** VS Code shows an inline squiggle, a gutter or overview-ruler mark, a Problems panel grouped by file with filters, and error and warning counts in the status bar. ESLint and tsc print the same tiers: one line per item, then a total.

## (b) Recommended folio warning model

**One record per warning, with names that map directly onto LSP and SARIF.** This is folio's own construction built on the field names above.

```ts
type FolioSeverity = "error" | "warning" | "note";        // SARIF level; LSP 1/2/3
type FolioState = "new" | "unchanged" | "updated" | "absent"; // SARIF baselineState

interface FolioWarning {
  id: string;            // fingerprint, see recipe; SARIF partialFingerprints["folio/v1"]
  code: string;          // "FOLIO-OVF-001"; SARIF ruleId, LSP code
  severity: FolioSeverity;
  kind: "fail" | "open"; // SARIF kind: open = awaiting someone, e.g. comment
  source: "overflow" | "hook" | "comment"; // LSP source
  message: string;       // rendered from the catalog template
  args: Record<string, string | number>; // template values; SARIF message.arguments
  location: { deck: string; slide: string; slot?: string; jsonPath?: string };
  related?: { location: FolioWarning["location"]; message: string }[];
  fix?: { description: string; applicability: "safe" | "review" | "placeholder";
          edit?: unknown };         // LSP CodeAction / SARIF fixes / rustc applicability
  state: FolioState;
  firstSeen: string; lastSeen: string; // ISO times
  ack?: { by: string; reason: string; at: string; until?: string; // SARIF suppression
          status: "accepted" | "underReview" };
  docs: string;          // codeDescription.href / helpUri
}
```

**The code catalog is a single file that drives messages, docs and default severity.**

| Code | Default | Kind | Template |
|---|---|---|---|
| FOLIO-OVF-001 | warning | fail | `Slot {slot} holds {lines} lines at {pt} pt; limit is {limit}.{wrapped}` |
| FOLIO-HOOK-001 | error | fail | `Hook input fails schema at {jsonPath}: {reason}.` |
| FOLIO-HOOK-002 | error | fail | `Hook {hook} exited with code {exit}.` |
| FOLIO-HOOK-003 | error | fail | `Hook {hook} timed out after {seconds} s.` |
| FOLIO-HOOK-004 | warning | fail | `Hook {hook} reported: {text}.` |
| FOLIO-HOOK-005 | warning | fail | `Output is {w}x{h}; slot expects {ew}x{eh}.` |
| FOLIO-CMT-001 | note | open | `Comment {thread} by {author} awaits a reply.` |

Codes are never reused or renumbered. A retired code stays in the catalog marked deprecated. "Error" here is a label for severity only; it never fails a build.

**The fingerprint ignores everything that changes without the problem changing.** Hash `code + deck + stable slide id + slot + subject`, where subject is the JSON path for schema errors, the hook name for hook failures and the thread id for comments. Leave out slide position, measured values, message text and timestamps. A slide that moves keeps its warnings. An overflow that goes from 9 to 10 lines is `updated`, not `new`. A fingerprint present last run and missing now is `absent`, which is folio's "resolved". Store the previous run's set in `.folio/warnings.json` so that `status` can diff against it. Writes must be per slide, so that parallel workers do not race on one file.

**Acknowledgement is external, needs a reason, and expires.** `folio ack <id> --reason "…" [--until DATE]` writes a SARIF-style external suppression. An acknowledged warning is hidden from default counts but listed under `--all`. Three rules, taken from `#[expect]`, RUF100 and ESLint pruning, stop acks from going stale. First, an ack whose fingerprint has gone `absent` is reported as unused (FOLIO-ACK-001, note). Second, an ack whose `until` date has passed reactivates the warning. Third, an `updated` warning drops its ack, because the problem has changed. Comments cannot be acknowledged. They close only when the thread is answered.

**CLI output has three formats and one exit policy.**

| Mode | Shape |
|---|---|
| human (default) | `slide-07/body  warning  FOLIO-OVF-001  Slot body holds 9 lines at 18 pt; limit is 7.` followed by `3 warnings (1 new), 1 note, 2 acknowledged` |
| `--json` | `{"version":1,"summary":{…counts by severity and state},"warnings":[FolioWarning…]}`, compact, one object, stable key order |
| `--sarif` | SARIF 2.1.0 log: rules from the catalog, `partialFingerprints`, `baselineState`, `suppressions` |
| `--format github` | `::warning file=…,title=FOLIO-OVF-001::…` lines |

The exit code is 0 by default, including when warnings exist. `--max-warnings N` exits 1 when unacknowledged warnings exceed N. `--fail-on new` exits 1 only when a new warning appears, which is the ratchet that suits parallel agents. Exit 2 is kept for usage or internal faults. Agents should read `fix.applicability` and apply only `safe` fixes on their own.

**The browser editor follows the editor conventions.** A slot carries a badge coloured by its worst severity: red for error, amber for warning, blue for note. The badge shows a count, and new items get a dot. Hovering a badge shows the rendered message, the code linked to its docs page, and the fix, if one exists. A side panel lists the warnings grouped by slide, filters by code, severity and state, and offers Acknowledge with a required reason field. The header shows totals in the order errors, warnings, notes. Acknowledged items show as a grey outline, not hidden, so that they stay visible but do not alarm.

## (c) Open-source pieces

| Package | Covers | Licence | Latest |
|---|---|---|---|
| `vscode-languageserver-types` | LSP `Diagnostic`, `CodeAction` types | MIT | 3.18.4, 2026-09-25 |
| `@types/sarif` | SARIF 2.1.0 TypeScript types | MIT | 2.1.7, 2023-11-07 (spec is frozen, so age is fine) |
| `node-sarif-builder` | Builds and writes SARIF logs | MIT | 5.0.0, 2026-08-11 |
| `@microsoft/sarif-multitool` | Validates and matches SARIF results across runs | MIT | 5.7.0, 2026-08-27 |
| `@microsoft/eslint-formatter-sarif` | Reference ESLint-to-SARIF mapping | MIT | 3.1.0, 2024-04-12 |

Use the type packages as dependencies. Keep the SARIF builder and multitool as optional extras behind `--sarif`. Fingerprinting and the diff are small enough to write in folio itself. No surveyed package handles slot-level overflow or comment threads.

[^lsp]: Microsoft. "Language Server Protocol Specification 3.17." https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#diagnostic
[^rustc]: Rust Project. "JSON Output." *The rustc book*. https://doc.rust-lang.org/rustc/json.html
[^eslintfmt]: OpenJS Foundation. "Formatters Reference." *ESLint*. https://eslint.org/docs/latest/use/formatters/
[^gha]: GitHub. "Workflow commands for GitHub Actions." https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands
[^rfc]: Nottingham, M., et al. "RFC 9457: Problem Details for HTTP APIs." IETF, 2023. https://www.rfc-editor.org/rfc/rfc9457
[^sarif]: OASIS. "Static Analysis Results Interchange Format (SARIF) Version 2.1.0, Errata 01." https://docs.oasis-open.org/sarif/sarif/v2.1.0/errata01/os/sarif-v2.1.0-errata01-os-complete.html
[^pywarn]: Python Software Foundation. "warnings: Warning control." https://docs.python.org/3/library/warnings.html
[^node]: OpenJS Foundation. "process.emitWarning" and "--disable-warning." *Node.js docs*. https://nodejs.org/api/process.html#processemitwarningwarning-options
[^eslintsup]: ESLint. "Introducing bulk suppressions." 2025. https://eslint.org/blog/2025/04/introducing-bulk-suppressions/ ; "Bulk Suppressions." https://eslint.org/docs/latest/use/suppressions
[^expect]: Rust Project. "Lint levels: expect." https://doc.rust-lang.org/rustc/lints/levels.html ; Astral. "unused-noqa (RUF100)." https://docs.astral.sh/ruff/rules/unused-noqa/
[^zero]: "Vercel's Zero wants compilers to talk to AI agents." *HackerNoon*, 2026. https://hackernoon.com/vercels-zero-wants-compilers-to-talk-to-ai-agents
