# Warnings: one model for every problem

## Demand

- Overflow is a warning only, never a build failure. *(user)*
- The user asked for warning-management standards (LSP diagnostics, SARIF and
  similar) to be learned; every warning in folio (overflow, hooks, comments)
  follows the model recommended in `WARNINGS.md`. *(user, 2026-10-12)*

- "It must be easy to learn and use for agents" *(user, 2026-10-13)*: a
  slide that did not render is an error, never silence (FOLIO-RND-001, see
  `spec/slides/pdf.md`).
- A product for agents "carries its target shape as documentation and as a
  refusal ... every refusal names what was missing and the command that fixes
  it" (user's standing rule, applied 2026-10-13): a figure slot holding an
  absolute path or a path that climbs outside the deck folder must not be
  told "does not exist" when the file is really there under a path the slide
  cannot use. It gets its own code, `FOLIO-FIG-005`, naming the fix (copy the
  file into `<deck>/fig/`, write the slot as `fig/<name>`); `FOLIO-FIG-001`
  stays for a deck-relative path that is truly missing.

## Behaviour

- One record per warning, with LSP and SARIF names: a stable `code`
  (`FOLIO-OVF-001`), `severity` (error, warning, note; a label only),
  `kind` (fail, or open for a comment awaiting someone), `source`, a rendered
  `message` and its `args`, a `location` (deck, slide, slot, JSON path), an
  optional `fix` with its applicability, `state`, first and last seen, an
  optional acknowledgement, and a docs anchor. Every code is in one catalog;
  `folio codes` prints it as `docs/warnings.md`.
- FOLIO-RND-001 (error, source `render`): "Slide <slide> did not render:
  <reason>." Raised from the print page or the live view: the layout threw,
  nothing was drawn, or a text slot reported no measurement. Without a fresh
  measurement the last render warning is kept, as overflow warnings are.
- The `id` is a fingerprint of the code, deck, stable slide id, slot and
  subject, never of measured values, positions or times: a slide that moves
  keeps its warnings, and an overflow going from 9 to 10 lines is `updated`,
  not `new`.
- Each run is compared with the slide's previous run (stored per slide in
  `.folio/warnings/<slide>.json`): `new`, `unchanged`, `updated`, and `absent`
  for one that went away.
- `folio ack <id> --reason "..." [--until DATE]` acknowledges a warning
  (external, with a reason). An acknowledged warning leaves the default counts
  and is listed with `--all`. Reviewing or undoing an acknowledgement is
  `folio ack` and `folio check --json`; the browser no longer carries an
  acknowledge form of its own (see "The Warnings tab is gone" below). An ack
  lapses when its date passes or the warning changes; an unused ack is
  reported (`FOLIO-ACK-001`). Comments cannot be acknowledged.
- Output: human lines with a total (errors, warnings, notes), `--json`,
  `--sarif` (SARIF 2.1.0), `--format github`. Exit 0 by default;
  `--max-warnings N` and `--fail-on new` exit 1; 2 is for usage or faults.
- In the browser, warnings now show only on the slide itself and on the rail:
  the slot's outline and counter (`spec/slides/overflow.md`) and a red dot on
  the rail thumbnail (`spec/chrome/style.md`). Reading or acknowledging the
  list itself is `folio check` and `folio ack`.
- **The Warnings tab is gone** (red strike on the panel's tab bar, *user,
  2026-10-13*: "get rid of this tab"). It used to list every active warning
  grouped by slide, across the whole deck, with an inline Acknowledge form.
  This also settles an old open question about the tab's scope — whether it
  should show only the current slide's warnings or every slide's: the tab
  showed every slide (grouped, no per-slide header line), and with the tab
  removed the question no longer applies to anything in the browser. The
  slot outline and rail dot were always per-slide and stay that way; the full
  list, across every slide, is `folio check`.

## Never

- A warning that fails a build by default.
- Fingerprints that include a measured value or a slide position.
- A render failure that counts as zero warnings. *(user, 2026-10-13)*
- A Warnings tab, an Acknowledge form, or any warning list in the browser's
  panel. *(user, 2026-10-13)*

## Status

- The SARIF enum values were checked against the OASIS schema on 2026-10-12;
  the agent-specific example in `WARNINGS.md` rests on press coverage only.

## Where it lives

`packages/core/src/warnings.ts`, `baseline.ts`, `report.ts`,
`packages/server/src/checks.ts`, `packages/cli/src/report.ts`, `packcmds.ts`
(`ack`, `codes`), `packages/web/src/warnings/`.

## Checks

Unit tests (fingerprint stable across values, baseline states, acks lapsing
and unused), `folio check --json | --sarif | --format github`.
