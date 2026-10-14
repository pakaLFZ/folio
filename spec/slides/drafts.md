# Slides: drafts, the user's sketches for agents

## Demand

- "also, can u make it so that, indeed defalult the drawings such as arrow
  and blocks serve only as draft purposes but make agents clear that draw
  the real thing when the user means it" *(user, 2026-10-13)*.
- Reading, stated to the user: anything the user draws in the editor
  (shapes, arrows, lines, text boxes, and blocks once they land) is a draft
  by default, a sketch of intent for an agent, not final slide content.
  Anything an agent adds through the CLI (`folio shape add`, `folio text
  add`, `folio block add`) is final by default.

## Behaviour

- **The flag.** An added slot may carry `draft: true` in the slide's
  overrides (`overrides.slots.shape:a.draft`). It is one field of the slot
  schema (core `pack.ts`), so every role that can be added, blocks
  included, takes it with no code of its own. Only an added slot can be a
  draft: `draft` on a slot of the layout is refused by path
  (`overrides.slots.title.draft: only an added slot can be a draft; ...`).
  Final is the field's absence (or `false`).
- **Who sets it.** The editor's Shape and Text box tools write `draft: true`
  on every item they draw, blocks included (a block drawn with the Text
  tool's block style; the Block popover has the same Draft / Final toggle). The CLI never does: `folio shape add` and
  `folio text add` make final items.
- **How a draft looks.** In Edit and in the rail's thumbnails a draft is
  drawn at 60% opacity, with a 1 px dashed grey outline 3 pt outside its box
  and a small "DRAFT" tag over its top-left corner. In View, on the print
  page (the PDF, Export PDF), in `folio shot` and in `folio pptx` it is not
  drawn at all; `folio shot --drafts` (or `--marks`) draws it with the draft
  look. A draft is not measured on the print page, so it brings no overflow
  warning to `folio check`.
- **Draft or Final.** The Shape and Text box popovers open with a Draft /
  Final toggle. With an item selected it marks that item (one write: the
  field set, or removed for Final); with nothing selected it sets whether
  the next item is drawn final (kept in the page; Draft by default).
- **What agents are told.**
  - `folio check` lists each draft as a note, FOLIO-DRF-001: what it is and
    where ("a draft arrow from (600, 300) to (500, 400)", "a draft text box
    at [100, 250, 200, 70] reading "..."), the command that draws the real
    element (`folio shape add <deck>/s006 arrow --from 600,300 --to
    500,400`, `folio text add ... --box ...`) and the one that removes the
    draft (`folio shape rm`, `folio text rm`, `folio block rm`; a block's
    real command is `folio block add ... --style S --box ...`), and that a draft is never
    just marked final without being made right.
  - `folio comments` lists, under each comment, the drafts on its slide;
    `folio viewing` lists the drafts on the slide each tab shows (and
    `drafts` in `--json`).
  - `folio prompt` says drafts are the user's sketch of intent; when the
    user's request means a real element, draw it properly (template styles,
    aligned, sized to the layout) and remove the draft, never just flip a
    draft to final; what an agent adds is final by default.
- **Making one final** by hand: the popover's toggle, or
  `folio override <deck>/<id> slots.shape:a.draft=false`. `folio shape rm`
  and `folio text rm` remove a draft like any shape or text box.
- **Templates.** "Save as new template" and "Apply to template" refuse a
  slide with drafts: a template holds no sketches.

## Never

- A user's drawing printed in the PDF or a shot as if it were content.
- An agent "finishing" a draft by flipping it to final without redrawing it
  with the template's styles and the layout's alignment.
- A draft flag on a template slot, or in a pack.

## Where it lives

`packages/core/src/pack.ts` (`draft` in `slotSchema`), `overrides.ts` (the
refusal), `drafts.ts` (`draftsOf`), `slidecheck.ts` (FOLIO-DRF-001),
`warnings.ts`, `catalog.ts` (prompt), `promote.ts` (refusal), `textedit.ts`
(`textRemove`); `packages/cli/src/draftnotes.ts`, `commentcmds.ts`,
`viewingcmd.ts`, `shot.ts` (`--drafts`), `textcmd.ts` (`text rm`);
`packages/server/src/pdf.ts` (`drafts=1`); `packages/web/src/slide/DraftMark.tsx`,
`LayoutView.tsx`, `print/PrintView.tsx`; `packages/web/src/editor/DraftToggle.tsx`,
`ShapeLayer.tsx`, `shapeModel.ts`, `textBoxModel.ts`; `docs/warnings.md`.

## Checks

`packages/core/test/drafts.test.ts` (a draft on an added slot accepted and on
a layout slot refused; `draftsOf` describes an arrow and a text box with
their commands; FOLIO-DRF-001 from the content check; promotion refused);
`e2e/drafts.mjs` (an arrow the user draws is a draft: dashed and tagged in
Edit, absent in View and from the print page and `folio shot`, present
with `--drafts`; `folio check` reports DRF-001 with its position; a shape
added with `folio shape add` is final; the popover's Final makes the drawn
arrow final and DRF-001 goes).
