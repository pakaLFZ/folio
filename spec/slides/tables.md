# Slides: table slots and below flow

## Demand

- The table slot as proposed: a `table` role, rows from the slide or a
  `.table.json` file, the style in the pack's theme, height driven by rows, a
  real HTML table so PDF text is selectable, and slots that flow `below`
  another. "user said yes to the table slot as proposed"
  *(user, 2026-10-13, relayed)*
- "see if u can make table been able to change style since its template and
  custome tempaltes anyway" *(user, 2026-10-13, relayed)*: the theme holds
  named table styles; a layout's table slot names one; a slide may pick
  another named style of the same pack for one table. Read with the
  background rule: "top prioritiy is customized overwrite > slide's own style"
  *(user, 2026-10-13)*.
- Text never shrinks (see `overflow.md`).
- "should table be traced as well?" *(user, 2026-10-13)*, plan approved:
  tables are traced as figures are; how is in `spec/hooks/provenance.md`
  (Tables).

## Behaviour

### Table styles (pack)

- The pack's top-level `tables` maps a style name to a style (the pack has
  no `theme` key; theme fields sit at the top level):
  `{description?, font, size, lineHeight, align, header, headerWeight,
  headerFill, headerInk, fill?, ink?, bandFill?, cellPad: [t, r, b, l],
  rule: {color, width, outer, rows, columns}}`.
  - `font` null is the pack's first font. `align` is `left`, `center` or
    `right`, or an array with one per column (missing columns are left).
  - `header` true draws the `columns` as a header row in `headerWeight`,
    `headerFill`, `headerInk`. Body cells take `fill` (null: the slide's
    background shows) and `ink` (null: the background variant's ink);
    `bandFill`, when given, fills every other body row from the first.
  - `rule.outer` draws the border round the table, `rule.rows` a rule
    between rows (under the header too), `rule.columns` a rule between
    columns. Rules never add to the height.
- `lectern` v2 ships one style, `default`: PowerPoint Light Style 2 -
  Accent 1 with accent black (black header row in white bold, a 1 pt black
  outer border and a rule between body rows, no vertical rules, no fills;
  14 pt, line height 1.2, padding 3.6 / 7.2 pt, every column left). The
  checks add a second style, `minimal` (no fills, bold header, grey 0.5 pt
  rules between rows), to their own fixture pack to show a slide switching
  style. *(Before v2, lectern shipped Medium Style 2 - Accent 1 as `default`
  and `minimal` beside it.)*

### Table slots (layout and slide)

- A table slot is `{"role": "table", "box": [x, y, w, maxH], "tableStyle":
  "<name>"}`, named `table:<letter>` (`table:a`), like `fig:a`.
- The slide's value is `{"columns": [...], "rows": [[...], ...]}` with one
  string per cell (inline markup allowed: `**bold**`, `X_{sub}`, `X^{sup}`),
  or `{"src": "<subject>.table.json"}`, a deck-relative file of the same
  shape, resolved as figure paths are. Either may carry `"tableStyle":
  "<name>"`, another named style of the same pack; it wins over the slot's.
  A row with the wrong number of cells, a `src` not ending in `.table.json`,
  an unknown style name, or any other key (colours, fonts) is a spec warning
  (`FOLIO-SPEC-001`) naming it. A `src` file that is missing or not that
  shape is `FOLIO-TAB-001`. The file may also carry a `source` block saying
  what made it, and an edit of the file redraws the slide live
  (`provenance.md`). An inline table of numbers is the note `FOLIO-TAB-002`.
- The table is drawn at the box's x, y and width. Its height is the header
  row plus one row per body row, each row one line: row height = `size x
  lineHeight + cellPad top + bottom` (24 pt for lectern's `default`). The
  box height is a maximum only; the measured height and the warnings are in
  `overflow.md`.
- It renders as a real HTML `<table>` (`<th scope="col">` header, `<td>`
  body) in the page, so the PDF holds selectable text.
- In Edit mode an empty table slot shows a dashed one-row frame with its
  placeholder (default "Table"); a missing or bad file shows the problem
  there. Tables are filled by agents (`folio_client` `Slide.set_table`), not
  typed in the editor.
- `folio prompt` prints each table slot with its width, how many rows fit,
  its style and the other style names it may pick.

### Below flow (any slot)

- Any slot may declare `"below": {"slot": "<name>", "gap": <pt>}`. Its top
  becomes the named slot's rendered bottom plus the gap; its box's bottom
  edge stays where the layout put it, so the slot grows or shrinks.
- The rendered bottom is measured in the page, as overflow is: a table's
  bottom is its top plus its height; a text slot's is the bottom of its last
  line (its top when empty); a figure's is its box bottom. Chains (a below b
  below a table) are followed.
- A flowed text slot's line limit, when not declared, is the whole lines its
  laid-out height holds.
- Pack load refuses a `below` naming a slot not in the same layout, and any
  cycle: `layouts.L.slots.note.below.slot: "table:z" is not a slot of this
  layout (slots: ...)`; `... the slots table:a -> note -> table:a sit below
  each other in a cycle; one of them must keep its own top`.
- A flowed slot left with zero height or less is an overflow warning
  (`overflow.md`).

### Refusals at pack load

- A table slot without `tableStyle`, or with an unknown one, names the slot
  and the known styles: `layouts.L.slots.table:a.tableStyle: is missing; a
  table slot names one of the pack's table styles (known: default,
  minimal)`; a pack with no `tables` is told to add them.
- `tableStyle` on a slot that is not a table, and a table slot not named
  `table:<letter>`, are refused with the fix.

## Never

- One layout per row count.
- Scaling rows, or the font, to fit the box.
- ~~Free-form per-slide table styling (colours, fonts, padding on the slide):
  a slide only picks another named style the template defines.~~
  *Superseded (user, 2026-10-13: "Slide template can allow overwrite thus
  freeform as long as typescript accept it"): a slide's `overrides` may lay
  any table style field over the named style (`overrides.md`); the table
  value itself still takes only `tableStyle`, and every override is explicit
  and visible, never silent.*
- A second, pack-wide background fallback.
- A table drawn as a picture (text in the PDF must stay selectable).

## Where it lives

`packages/core/src/pack.ts` (`tables`, `tableStyle`, `below`, refusals),
`tables.ts` (value schema, `tableStyleOf`, `tableHeight`),
`flow.ts` (`flowBoxes`), `overflow.ts` (`slideOverflowWarnings`),
`catalog.ts`; `packages/web/src/slide/TableSlot.tsx`, `LayoutView.tsx`;
`packages/server/src/checks.ts` (`FOLIO-TAB-001`);
`python/folio_client/client.py` (`Slide.set_table`).

## Checks

`packages/core/test/tables.test.ts` (refusals, background precedence, table
height, rows that fit, per-column align, value checks, style override, flow
boxes, table and flow warnings, prompt lines); `e2e/tables.mjs` (row-driven
height, the note moving down one row when a row is added, the slide's
`tableStyle` override, `folio check` warning a too-tall table and a wrapping
cell, the PDF's table text).
