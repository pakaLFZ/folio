# Slides: what the user may change in the browser

## Demand

- "When I am viewing it, can I also edit? What's the freedom for me to edit?"
  The proposed scope was accepted as proposed.
  *(user, 2026-10-12)*
- Editing must be fast. *(user)*
- The Deck section of the Slide tab: "better design this, and make the
  different template cards of preview and click automatically like new
  (insert) button thus remove new button". *(user, 2026-10-12)*
- The Slots section of the Slide tab (rows such as "title 1/1, subtitle 0/1,
  note 1/22, fig:a empty"): "remove these". The slide id, layout and revision
  beside the "Slide" label ("s001 note-figure a96a02"): "get rid of this".
  *(user, 2026-10-12)*
- The Archive button under "This slide": "make archive an icon only with
  tooltips". *(user, 2026-10-12)*
- The "Slide" section with the background swatches (plain, smoke, khaki,
  black): "remove this as the background should be part of the deck
  template". *(user, 2026-10-12)*
- The "This slide" label with Duplicate and Archive, the "Insert" label with
  "after 3", and the grey usage sentence under each layout card: "remove these
  we dont need to show details here (as well as the hover of explaination),
  and previously I told u to remove the things on top". *(user, 2026-10-12)*
- "empty template should have sample text, like ppt" *(user, 2026-10-12)*
- The rail: "left column, add ctrl or shift + click multi select feature.
  better drag and drop position indication (use horizontal line as landing
  position)." *(user, 2026-10-12)*
- The "This slide" label, its Duplicate and Archive row, the "Insert" label
  and its "after 2" text, struck out in red: "remove these. add right click
  to left column for delete, copy, and copy paste should have key binds".
  *(user, 2026-10-12)*
- "add cut" *(user, 2026-10-12)*
- Of the rail: "add animation and get rid of the insertion horizontal line,
  so that animation is like top and bottom moves to creat espace for the
  slide, and for performance u can dont display side that is e.g. 3 slides
  aways from the hidden slide position" — "I mean left panel"
  *(user, 2026-10-13)*. This supersedes the horizontal insertion line asked
  for on 2026-10-12.
## Behaviour

- **Edit mode** (top row: Edit, Comment, View): every text slot takes typing in
  place. Ctrl+B bolds; Ctrl+= and Ctrl+Shift+= toggle subscript and
  superscript, and a second press steps the caret out of the script. Enter is
  refused in a one-line slot. Escape reverts. Paste inserts plain text.
- A slot is saved on blur or Ctrl+S as one small JSON Patch, against the
  revision the slide had **when typing began**.
- The original `**bold**`, `X_{sub}`, `X^{sup}` markup remains valid. Per-character
  formatting extends it as specified in `rich-text.md`. *Superseded 2026-10-13:
  these three forms used to be the only formatting.*
- If a worker changed the slide while the user typed:
  - a different slot: the user's edit is re-applied on the newer revision
    without asking;
  - the same slot: the Slide tab shows both versions, "Yours" and "Now on
    disk", with Keep mine and Keep theirs.
- Edits to other slides arrive live without interrupting typing.
- The Slide tab also offers: a new slide of any layout after this one.
  Duplicate, copy, paste and archive (the file moves to
  `slides/.archive/<date>/`) live on the rail's right-click menu and keys,
  not in the panel. The rail reorders by dragging. A figure or table slot's
  contents are set by an agent (`folio patch`), not by a control in the
  Slide tab; its provenance is read with `folio trace`, never shown there
  (`spec/hooks/provenance.md` **Never**). *Superseded 2026-10-13: it used to
  open a Figure section listing the pictures in the deck folder.*
- **Background**: a slide's background comes from the deck's template (the
  pack), not from a control in the editor. The tab has no "Slide" section; it
  is the template manager (`packs.md`), starting one panel padding below the
  header row. *Superseded 2026-10-13: it was the layout card grid alone.* A slide that already names a variant in its
  `background` prop keeps rendering with it, and an agent may still set the
  prop in the slide JSON (`folio patch`); see `packs.md`.
- **Layout cards**: one card per layout in the deck's pack, two to a row at
  any panel width, inside the template manager's Templates section (its
  collapsible header, `packs.md`, is the only heading above them). A card is a small live
  preview of the layout, drawn by the renderer the rail uses at the pack's
  aspect ratio, with each text slot filled by its slot name and each figure
  slot drawn as a dashed box carrying its name; under it, the layout name in
  small mono type, and nothing else: no usage sentence and no tooltip. A
  card is a button named "Insert <layout> slide"; pressing it (pointer or
  keyboard) inserts a new slide of that layout right after the current slide
  and selects it.
- **Placeholders**, as in PowerPoint. In Edit mode an empty text slot shows
  its placeholder (the slot's `placeholder` in the pack, else the default of
  its role; see `packs.md`) in the slot's own font, size, case, alignment and
  anchor, at 40% of the slide's ink, so it previews the real look. Clicking
  the slot, on the text line or anywhere in its box, puts the caret at the
  start. The first keystroke hides it; emptying the slot brings it back. It is
  drawn by the stylesheet from an attribute, never typed into the slot, so it
  is never saved into the slide JSON, never measured for overflow and never
  sent to the server.
- An empty figure slot in Edit is a faint dashed frame in
  the slide's ink with its placeholder centred in the pack's caption face,
  and under it the slot name and box size in small mono ("fig:a 290.9 x 239
  pt"); the size line is dropped in a slot under 40 pt tall. Pressing it
  selects the slot; the Slide tab shows nothing for it (`spec/hooks/provenance.md`
  **Never**).
- **Where placeholders show**: Edit mode (with any tool; *superseded
  2026-10-12: not in Comment mode's text slots, as Comment mode merged into
  Edit*) and the rail thumbnails. A thumbnail
  shows them faintly (text and figure prompt, no size line), because a fresh
  slide is otherwise a blank white card and the rail is where the user tells
  slides apart. They never show in View mode, on the print page (PDF) or in comment screenshots, so the slide looks like
  its output.
- The Slide tab lists no slots and prints no slide id, layout or revision. An
  overflowing slot reaches the user through its red outline on the slide and
  the danger dot on its rail thumbnail; the full list, across every slide, is
  `folio check` (there is no Warnings tab, removed *user, 2026-10-13*).
  Agents read the id, layout and revision with `folio show`.

### The rail: selection, dragging, the slide menu

- **Selecting.** A plain click selects one slide and makes it current.
  Ctrl+click (Cmd+click on macOS) adds or removes a slide without changing
  the current slide; the current slide is always part of the selection.
  Shift+click selects the range from the anchor (the last plain- or
  Ctrl-clicked slide) to the clicked one. With the rail focused,
  Shift+ArrowUp/Down extends the selection one slide at a time and Escape
  collapses it to the current slide; moving to another slide with the plain
  arrows collapses it too.
- **How it looks.** The current slide keeps its ash fill. When more than one
  slide is selected, every selected thumbnail also carries a 1 px ink ring,
  so the current slide reads as fill plus ring and the others as ring only.
- **Dragging.** Dragging any selected thumbnail moves the whole selection,
  in deck order, to the landing place; dragging an unselected one moves only
  it. The rail behaves as a sortable list: the dragged thumbnails leave
  their places (they turn invisible and their slots close up), and the
  thumbnails above and below the pointer slide apart to open one gap the
  size of the dragged group (one slot per slide, so a multi-selection opens
  one gap of N slots). The gap follows the pointer slot by slot; the
  neighbours move by `transform` over 180 ms on `--ease` (an ease-out), so
  the list's layout and height never change. A drag of one slide shows the
  browser's picture of that thumbnail under the pointer; a drag of several
  shows a small lifted stack labelled "N slides". Near the rail's top and
  bottom edges the list scrolls. Leaving the list puts the gap back where
  the group came from.
  - **Drop** settles the group into the gap without a jump: the dragged
    thumbnails reappear in the gap at once, and the neighbours hold their
    places until the server's new order arrives, when the list re-renders
    in that order with no animation. A drop where the order would not change
    writes nothing, and the list animates back.
  - **Escape** (or a drop outside the list) cancels: everything animates back
    to its place.
  - With `prefers-reduced-motion` the gap opens and closes without
    transition.
  - There is no insertion line and no highlighted thumbnail: the gap is the
    landing place. *(superseded 2026-10-13: "While dragging, the dragged
    thumbnails dim in place and a horizontal insertion line, 2 px of ink
    across the thumbnail's width with short end caps, sits in the gap the
    pointer is nearest ... A gap where the drop would change nothing shows
    no line.")*
- **Drawing only what is near.** A thumbnail renders its slide only when it
  is within 3 slots of the rail's visible window (the slots on screen plus
  3 above and 3 below); every other thumbnail is a same-size empty paper
  card with its number, so the layout never changes. While dragging, a
  thumbnail renders its slide only if, in addition, it stands within 3
  slots of the gap; the rest show the empty card until the drag ends.
  (Reading of "dont display side that is e.g. 3 slides aways from the
  hidden slide position": "hidden slide position" is the gap where the
  dragged slides will land.)
- **One write per move.** The browser names the landing place by the slide
  the group lands in front of (`POST /<deck>/order {ids, before}`), not by a
  position. The server takes the deck lock that every writer (CLI workers
  included) takes, re-reads `deck.json`, moves the group and writes the order
  once. A slide a worker inserts meanwhile does not shift where the group
  lands; if the landing slide was archived meanwhile, the move is refused
  (409) and nothing is written.
- **The slide menu.** Right-click on a thumbnail opens a menu in the chrome's
  glass with 13 px rows; a right-click outside the selection first selects
  that slide alone, inside a multi-selection the menu acts on all of them and
  is headed "N slides". Each row shows its key binding at the right in mono:
  - **Cut** (Ctrl/Cmd+X): holds the slides' JSON in the page (same clipboard
    Copy uses) and also puts it on the system clipboard, then archives the
    slides in one request. Nothing is erased: the files move to
    `slides/.archive/<date>/`, same as Delete;
  - **Copy** (Ctrl/Cmd+C): holds the slides' JSON in the page, and also puts
    it on the system clipboard;
  - **Paste** (Ctrl/Cmd+V): inserts the copied slides after the current
    slide as new slides with fresh ids, and selects them; a deck of another
    pack refuses with a notice. This holds whether the clipboard came from
    Copy or Cut: pasting slides that were cut makes new slides, it does not
    restore the archived ones;
  - **Duplicate** (Ctrl/Cmd+D): copy and paste in one step, right after the
    last selected slide;
  - **Delete** (Delete or Backspace): archives the slides. The word is the
    user's; the files move to `slides/.archive/<date>/`, which the row's
    tooltip says, and nothing is erased.
- ~~The bindings act when focus is in the rail, or anywhere in the editor
  outside a text slot, an input or a menu~~ *Superseded (user, 2026-10-14):
  Delete and Backspace only archive when focus is in the rail (the slide
  strip); anywhere else they never touch slides. One Backspace after
  clicking off a text box was archiving the current slide, and the key's
  auto-repeat then archived the next one 0.5 s later — the user lost two
  slides twice this way. Cut, Copy, Paste and Duplicate keep their
  Ctrl/Cmd-held scope (anywhere in the editor outside a text slot, an input
  or a menu); only Delete and Backspace are now rail-only.* Inside a text
  slot Ctrl+C, Ctrl+X and Ctrl+V keep their meaning for text. A held key
  does not repeat the archive, the cut or the duplicate — holding Delete,
  Backspace, Ctrl/Cmd+X or Ctrl/Cmd+D acts once, on the key's first
  keydown, and every further auto-repeated keydown is ignored *(user,
  2026-10-14)*. Paste and Duplicate are one request
  (`POST /<deck>/slides/paste`), and Cut and Delete are each one request
  (`POST /<deck>/slides/archive`); each writes the order once under the deck
  lock.
- These are the editor's only way to duplicate or archive a slide: the panel
  has no "This slide" section.

### Drawing and elements

- Moving and resizing any slot's box (PowerPoint placeholders), shapes, text
  boxes, alignment help and the elements' copy, cut, paste and
  delete are `drawing.md`; drafts are `drafts.md`.

## Never

- ~~Moving or resizing a box, or changing a font or size, on one slide.~~
  *Superseded (user, 2026-10-13, `overrides.md`): a slide may carry
  overrides, set and reset through `folio override` (CLI/HTTP; no browser
  Overrides section, `overrides.md`).* ~~No drag-to-resize: only shapes and
  text boxes are moved and resized on the slide.~~ *Superseded (user,
  2026-10-13): "for the text box, I couldnt change its size nor move it, can
  u make them like regular textbox? pls design it following industry standard
  (e.g. ppt". Every layout slot now moves and resizes like a PowerPoint
  placeholder, written as its box override (`drawing.md`, "Layout slots as
  boxes"). Font controls for layout slots are still not in the editor.*
- Saving against the revision the slide had at save time: a worker's edit that
  arrived during typing was silently overwritten that way.
- Unrecognized formatting from arbitrary pasted HTML stays out of the slide;
  copied Folio text keeps its supported run attributes (`rich-text.md`).
- Deleting a slide: archive only.
- A layout select plus a New button for inserting a slide: the layout is
  chosen by its picture, and the choice is the action.
- The "This slide" section, or Duplicate and Archive buttons, in the panel:
  these act on a slide and live on the rail's right-click menu and keys.
- An "Insert" heading, or "after N", above the layout cards. *(The template
  manager's "Templates" header, 2026-10-13, is a collapsible section header,
  not an Insert label.)*
- A layout's usage note on its card, as a sentence under the name or as a
  hover tooltip: the panel shows no details; usage notes are for agents
  (`folio prompt`).
- A per-slot line list in the panel (name, role, "1/22" counters): it
  repeated what the slide's outlines already say (and, for the full list,
  `folio check` — there is no Warnings tab to repeat any more, *user,
  2026-10-13*).
- A per-slide background picker in the panel: the background belongs to the
  deck's template.
- The slide id/layout/rev text in the panel: agents' bookkeeping, read with
  `folio show`, not the researcher's.
- Placeholder text saved into the slide: it is a hint, not content, and an
  agent or the PDF would take it for the slide's words.
- Placeholders in View mode or the PDF: the slide must look like its output.
- A drop target shown by highlighting a thumbnail: the landing place is the
  gap between thumbnails.
- A horizontal insertion line (2 px of ink with end caps) marking the gap,
  with the dragged thumbnails dimmed in place and their neighbours still:
  replaced by the opening gap. *(user, 2026-10-13)*
- Every thumbnail in a long deck drawing its slide at once, or during a
  drag: only those near the window, and the gap, render.
- A multi-move sent as one request per slide: each would re-read and rewrite
  the order, racing workers in between.
- The "This slide" section in the panel, and its Duplicate and Archive
  buttons: they live in the rail's right-click menu and key bindings.
- The Insert heading (and its "after N") in the panel.

## Where it lives

`packages/web/src/slide/TextSlot.tsx`, `FigureSlot.tsx`, `styles.css`
(`.folio-text[data-placeholder]`), `markupDom.ts`,
`packages/web/src/editor/deckState.ts` (`beginEdit`, `commit`, conflicts),
`SlideTab.tsx`, `LayoutCards.tsx`, `Rail.tsx`, `railSelection.ts`,
`RailDrop.tsx`, `railGap.ts` (the slots during a drag), `.rail-thumb` in
`styles.css`, `RailMenu.tsx`, `slideCommands.ts`, `slideKeys.ts`,
`packages/core/src/markup.ts`, `patch.ts`, `deck.ts` (`moveSlides`,
`insertSlides`), `packages/server/src/deckstore.ts` (`moveSlides`,
`pasteSlides`, `archiveSlides`), `routes-deck.ts`.

## Checks

`e2e/editing.mjs` (bold and subscript saved as markup; conflict card; Keep
mine; another slot's change kept without a card), `e2e/slide-actions.mjs`
(duplicate from the rail menu, archive with Delete; no "This slide" section,
Insert heading, Duplicate or Archive button, or background picker in the panel; a
layout card shows only its layout name and no tooltip; a layout card inserts one slide of its
layout at the current position + 1 and selects it; the Slide tab holds no
slot rows and no id or revision text), `e2e/placeholders.mjs` (a new
three-figures slide shows faint placeholders in the slot's font and a figure
prompt with its size; typing hides and emptying restores one; nothing is
saved or marked overflowing; none in View or on the print page; the rail
thumbnail shows them), `e2e/rail-select.mjs` (Ctrl, Shift,
Escape and Shift+Arrow selection; during a drag of a pair, no insertion
line element, the pair invisible in the gap, the neighbours translated by
whole slots, no highlighted thumbnail; a dragged pair landing together with
every thumbnail back in its own slot; in a nine-slide deck, thumbnails more
than 3 slots from the gap empty during a drag and drawn again after it; the menu's rows and
keys; Ctrl+X, Ctrl+D, Ctrl+C/V and Delete), `packages/core/test/deck.test.ts`,
`packages/web/test/railSelection.test.ts`, `packages/web/test/railGap.test.ts`.
