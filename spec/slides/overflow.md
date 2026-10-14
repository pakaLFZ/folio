# Slides: line limits and overflow

## Demand

- "Maybe allow me to edit if it's a text box, where the text box has automatic
  input restriction to avoid overflow." *(user)*
- Overflow is reported as **warnings only**, never a build failure. *(user)*
- **The font size is kept consistent with the declared style and any character
  run overrides (`rich-text.md`).** Never shrink text to fit. Shrinking to
  a minimum size and then refusing input was rejected. *(user)*
- No overlap and no wrap: labels and captions are one line, limits are
  enforced, not eyeballed. *(user, 2026-10-02, from `conventions.md`)*
- Table slot as proposed: a table taller than its box, or a cell whose text
  would wrap, raises an overflow warning; a slot flowed `below` another and
  left with no height does too. "user said yes to the table slot as
  proposed" *(user, 2026-10-13, relayed)*
- "remove red bit": looking at the example deck's slide s002 in Edit mode, the
  user struck through the red counters `24/22 lines` on the note and `+80 pt`
  on the caption, and kept the thin red outline. *(user, 2026-10-12)*

- "made me guess twice how short "(AGENT-WRITTEN SLIDES)" had to be ... make
  the overflow message say where the text wrapped ... so the fix is one try"
  *(coordinator's dogfood finding, 2026-10-13, under the user's "It must be
  easy to learn and use for agents")*

## Behaviour

- Every text slot has a line limit. The rendered page measures each slot (the
  laid-out text height divided by the role's line pitch, which is fixed; sub-
  and superscripts take no line height) and a one-line slot that does not wrap
  is also measured for width.
- More lines than the limit is `FOLIO-OVF-001`. Its message quotes each
  rendered line, as the measuring page broke it: `Slot title holds 3 lines at
  64 pt; limit is 2. It wraps as: "AGENTS WRITE THE" / "DECK" /
  "(AGENT-WRITTEN SLIDES)".`, so an agent sees how much one line holds. A slot over six
  lines quotes only its last lines, one more than it is over (`It ends:
  "..." / "...".`): a paragraph gap counts as a line but holds no text, so
  line numbers would mislead. The page
  reads the lines from the laid-out words of any slot over one line;
  `lineTexts` travels with the measurement.
- A non-wrapping line wider than its box is `FOLIO-OVF-002`. The pack's character rules give `FOLIO-TXT-001`.
- **Tables** (`tables.md`) are measured in the same page: the rendered
  table's height against its box's height (the flowed height when it sits
  `below` another slot), and each cell's text height against one line.
  - A table taller than its box is `FOLIO-OVF-003` ("Table table:a is 312
    pt tall with 12 rows; its box holds 300 pt."). The table is drawn in
    full, past its box; rows are never dropped or scaled.
  - A cell whose text takes more than one line is `FOLIO-OVF-004`, one per
    cell, fingerprinted by the cell (`row 2, column 1`, `header, column
    2`). The cell wraps rather than being cut, so the text stays readable
    and the row grows; the warning says to shorten it.
- **Flow**: a slot placed `below` another whose laid-out height is zero or
  less is `FOLIO-OVF-005` ("Slot note sits below table:a and is left -12 pt
  tall."). A flowed text slot's line limit comes from its laid-out height.
- **Blocks** (`blocks.md`): a block whose content needs more height than
  its box gives is `FOLIO-OVF-006` ("Block block:a needs 212 pt; its box
  holds 180 pt."), drawn in full past its box; a code line wider than its
  block is `FOLIO-OVF-007`, one per block naming every such line. Code
  never wraps and text never shrinks.
- In Edit mode an overflowing table carries `data-overflow="table"` and a
  squeezed flowed text slot `data-overflow="flow"`, with the same danger
  outline.
- In the editor an overflowing slot gets a thin danger outline and carries
  `data-overflow` (`lines` or `width`); nothing else is drawn on the slide.
  The numbers are in the Slide tab, which lists every slot with
  `lines/limit`; the rail's thumbnail carries a red dot. The full list, across
  every slide, is `folio check` (the panel's Warnings tab was removed, *user,
  2026-10-13*; see `spec/warnings/warning-model.md`). The print page and the
  PDF carry no outline.
- The same routine measures in the live view, in `folio check` (headless
  Chromium on the server, the print page) and in `folio pdf`, with the same
  webfonts, so all three break lines identically. The live view does not draw
  slides until the pack's fonts have loaded.
- The live view sends its measurement to the server, so `folio status` shows
  what the browser shows without rendering again.
- A slot marked `enforce: true` in the pack refuses a character that would add
  a line past the limit; every other slot accepts it and warns.
- `folio check` exits 0 with warnings; `--max-warnings N` and `--fail-on new`
  are the only ways to make it exit 1.

## Never

- Shrinking text, auto-fit, or a minimum font size.
- Scaling a table's rows to fit its box, or one layout per row count.
- A build that fails on overflow by default.
- Thumbnails reporting measurements: a thumbnail of the saved text and the
  main view of the text being typed overwrote each other in a loop (React
  error 185). Only the main view and the print page measure.
- Measuring before the webfonts load.
- An overflow badge drawn on the slide (the red `24/22 lines` or `+80 pt`
  counter at the slot's corner), in any mode. *(user, 2026-10-12)*

## Status

- The comparison with PowerPoint's own line breaks was not made; the user
  said "dont care about ppt for now" (2026-10-12).

## Where it lives

`packages/web/src/slide/measure.ts`, `TextSlot.tsx`, `TableSlot.tsx`,
`packages/core/src/overflow.ts` (`slideOverflowWarnings`), `slidecheck.ts`,
`packages/server/src/checks.ts`, `packages/cli/src/check.ts`.

## Checks

`e2e/overflow-typing.mjs` (typing past the note's limit: danger outline and
`data-overflow`, no badge on the slide, the rail's dot, font size unchanged), `e2e/pdf-lines.mjs`, `e2e/tables.mjs`, unit tests for
`overflowWarnings` and `slideOverflowWarnings` (`tables.test.ts`).
