# Slides: character formatting

## Demand

- "enable character font size change for individual letter this include other operation such as color and other control" *(user, 2026-10-13)*
- "e.g. when the cursor selects text, I wish the text popover show up immediately, showing options for the selected letter operations such as font size change, with the same keybinds for e.g. increase or decrease size as the ppt" *(user, 2026-10-13)*

## Behaviour

- In Edit mode, the floating character toolbar appears the moment a non-empty selection exists inside a text slot, including a mouse drag, double-clicked word, or Shift+arrow selection. There is no delay or extra click. It is anchored above and follows the selection; it hides when the selection collapses or leaves the slot. It changes only those characters: size in pt, a pack colour or custom hex, bold, italic, underline, strike, subscript, superscript, a pack font, highlight colour, or Clear. It works in title, subtitle, note, label, caption, author, text boxes and text/card/callout blocks. Code blocks remain literal code. Nothing is added to the Slide tab.
- The toolbar reflects the whole selection. Size shows the selected characters' current effective size in pt and is blank for mixed sizes. The colour swatch and font show the selection's current values; mixed values are blank. Bold, italic, underline, strike, subscript and superscript appear pressed only when every selected character has that style.
- PowerPoint character shortcuts: Ctrl+Shift+> grows to the next step and Ctrl+Shift+< shrinks to the previous step in the size list **8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96**. Ctrl+] grows by 1 pt and Ctrl+[ shrinks by 1 pt. Ctrl+B, Ctrl+I and Ctrl+U toggle those styles; Ctrl+= toggles subscript and Ctrl+Shift+= toggles superscript. Ctrl+Space clears character formatting. The browser does not act on these keys while text is selected inside a slot, including page zoom; the selection stays selected after each press so shortcuts can repeat. Save and undo/redo use the existing slot edit history.
- A slot remains a JSON string. Unformatted content remains exactly its old text. Legacy `**bold**`, `_{sub}` and `^{sup}` continue to work. An explicitly styled span uses `[[attributes|text]]`, for example `"A [[size=24;color=accent;bold|large red]] result"`. Attributes are separated by semicolons: `size` (positive pt), `color` and `highlight` (pack colour name, `ink`, or hex), `font` (a family in the pack), and flags `bold`, `italic`, `underline`, `strike`, `sub`, `sup`. Characters `\\`, `|`, `]` in a span's text are escaped with `\\`. Adjacent runs with equal attributes may be merged; no attributes means plain text.
- A malformed styled span is refused by path and run number with its repair. A colour or font absent from the pack is refused with the available choices. Subscript and superscript cannot coexist.
- Text hooks receive the same markup string and preserve all explicit styles. The chemistry hook subscripts formula counts inside a formatted span without dropping that span's attributes.
- Edit, View, thumbnails, print, PDF and shots use the same HTML runs. The measured DOM includes each run's size, so overflow warnings reflect the actual lines and width; text never shrinks. Copy, cut and paste inside the editor retain folio markup. Deck export/import retains the slot string. PPTX writes every run as editable `a:r` with its own `a:rPr` for size, fill, font, weight, italic, underline, strike, baseline and highlight.

## Never

- A second slot value format or image capture for editable PPTX text.
- Character controls in the Slide tab.
- Formatting a code block as prose.

## Status

- Implemented in the string parser, slide rendering, editor toolbar, chemistry hook and editable PowerPoint runs. `e2e/rich-text.mjs` runs and passes (30/30): the toolbar unmounted on focusing its own Colour/Font/Size controls because its selection-tracking listener required the document selection to still be inside the slot even while focus was in the toolbar, which is never true for a plain `<input>`/`<select>`; fixed in `packages/web/src/slide/RichTextToolbar.tsx` to keep the toolbar up whenever focus is in it. Two test-only fixes: the mouse-drag-selection check started its drag inside the text already selected by the previous Shift+arrow check, so the browser performed a native drag-and-drop of the selected text instead of a fresh selection (added an explicit collapse first); and `reload`'s restored-formatting check used a non-retrying `locator.count()` right after navigation (switched to polling), and the View control is a `role="radio"` in a `Segmented`, not a `role="button"`.

## Where it lives

`packages/core/src/markup.ts`, `catalog.ts`, `writecheck.ts`; `packages/web/src/slide/markupDom.ts`, `TextSlot.tsx`, `BlockSlot.tsx`; `packages/server/src/pptx/deck.ts`; the pack chemistry hook.

## Checks

Core parse/serialize, refusals and hook composition; size-step unit tests; server PPTX XML runs; `e2e/rich-text.mjs` for immediate toolbar display, current values, every shortcut, editing, reload, View, print and PPTX. Run typecheck, test and web build. The browser check is written but cannot run in this sandbox.
