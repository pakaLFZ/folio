# folio warning codes

Every warning folio reports, from `packages/core/src/warnings.ts`. A warning never fails a build; `error` is a severity label only. Codes are never reused.

## FOLIO-OVF-001

- Severity: warning; kind: fail; source: overflow
- Message: Slot <slot> holds <lines> lines at <pt> pt; limit is <limit>.<wrapped>

## FOLIO-OVF-002

- Severity: warning; kind: fail; source: overflow
- Message: Slot <slot> text runs <overPt> pt past its box width; the slot does not wrap.

## FOLIO-OVF-003

- Severity: warning; kind: fail; source: overflow
- Message: Table <slot> is <heightPt> pt tall with <rows> rows; its box holds <maxPt> pt.

## FOLIO-OVF-004

- Severity: warning; kind: fail; source: overflow
- Message: Table <slot>: <cell> wraps onto <lines> lines; every table row is one line.

## FOLIO-OVF-005

- Severity: warning; kind: fail; source: overflow
- Message: Slot <slot> sits below <above> and is left <heightPt> pt tall.

## FOLIO-OVF-006

- Severity: warning; kind: fail; source: overflow
- Message: Block <slot> needs <heightPt> pt; its box holds <maxPt> pt.

## FOLIO-OVF-007

- Severity: warning; kind: fail; source: overflow
- Message: Code block <slot>: <what> past the box; code never wraps.

## FOLIO-TXT-001

- Severity: warning; kind: fail; source: rule
- Message: Slot <slot> has <chars> characters; the pack allows <limit>.

## FOLIO-SPEC-001

- Severity: error; kind: fail; source: spec
- Message: Slide does not match layout <layout> at <jsonPath>: <reason>.

## FOLIO-SPEC-002

- Severity: error; kind: fail; source: spec
- Message: Layout <layout> is not in pack <pack>.

## FOLIO-SPEC-003

- Severity: error; kind: fail; source: spec
- Message: Slide file cannot be read: <reason>.

## FOLIO-FIG-001

- Severity: warning; kind: fail; source: figure
- Message: Figure file <path> does not exist.

## FOLIO-FIG-002

- Severity: note; kind: open; source: figure
- Message: Figure <path> is a plain image that no hook made; it cannot be traced. Draw it with a hook (folio hook list) or save it with folio_hook.save_traced(fig, path, script=__file__, inputs=[...]).

## FOLIO-FIG-003

- Severity: warning; kind: fail; source: figure
- Message: Figure <path> was drawn at <w> x <h> pt; its box is now <bw> x <bh> pt. Run its script again, sized by folio_hook.slot_size: <command>

## FOLIO-FIG-004

- Severity: note; kind: open; source: figure
- Message: Figure <path> has a trace that does not describe it: <reason>. Save it again with folio_hook.save_traced.

## FOLIO-FIG-005

- Severity: warning; kind: fail; source: figure
- Message: Figure <path> is outside the deck; a figure slot takes a path relative to the deck. Copy the file into <deck>/fig/ and write the slot as "fig/<name>".

## FOLIO-TAB-001

- Severity: warning; kind: fail; source: figure
- Message: Table file <path> cannot be used: <reason>.

## FOLIO-TAB-002

- Severity: note; kind: open; source: figure
- Message: Table <slot> holds numbers typed into the slide, which nothing traces; use a table hook or a .table.json file with a source block.

## FOLIO-HOOK-001

- Severity: error; kind: fail; source: hook
- Message: Hook input fails schema at <jsonPath>: <reason>.

## FOLIO-HOOK-002

- Severity: error; kind: fail; source: hook
- Message: Hook <hook> exited with code <exit>.

## FOLIO-HOOK-003

- Severity: error; kind: fail; source: hook
- Message: Hook <hook> timed out after <seconds> s.

## FOLIO-HOOK-004

- Severity: warning; kind: fail; source: hook
- Message: Hook <hook> reported: <text>.

## FOLIO-HOOK-005

- Severity: warning; kind: fail; source: hook
- Message: Output is <w>x<h>; slot expects <ew>x<eh>.

## FOLIO-HOOK-006

- Severity: error; kind: fail; source: hook
- Message: Runtime <runtime> is not configured: until it is, each hooked slot falls back to what it was given as written (a text slot shows its raw text). Add it to folio.local.toml beside folio.toml: [runtimes] <runtime> = "<path to a Python 3 with matplotlib>". For python, a python3 or python on PATH is used when nothing is set; folio doctor says which it finds.

## FOLIO-HOOK-007

- Severity: error; kind: fail; source: hook
- Message: Hook <hook> is paused after <failures> failures in a row; run folio queue resume <hook>.

## FOLIO-HOOK-008

- Severity: warning; kind: fail; source: hook
- Message: Output is stale: hook <hook> version <version> failed its canary run.

## FOLIO-HOOK-009

- Severity: warning; kind: fail; source: hook
- Message: Hook <hook> requires <requirement>, which runtime <runtime> cannot import.

## FOLIO-HOOK-010

- Severity: error; kind: fail; source: hook
- Message: Hook <hook> is not in pack <pack>.

## FOLIO-HOOK-011

- Severity: note; kind: open; source: hook
- Message: Slot is waiting for hook <hook> to fill it.

## FOLIO-HOOK-012

- Severity: error; kind: fail; source: hook
- Message: Hook <hook> cannot fill this slot: <reason>.

## FOLIO-CMT-001

- Severity: note; kind: open; source: comment
- Message: Comment <thread> by <author> awaits a reply.

## FOLIO-CMT-002

- Severity: warning; kind: open; source: comment
- Message: Comment <thread> is orphaned: <reason>.

## FOLIO-ACK-001

- Severity: note; kind: fail; source: ack
- Message: Acknowledgement of <target> is unused; the warning is gone.

## FOLIO-RND-001

- Severity: error; kind: fail; source: render
- Message: Slide <slide> did not render: <reason>. Its picture and PDF page show an error box, and nothing on it was measured. If the web app is older than its sources, run pnpm build:web.

## FOLIO-DRF-001

- Severity: note; kind: open; source: draft
- Message: Slot <slot> is <what>, drawn by the user in the editor: a sketch of intent, left out of the PDF and shots. Treat it as an instruction: draw the real element (<add>, with the template's styles, sized and aligned to the layout) or ask the user, then remove the draft (<rm>). Never just mark a draft final without making it right.
- Shows in Edit only (dashed, translucent, tagged "Draft"); not in View, the PDF or `folio shot` unless `--drafts` or `--marks`. Make one final yourself only when it already is the real thing: `folio override <deck>/<id> slots.<name>.draft=false`.

## FOLIO-VOC-001

- Severity: warning; kind: fail; source: vocabulary
- Message: <slide>/<slot> uses "<term>"; the vocabulary bank says use "<use>" (<since>).
- A text slot uses a Never word of the deck's vocabulary bank (`decks/<deck>/vocabulary.md`, else the pack's; `folio vocab show <deck> --resolved`). Whole-word, case-insensitive, Unicode-normalised. A warning only: no write is refused and no text is rewritten. Change the words as the bank says, or ask the user.

## FOLIO-ORD-001

- Severity: note; kind: open; source: order
- Message: This slide file is not listed in the deck's order; it still renders, appended at the end in id order. Add it with `folio slide move <deck> <id> --to N`, or remove the file with `folio slide rm <deck> <id>`.
