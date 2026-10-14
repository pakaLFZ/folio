# Slides: bullet and numbered lists in text

## Demand

- "give text proper bulletpoint and number lists support" *(user, 2026-10-14)*.
- The details below are design choices *(2026-10-14)*; any of them may be
  reversed.

## Behaviour

- **Where.** Any multi-line text slot that takes character formatting
  (`rich-text.md`): text boxes, note, caption, label, and text/card/callout
  blocks. Not titles, not code blocks.
- **Stored form.** The slot stays one JSON string; no second format. Each
  line is a paragraph. A line starting with `- ` is a bullet item, a line
  starting with `1. ` (any number then `. `) is a numbered item. Two leading
  spaces per level nest it, up to level 3. Numbers in the string are not
  trusted: a numbered run is renumbered from 1 on render; a nested run inside it
  does not interrupt it (1, 2, a, b, 3), while a plain line or a bullet at
  the same level restarts it, and each nested run starts again at a. Character markup (`[[...|...]]`, `**...**`) works
  inside items. A literal leading `- ` that is not a bullet is written `\- `.
- **Render.** Real lists with a hanging indent: the marker sits in the
  margin, wrapped lines align with the item text, not the marker. Markers
  per level: `•`, `–`, `▪` for bullets; `1.`, `a.`, `i.` for numbers. Marker
  colour and size follow the item's first character run. Spacing between
  items follows the pack's paragraph spacing. Edit, View, thumbnails, print,
  PDF and shots render identically, and overflow is measured on this layout.
- **Editing (Edit mode, caret in the slot).**
  - Typing `- ` or `* ` at the start of a line makes it a bullet item;
    `1. ` makes it a numbered item. Ctrl+Z right after turns it back into
    the typed characters.
  - Enter in an item starts a new item of the same kind and level; Enter on
    an empty item ends the list (the line becomes plain). Shift+Enter breaks
    the line inside the item, stored as U+2028 within that paragraph.
  - Tab indents an item one level (max 3), Shift+Tab outdents; outdenting
    level 1 makes it plain. Backspace at the start of an item removes its
    marker first.
  - Ctrl+Shift+8 toggles bullets and Ctrl+Shift+7 toggles numbering on the
    selected lines (Google Slides keys), switching kind if already a list.
  - The floating character toolbar gains two toggle buttons, Bullets and
    Numbering, that do the same and show pressed when every selected line
    is that kind. Nothing is added to the Slide tab.
- **Agents.** `folio prompt` documents the `- ` / `1. ` / indentation form.
  A line with a bad indentation (odd spaces, level above 3) is refused by
  path and line with its repair.
- **PPTX.** Each item is an `a:p` with `lvl`, `marL` and a negative
  `indent`, `a:buChar` for bullets and `a:buAutoNum` (`arabicPeriod`,
  `alphaLcPeriod`, `romanLcPeriod`) for numbers, so lists stay editable
  lists in PowerPoint.

## Never

- Lists in titles or code blocks.
- Typed numbers rendered as-is instead of renumbered.
- List controls in the Slide tab.

## Status

- Implemented 2026-10-14 in core parsing and refusals, the shared slide DOM,
  text and block editing, the floating toolbar, `folio prompt`, and native
  editable PPTX paragraphs. No deck files were changed.
- Checks: `pnpm -s typecheck`, `pnpm -s test` (532/532), and
  `pnpm -s build:web` pass. `bash e2e/run-all.sh lists rich-text block-editor`
  passes: lists 17/17, rich-text 30/30, block-editor 11/11 (58/58 total).
  The block-editor check now waits for the new block to hold the caret before
  typing, avoiding a parallel-run race.

## Where it lives

`packages/core/src/markup.ts` (paragraph and list parsing), `writecheck.ts`;
`packages/web/src/slide/markupDom.ts`, `TextSlot.tsx`,
`RichTextToolbar.tsx`; `packages/server/src/pptx/`; `e2e/lists.mjs`.
