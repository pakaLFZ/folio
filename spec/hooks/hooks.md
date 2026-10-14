# Hooks: a template's script that fills any slot

## Demand

- "for certain plots, consider allow it to things like a hook, meaning in this
  template, u do this auto run script to generate the plot, thus agent just
  need to input what to plot, and if things go wrong there will be warnings
  and stuff." *(user, 2026-10-12)*
- The first hook follows a house plot style, "but make it optional for the
  package". *(user, 2026-10-12)*
- "Hooks should work for text as well, meaning optional function runs when
  textbox recieves content" *(user, 2026-10-13)*
- "Consider change it so that its more general: hook works for everything"
  *(user, 2026-10-13)*. This turns the figure-only hook of 2026-10-12 into one
  mechanism for every slot kind: text, figure and table.

## Behaviour

### One mechanism for every slot

- A hook lives in its pack, `templates/<pack>/hooks/<name>/`: `hook.json` and
  its script. `hook.json` holds name, version, `output` (what the hook makes:
  `"figure"`, `"text"` or `"table"`; `"figure"` when left out, so the hooks of
  2026-10-12 keep working), `inputs` (a JSON Schema the slot's input is
  checked against; required for a figure hook, optional for the others),
  command, runtime name, `outputs` (file format of a figure: `png` or `svg`),
  dpi, timeout, mode and requirements.
- A slot's kind follows its role: `figure` is a figure slot, `table` a table
  slot, every text role (title, subtitle, body, label, caption, note) a text
  slot. A layout slot of any kind may name a hook with `"hook": "<name>"`.
- **Pack load refuses a mismatch.** A slot that names a hook the pack does not
  have, or a hook whose `output` is not the slot's kind, makes the pack
  invalid; `folio pack check` and the server name the slot, the hook and both
  kinds: `layouts.note-figure.slots.note: hook "line-plot" makes a figure,
  but note is a text slot (role body); name a hook with "output": "text"`.
- **What runs, by kind.**
  - **Figure** (as of 2026-10-12): the slide gives only the inputs,
    `"fig:a": {"hook": "line-plot", "inputs": {...}}`; the layout's `hook`
    names what an agent should use and is printed by `catalog.prompt()` with
    the inputs schema.
  - **Text**: the layout's `hook` runs on whatever the slot receives. The
    slide keeps plain text, `"note": "CO2 adsorbs at the open metal site"`;
    nothing in the slide names the hook. It runs whenever the slot receives
    content: from an agent through the CLI or HTTP, or from a browser edit
    (saved on blur or Ctrl+S, as every edit is). An empty slot runs nothing.
  - **Table**: the layout's `hook` runs on the rows the slot receives: the
    inline `{columns, rows}`, or the rows read from its `{src}` file. A slide's
    `tableStyle` is not part of the input, so switching style runs nothing.
- **One request for every kind**, one JSON object on stdin:
  `{"kind", "slot", "role", "box": {"w", "h"}, "deck", "slide", "input",
  "deck_dir"}`. `input` is what the slot received: the raw text for a text
  slot, the inputs object for a figure, the `{columns, rows}` object for a
  table. A figure request also carries `inputs` (the same object, the name of
  2026-10-12), `dpi`, `out` and `format`.
- **One response by kind.** Figure: the file written at `out`, at exactly the
  box size, as before. Text: one stdout line `{"text": "<text>"}`. Table: one
  stdout line `{"columns": [...], "rows": [[...], ...]}`, every cell a string
  and every row as long as `columns` (the table slot's own shape). Any kind may also
  print warning lines `{"warning", "field"}`. Text output is plain text with
  the slot's own inline markup (`**bold**`, `X_{sub}`, `X^{sup}`) and
  nothing else.
- **Raw input and output.** The slide always stores what the slot received
  (the raw text, the inputs, the table); the hook output is derived and
  cached, never written back into the slide. A cached output is used only
  for the input it was made from.
- **The cache.** One key for every kind: the hash of the input, the slot box,
  the hook version and the hash of every file in the hook folder (and, for a
  figure, the dpi; for text and tables, the slot name, role and kind). The
  same input never runs twice; a changed script runs again. Figures are
  `.folio/hooks/<key>.png|svg`; text and table outputs are
  `.folio/hooks/<key>.out.json` (`{"input": ..., "output": ...}`); each has
  `<key>.json` beside it, its trace record (`provenance.md`: hook files,
  inputs, box, dpi, runtime, data files, output hash).
- **What the slot shows.**
  - A figure slot shows its figure; a text slot shows the hook's text for the
    current raw text; a table slot draws the hook's rows for its current
    rows (for a `{src}` table, while the server says the output is current).
    That output is what renders, what the line measurement (overflow,
    `OVF-001`), the table measurement (`OVF-003`, `OVF-004`) and the
    character rule (`maxChars`) measure, what a slot flowing `below` follows,
    and what goes into the PDF.
  - **While it runs**, a figure slot keeps its last good figure, faded; a
    text or table slot shows its raw content. Both carry the quiet "drawing" mark in
    Edit.
  - **On failure** a figure slot keeps its last good figure (or a placeholder)
    and a text or table slot falls back to its raw content; both carry the danger badge in
    Edit and raise the same warnings.
  - In Edit, focusing a hooked text slot swaps the output for the raw text,
    which is what the user edits; leaving it shows the output again once the
    hook has run on the saved text. Typing is never blocked or slowed by a hook.
- **Warnings**, the same codes for every kind: an input that fails the
  hook's schema, by JSON path (`FOLIO-HOOK-001`); a non-zero exit with the
  stderr tail (`-002`); a timeout (`-003`); a printed warning (`-004`); a
  wrong figure size (`-005`); an unconfigured runtime (`-006`); a paused hook
  (`-007`); a stale output after a failed update (`-008`); an unmet
  requirement (`-009`); a hook the pack does not have (`-010`); an output
  still being made for the first time (`-011`, a note); a hook that cannot
  fill this slot, because it makes another kind or returned no usable output
  (`-012`).
- Every run is logged in `.folio/hooks/log/YYYY-MM-DD.jsonl`: key, kind,
  input, exit, seconds, stderr tail, warnings. The queue (`queue.md`) runs
  every kind alike.
- **Agents see it.** `catalog.prompt()` prints, after a text slot whose layout
  names a hook, that its text is rewritten by that hook before it is shown,
  with the hook's description; a figure slot's line carries the inputs schema.
- `lectern` ships `line-plot` (up to six series) in the research plot style:
  warm near-black ink, warm greys, one orange accent, bold left panel title,
  shared legend at the bottom, x grid only, sizes scaled from the 89 mm house
  sizes to the slot's width and never below them, margins laid out in pt
  (`provenance.md`). The style is the pack's `style.py`; folio's core
  and `folio_hook` impose no style.
- `lectern` ships the text hook `chem-subscripts`: it writes the digits of a
  chemical formula as subscripts (`CO2` becomes `CO_{2}`, `H2O` becomes
  `H_{2}O`) and leaves numbers that are not in a formula alone. Every text
  slot of every lectern v2 layout where chemistry can appear names it
  (2026-10-13): title, subtitle, body (`body`, `body:a`..`c`), note, label
  (`label:a`..`d`), caption, `source` and `table-label:a`/`b`; 87 slots in
  all. The slots that hold no chemistry do not: `set-id`, `author`,
  `contact`, and the wordmark, which is a decoration. A formula is
  recognised by its capitals, so it is written as `CO2` even in an
  upper-case role; `co2` stays as written.

## Never

- Plotting code or styling in the slide: the agent gives inputs only.
- A failure that blocks the build or blanks the slide.
- Hooks that need cluster compute in v1, or anything sent to PBS.
- A hook's output written back over the slot's stored raw text or input: the
  output is derived and cached; the slide keeps what the slot received, and
  an edit in the browser edits the raw text.
- A hook blocking or delaying typing: text hooks run after a save, through
  the queue's 300 ms debounce, never per keystroke and never on the typing
  path.
- HTML or any markup other than the slot's own in a text hook's output.
- A separate mechanism, cache, queue or warning family per slot kind.

## Status

- A text or table slot is hooked by its layout only; a slide cannot name a
  hook for one of its text slots itself (a figure slot's `{hook, inputs}`
  stays the only per-slide call). A per-slide call on a text slot would turn
  the stored string into an object that the editor, the markup and the
  character rule all read as text; not built until asked for.
- ~~A `{src}` table's hook runs again when the slide changes, not when only
  its `.table.json` file is edited.~~ Fixed 2026-10-13: a file edit reruns it
  (`provenance.md`).

## Where it lives

`packages/core/src/hookdef.ts` (`output`, `hookSlotProblems`, `slotKind`),
`hooks.ts` (`slotHookKey`, `checkHookOutput`, `hookedTextOf`,
`hookedTableOf`),
`packages/server/src/hooks/` (`slots.ts`, `runner.ts`, `state.ts`,
`routes.ts`, `warm.ts`), `packages/web/src/hooks/useHooks.ts`,
`slide/FigureSlot.tsx`, `slide/TextSlot.tsx`, `slide/TableSlot.tsx`, `python/folio_hook/`,
`templates/lectern/hooks/line-plot/`, `templates/lectern/hooks/chem-subscripts/`.

## Checks

`e2e/hooks-queue.mjs` (13 checks, own workspace `e2e/workspace` with probe
hooks that sleep, fail, warn, crash or draw the wrong size).
`e2e/hooks-any-slot.mjs` (own workspace `e2e/workspace`, text slots with a
hook: text set through the API and the CLI renders the hook's output and the
slide keeps the raw text; the output is what overflow measures; a failing hook
falls back to the raw text with `FOLIO-HOOK-002`; an empty answer is
`FOLIO-HOOK-012`; a browser edit edits the raw text; a table slot with a table
hook draws the hook's rows, inline or from a file, `OVF-003` counts the hook's
rows, and a failure falls back to the raw rows; a hooked caption flowing
below the table shows its output under it; a figure hook still draws).
`packages/core/test/hooks.test.ts` (hook.json `output`, the request and
response shapes, the cache key, a table output `{columns, rows}`, the pack
refusing a kind mismatch, the fallback to raw text and raw rows, `maxChars`
measuring the output), `packages/server/test/hooks.test.ts` (the request
envelope, caching text and table outputs, nothing cached on failure,
`chem-subscripts` run as a spawned hook).
