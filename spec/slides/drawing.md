# Slides: drawing on the slide, and its elements

What the user draws and selects on a slide in Edit: shapes, text boxes, the
alignment help that places them, and every element's copy, cut, paste and
delete. Split from `editing.md` (2026-10-13) when it passed 500 lines.

## Demand

- "Enable shapes insertion like arrows and sqiare and circle"
  *(user, 2026-10-13)*. Read with the shape model (`shapes.md`, written
  beside this): the editor inserts and edits shapes; it is the one on-slide
  geometry control, and it touches shapes only.
- On a screenshot with blue circles around the top row's shape group and
  around the bottom toolbar's Rect and Arrow sketch tools: "for folio, there
  are top and bottom icon thing, consider when its in the shape tool, just
  show a consistently showing poper next to the tool icon, e..g on top, and
  show the option instead" *(user, 2026-10-13)*. Reading: two rows of
  look-alike rectangle and arrow icons confuse; one Shape tool joins the
  bottom row, and its options live in a popover that stays pinned above it,
  replacing the top-row group and the Slide tab's Shape section.
- On a screenshot with the bottom tool row circled in blue: "can u add
  textbox option for user into insert, which also has font size and type
  persistent popover if its selected. also add text background and border
  option" *(user, 2026-10-13)*, and "also color as well" *(user,
  2026-10-13)*. Reading: a Text box tool beside the Shape tool draws an added
  text slot; its popover, pinned like the Shape tool's, sets font size,
  font ("type"), text colour, and the box's background and border.
- "for all element, there should be copy, paste, delete, cut for keybind
  and right click. this include all textblock figures, and table"
  *(user, 2026-10-13)*. Reading: every slot on a slide, of the template or
  added, is an element the Cursor selects, with Copy, Cut, Paste and Delete
  on keys and on a right-click menu.
- "for the select icon, when it single click anything, even on the page,
  its selection state cancels" *(user, 2026-10-13)*. Of the two readings,
  (a) the Cursor tool's selection cancelling was real: a second click inside
  a text box (or block) that already held the caret dropped its selection,
  frame and popover, because every press on the slide outside a shape's hit
  area deselected and no new focus selected it again. (b) The Region tool
  dropping back to Cursor on a single click did not reproduce; it stays
  chosen. Fixed: only a press outside every element deselects.
- "ask textbox drawing auto have align help" *(user, 2026-10-13)*. Reading:
  snapping with guides while drawing, moving and resizing text boxes and
  shapes alike.
- On a screenshot of Edit with the title slot of a title slide selected (a
  thin frame and a caret, no handles): "for the text box, I couldnt change its
  size nor move it, can u make them like regular textbox? pls design it
  following industry standard (e.g. ppt" *(user, 2026-10-13)*. Reading: every
  slot of the layout (title, subtitle, note, label, caption, author, contact,
  figures, tables, blocks) is a box that moves and resizes like a PowerPoint
  placeholder, with the frame, handles, drag, snapping and nudging the text
  boxes and shapes already have; the result is the slide's box override.
- On a screenshot of the bottom toolbar with Region, Pen, Rectangle, Arrow,
  Undo and Eraser boxed together: "group these all together, following the
  select ... and when one of them is selected, show a note that these are
  for draft making and will not actually edit the slide" *(user,
  2026-10-14)*. Reading: those six sit as one visible cluster right after
  the Cursor tool, and while one of the five selectable ones (Region, Pen,
  Rectangle, Arrow, Eraser) is the active tool, a small note above the
  toolbar says the marks are drafts for comments, not slide edits.

## Behaviour

### The draft tools group

- **The cluster.** Cursor, then a divider, then one unbroken group — Region,
  Pen, Rectangle, Arrow, Undo, Eraser — then, when the Shape and Text tools
  are offered, another divider before them. The group carries no divider of
  its own between Arrow and Undo: it reads as the single cluster the user
  boxed, bounded by the toolbar's existing dividers rather than a new
  container style.
- **The note.** While the active tool is one of Region, Pen, Rectangle,
  Arrow or Eraser (Undo is an action, never an active tool), a small card
  above the toolbar, in the same rounded-card/border-line/bg-surface style
  and type size as the tool tooltips, reads "Draft marks only: they don't
  edit the slide." It hides the moment Cursor, the Shape tool or the Text
  tool is current. It takes no pointer events, so it never blocks the canvas
  or the toolbar underneath it.
- **One line, sized to its text** (2026-10-15, asked as "can u make this one
  line and occupy minimum area"). The card does not wrap (`whitespace-nowrap`)
  and does not take a fixed or full width (`w-fit`): it is exactly as wide as
  its text plus the tooltip's own `px-2.5 py-1.5` padding, the smallest
  padding already in the toolbar's style, centred above the toolbar as
  before.

### Shapes in the editor

- **What a shape is.** An added slot `shape:<x>` of role `shape` in the
  slide's overrides (`overrides.slots.shape:a = {"role": "shape", "box":
  [x, y, w, h]}`, pt on the canvas) and its content in the slide prop of the
  same name: `{"kind": "rect" | "ellipse" | "arrow" | "line", "fill",
  "stroke", "strokeWidth", "dash", "heads", "from", "to", "text"}`, with
  `from` and `to` in pt from the box's top-left corner. A circle is an
  ellipse in a square box. The model and the drawing are `shapes.md`'s.
- **The Shape tool** (superseding the top-row group, 2026-10-13). One tool
  in the bottom tool row, Lucide `Shapes`, after the comment tools and the
  eraser behind a divider; the top row holds only Edit and View again. The
  comment tools (Region, Pen, Rectangle, Arrow, Eraser) stay: they draw
  comment marks, the Shape tool draws slide content. Picking the Shape tool
  puts the comment tool back to Cursor (no comment tool shows chosen while
  it is on); picking Cursor or a comment tool drops it.
- **Its popover.** While the Shape tool is on, a popover in the toolbar's
  glass stays open, pinned one gutter above the tool's button: not on hover,
  and not closed by drawing. It holds the options: the kind (Rectangle,
  Ellipse, Arrow, Line, Lucide `Square`, `Circle`, `MoveRight`, `Minus`),
  the style, fill, stroke colour, stroke width, dash and heads described
  below. With nothing selected, it is headed "Next shape" and sets the shape
  the next drag draws (kept in the page, not written). While a shape is
  selected, the same popover shows over the Shape tool, headed "Shape a",
  edits that shape, and adds the text inside a rectangle or ellipse; picking
  another kind there changes the shape's kind and drops the fields the new
  kind does not take. The popover closes when another tool is picked, on V,
  or on Escape: the first Escape deselects the shape, the next drops the tool.
- **Keys.** S rectangle, O ellipse, L line, Shift+L arrow turn the Shape tool
  on with that kind; V drops it. They are live where the comment tool keys
  are (Edit, focus outside a text slot, an input, a menu or the popover).
  The comment tools keep R, B, A, P, E and V.
- Everything the Shape and Text box tools draw is a **draft** by default,
  the user's sketch of intent for an agent, with a Draft / Final toggle at
  the top of each popover (`drafts.md`).
- With the Shape tool on, a drag on the slide draws the shape; Shift keeps
  a rectangle or ellipse square (a circle) and snaps an arrow or line to 45
  degrees. Shift counts once the drag has begun: Shift held before the
  press is the pan mode (`spec/chrome/zoom.md`), so it still pans, as it
  does over a comment region. Release writes the slot and its content (the
  popover's options, kept to the fields the kind takes) in one write, under
  the next free name (`shape:a` ... `shape:z`, then `shape:aa`), selects the
  new shape and goes back to the Cursor, the popover now editing the new
  shape. A drag under 4 pt draws nothing. Escape cancels the drag. The
  dashed outline drawn while dragging inverts whatever colour lies under each
  part of it, rather than reading one fixed colour *(user, 2026-10-14: "edit
  so that the selection tool's dash auto contrast with the background", then
  "can u make it fancy as if the dashline auto change color" and "and its
  regional change color")*: a white stroke with `mix-blend-mode: difference`
  (`Outline` in `shapeMarks.tsx`), so it reads white over a dark background or
  figure, ink over a light one, and the inverse hue over a coloured one, all
  along the same dash. *(Superseded 2026-10-14: a solid white stroke drawn
  once more under the ink dash, the same look everywhere regardless of what
  was under it.)*
- **Select and edit** (Cursor tool). Clicking a shape selects it: its box
  shows a 1 px ink outline with eight square handles (rectangle, ellipse), or
  a handle at each end (arrow, line). Dragging the shape moves it; a handle
  resizes (Shift keeps a rectangle or ellipse's proportions); an end handle
  moves that end (Shift snaps to 45 degrees). Delete or Backspace removes the
  shape: its override slot and its prop, in one write; the slide is not
  archived. Arrow keys nudge it 1 pt, Shift+arrow 10 pt, instead of moving
  between slides. Escape or a click on the empty slide deselects it.
- **The options**, in the popover: the style (one of the pack's shape
  styles, or the slot's), fill (rectangle and ellipse), stroke colour,
  stroke width (pt), dash (solid, dashed, dotted), heads for an arrow (none,
  end, start, both) and, for a selected rectangle or ellipse, its text. For
  a selected shape each change is one write. The Slide tab has no Shape
  section.
  - A colour is picked from swatches: None (no paint), `ink` (the slide
    background's ink), each of the pack's named `colors` (written by name, so
    the pack's palette stays the one source), and a well for any hex.
  - Only the fields the shape's kind takes are offered or written: no fill
    or text on an arrow or line, `radius` only on a rectangle, `heads` only
    on an arrow, `from`/`to` never on a rectangle or ellipse; the shape
    schema refuses the rest (`shapes.md`).
- **Writes.** Every edit is one PATCH carrying the overrides and the shape's
  prop together, against the revision the slide has. Edits are sent one at a
  time, each built from the slide as the last one left it. If a worker moved
  the slide meanwhile and the shape is as the user last saw it, the edit is
  rebuilt on the newer revision and sent again; if the shape itself changed,
  the newer version is kept and a notice says the edit was not saved.
- **Zoom.** Pointer positions are read through the slide canvas's own
  transform, so drawing, moving and resizing land on the same pt at any zoom
  and pan (`spec/chrome/zoom.md`).

### Text boxes in the editor

- **What a text box is.** An added text slot `text:<x>` of role `body`
  (the pack's first text role when it has no `body`) in the slide's
  overrides, with its box, optionally its `text` style fields (size, font,
  weight, italic, colour, alignment) and its box style: `fill`, `border`
  and `padding` (`overrides.md`). Its words are the slide prop of the same name, exactly as
  for any text slot: typed in place, measured, warned about when they
  overflow, drawn the same in the PDF and in shots.
- **The Text tool.** Lucide `Type`, in the bottom tool row right after the
  Shape tool; key T (free: the comment tools keep R, B, A, P, E and V, shapes
  S, O, L). It is one tool among the Cursor, the comment tools and the Shape
  tool: picking any of them drops the others.
- With the Text tool on, a drag on the slide draws the box (Shift after the
  press keeps it square, as for shapes; under 4 pt draws nothing). Release
  writes the added slot in one write under the next free name (`text:a` ...
  `text:z`, then `text:aa`), with the popover's options, goes back to the
  Cursor, selects the box and puts the caret in it, so typing starts at once.
  The empty box shows its role's placeholder like any empty text slot.
- **Its popover.** While the Text tool is on, or a text box is selected, a
  popover stays pinned above the Text tool, in the same material as the
  Shape tool's: font size (pt), font (the families the pack ships in `fonts`
  and those its roles name; folio draws only fonts a pack carries; "Role
  font" leaves the role's), bold and italic, text colour (`ink`, the pack's
  named colours, any hex; "Role" leaves the role's), alignment (left,
  centre, right, justify), background (None, `ink`, pack colours, hex),
  border: colour (None removes it), width (pt) and dash, and padding (pt);
  setting a background or border on a box without padding gives it 4 pt. With nothing
  selected it is headed "Next text box" and sets the next box drawn (kept
  in the page); with a box selected it is headed "Text box a" and each change
  is one write of the box's overrides.
- **Typing versus selecting.** A click inside the box puts the caret there:
  the box is typed into in place and is also the selected box, so its
  popover and its frame with handles show. The box is moved by dragging its
  edge and resized by its eight handles; neither starts typing. As in
  PowerPoint, the frame is drawn exactly on the box outline and each handle's
  square is centred on its corner or edge, for every box (text box, text
  slot, block, figure, table, shape), so it lines up with the slot's own
  overflow outline (now drawn on the box too, not 2 px outside it), other
  boxes and the guides. What takes the pointer lies
  only outside the box: the edge band is a strip about 6 screen px wide from
  the outline outwards (the move cursor), and each handle takes the 8 px
  beyond its corner or edge; the inner half of a handle is drawn but takes
  no press. So a press or a drag starting on any character, even the first
  one flush with the box, places the caret or selects text. A resize moves
  the edge by the pointer's travel since the press, so the edge never jumps
  to where the handle was grabbed. *Superseded 2026-10-13: the band first
  straddled the outline and took a drag that began on the first character;
  then the frame, band and handles were drawn 4 px outside the box, which
  the user saw as "the drag box is a bit larger than the actual thing
  causing aligment weird as visually they not quiet align" (user,
  2026-10-13).* Escape
  while typing leaves the text (as for every slot: it reverts what was not
  saved) and keeps the box selected; then Delete or Backspace removes the box
  (its override slot and its prop, in one write), arrow keys nudge it 1 pt
  (Shift: 10 pt), and a second Escape deselects it. Delete, Backspace and the
  arrows inside the text keep their meaning for text.
- A text box is never moved, resized or removed while its caret is in it by
  a key: only by its edge, its handles or the keys after Escape.

### Layout slots as boxes (placeholders)

- **Every slot is a box** (2026-10-13). With the Cursor tool a slot of the
  layout (text, block, figure, table, shape) is selected, moved and resized
  exactly as a text box or a shape is: the same frame with eight handles, the
  same drag, the same alignment help, the same nudges. There is one
  implementation, the shape layer's.
- **Text slots and blocks** behave as text boxes do, which is how PowerPoint
  treats a placeholder: a click inside puts the caret there and selects the
  box (frame and handles show while typing); the edge band (the move
  cursor) selects the box without the caret and drags it; the handles
  (resize cursors) resize it; the text inside keeps the text cursor.
  Escape while typing leaves the text with the box still selected; a second
  Escape deselects. With the box selected and no caret, Enter or F2, or a
  double-click on its edge, puts the caret in it with all its text selected,
  as PowerPoint does.
- **Figures, tables and layout shapes** take a press anywhere on their body
  (the move cursor): a click selects, a drag moves.
- **Moving and resizing.** Dragging the frame moves the box; a corner handle
  resizes both sides it touches, a side handle one; Shift on a corner keeps
  the proportions. Snapping and guides as above; Alt turns snapping off
  (shapes have no from-the-centre resize, so neither do slots). With the box
  selected and no caret, the arrow keys nudge it 1 pt, Shift+arrow 10 pt.
  The font size never changes: the text reflows in the new box, and the line
  limit and overflow warning are counted from it.
- **Live preview** ("when dragging, e.g. text box ( or any box), content
  should follow as well for constant preview of expectation", user,
  2026-10-13). During a move, a resize or an arrow nudge the content goes
  with the frame on every frame: the slide in view is drawn as the write
  would leave it, so the text reflows to the dragged width, a picture, table,
  block or shape is drawn at the dragged box, and the overflow outline is
  measured from it. This holds for every box: layout slots, text boxes,
  blocks, figures, tables and shapes (an arrow's or line's ends included).
  Nothing is written until the drag ends (one write); the preview stays until
  that write lands, so the content does not jump back. Escape during a drag
  cancels it: the frame and the content return to where they were and
  nothing is written.
- **Where it is written.** One write per drag end (or nudge) of the slot's
  `overrides.slots.<name>.box` (`overrides.md`), through the shapes'
  revision-checked writes. A slot the layout places `below` another also gets
  `below: null` in the same write, so it stays where it was put; the slots
  below a moved slot follow it.
- **Undo.** A box move, resize, nudge or reset is one entry in the server's
  per-deck user history (`undo.md`). Ctrl+Z and Ctrl+Y act on that history;
  uncommitted text edits keep the browser's own undo first.
- **Reset position and size.** The element menu of a layout slot whose box
  is overridden has a row "Reset position and size": one write that removes
  the slot's `box` (and a `below` this editor set) and nothing else, so the
  slot returns to the layout's box and keeps its other overrides. Nothing is
  added to the Slide tab.
- Typing a letter with the box selected and no caret does not start typing
  (unlike PowerPoint): single letters are the tool keys (S, O, L, T, V and
  the comment tools').

### Elements: copy, cut, paste, delete

- **Selecting.** A click on an element selects it and it stays selected,
  however often it is clicked again (inside a text, a click moves the caret
  and keeps the selection); a left press on the slide outside every element
  (no slot, shape hit area or handle) deselects, and so does a click outside
  the slide. Tools stay chosen until another tool is picked, or Escape or V.
- With the Cursor tool every slot on the slide is an
  element: template text slots (titles, labels, captions, notes), figures,
  tables, and added slots (shapes, text boxes, blocks). A click selects it
  (inside a text slot it also puts the caret there); the selected element
  shows the frame the shapes use, with its handles: every element moves and
  resizes ("Layout slots as boxes" above; *superseded 2026-10-13: handles
  only on shapes and text boxes*). Escape inside text leaves the text with
  the element still selected.
- **Keys** (Ctrl, or Cmd on macOS), on the selected element while no text
  is being typed into: C copies, X cuts, V pastes, Delete or Backspace
  deletes. Inside text they keep their text meaning (Ctrl+C copies the
  selected words). ~~With focus in the rail, or no element selected, the
  keys act on slides as before~~ *Superseded (user, 2026-10-14): Delete and
  Backspace act on slides only with focus in the rail; with no element
  selected anywhere else (for instance after clicking an empty spot on the
  slide canvas) they do nothing — a Backspace there used to archive the
  current slide, and the key's auto-repeat archived the next one 0.5 s
  later, costing the user two slides twice. Ctrl/Cmd+C, X, V and D keep
  their current scope: with no element selected they still act on slides
  anywhere outside a text slot, an input or a menu.* Ctrl+V pastes an
  element when the last thing copied was an element, slides when it was
  slides.
- **Right-click** on an element selects it and opens a small menu in the
  rail menu's glass and rows: Copy, Cut, Paste, and Delete (an added slot)
  or Clear (a slot of the layout), each with its key at the right. A
  right-click on the slide outside every element opens it with Paste only,
  pasting at that point. The menu opens on a right-click without movement
  (under 4 px between press and release); a right drag still pans
  (`spec/chrome/zoom.md`), and the browser's own menu stays suppressed.
- **What is copied**: the element's definition and content. For an added
  slot, its slot override and its prop; for a slot of the layout, its
  content and its slot as the slide shows it (the layout's definition with
  this slide's override of it laid over). It is kept in the editor (shared
  by every tab of the workspace) and, for text, also written to the system
  clipboard as plain text.
- **Paste**:
  - onto a selected element of the same kind (text onto any text slot, a
    figure onto a figure, a table onto a table, a shape onto a shape) it
    replaces that element's content, one write;
  - otherwise (nothing selected, or a different kind) it adds a new added
    slot with the next free name of its kind (`text:<x>`, `fig:<x>`,
    `table:<x>`, `shape:<x>`) at the copy's place moved 12 pt right and
    down, or at the right-click point; across slides and decks alike. A
    pasted element keeps the copy's draft or final status: a copy of real
    content is real, a copy of a draft stays a draft.
- **Delete and Cut**: on an added slot they remove it (slot and content); on
  a slot of the layout they clear its content, since the slot belongs to the
  layout (hence "Clear" in the menu). One write each.
- Every action is one write against the slide's revision, rebuilt on a newer
  revision when the element itself did not change (as for shapes). Undo
  covers box moves and resizes only (above) and text within a slot
  (`rich-text.md`); Delete and Cut on a template slot leave its slot, and a
  cut element stays on the clipboard to paste back.

### Alignment help

- While a shape, text box or layout slot is drawn, moved or resized, or an arrow's or
  line's end is dragged, its edges and centre snap to the targets on the
  slide: every other slot's left, centre and right (and top, middle,
  bottom), template slots and added ones alike, and the slide's edges and
  centre lines. The pack declares no page margins, so the template's own
  slot edges stand for them.
- A drawn box snaps its two corners; a moved box whichever of its edges or
  centre comes nearest, per axis; a resize handle along its own axes only (a
  side handle along one); an end point both ways. Shift's square and 45
  degrees win over snapping for an arrow or line end.
- An edge snaps within 4 screen px, so the pull is the same at every zoom.
- What it snapped to shows as thin guide lines across the slide in one
  accent colour (`#0a84ff`, apart from the slide's own colours and from the
  red of warnings), only while the drag lasts.
- Holding Alt during the drag turns snapping off (Ctrl/Cmd are taken by the
  rail's selection and zoom, Shift by squares and 45 degrees).
- No equal-gap hints for now.

## Never

- Shape tools inside the comment toolbar, or sharing its keys: a shape is
  slide content, a sketch is a comment mark.
- An Insert shape group of four kind buttons in the top row beside Edit and
  View, and a Shape section in the Slide tab (2026-10-13, replaced the same
  day by the Shape tool and its popover): two rows of look-alike rectangle
  and arrow icons, and options far from the tool.
- A shape options popover that opens on hover or closes when a shape is
  drawn.
- A right-click that opens the element menu at the end of a right drag:
  a right drag pans.
- Delete on a template slot removing the slot itself: the slot belongs to
  the layout; only its content is cleared.
- Snapping that cannot be turned off, or guides that stay after the drag.
- A text box that changes its font size to fit: like every slot, the size
  is the one set, and overflow is reported, not hidden.
- A Text tool whose box takes a press inside the text for moving: the
  inside of a text box is for typing; moving is by its edge.
- A layout slot fixed in place while text boxes beside it move (2026-10-13,
  replaced the same day): "I couldnt change its size nor move it".
- A second drag-and-handle implementation for layout slots: they use the
  shape layer's.
- Resizing a slot changing its font size (PowerPoint's autofit): the size is
  the role's; overflow is reported.
- A "Reset position and size" control in the Slide tab: it is on the
  element's own menu.
- A shape written in two requests (override, then prop): a failure between
  them would leave an empty slot or an unknown prop.

## Where it lives

`packages/web/src/editor/ShapeTools.tsx` (the tools, popovers and keys),
`ShapeOptions.tsx`, `ShapeColors.tsx`, `ShapeLayer.tsx`, `shapeMarks.tsx`,
`shapeDrag.ts`, `snap.ts` (alignment help), `slotBoxes.ts` (layout slots as
boxes, reset), `shapeWrites.ts` (box writes), `boxPreview.ts` (live preview while dragging), `TextTools.tsx`,
`TextOptions.tsx`, `textBoxModel.ts`, `shapeModel.ts`, `shapeWrites.ts`,
`elementClip.ts`, `elementCommands.ts`, `ElementMenu.tsx` (elements),
`packages/web/src/comments/CommentToolbar.tsx` (carries the tools),
`packages/core/src/textedit.ts`, `boxstyle.ts`,
`packages/web/src/slide/BoxBackdrop.tsx`.

## Checks

`packages/web/test/shapeModel.test.ts` (drawn boxes with and without Shift,
next free name, one-write insert and delete ops, move, resize and end drags),
`packages/web/test/snap.test.ts` (targets, point, move and handle snapping,
Alt), `packages/web/test/textBoxModel.test.ts` (insert, look writes, padding
with a frame, fonts), `packages/web/test/elementClip.test.ts` (what a copy
holds; paste onto a compatible slot replaces, onto another kind or nothing
adds the next free slot offset 12 pt or at a point; delete versus clear),
`packages/core/test/textbox.test.ts` (box style accepted and refused by path,
line limit from the padded box, `folio text add`), `e2e/shape-editor.mjs` (a
rectangle, a Shift circle and an arrow drawn; one moved; one deleted; the
slide file holds exactly what was drawn), `e2e/textbox.mjs` (a text box drawn
with the Text tool snaps to another slot's left edge, takes typing, its
popover sets size, font, colour, background and border; Delete after Escape
removes it), `e2e/elements.mjs` (a table copied to another slide with keys;
a figure cut; a shape deleted from the right-click menu; a right drag still
pans without a menu; Ctrl+C inside text still copies the words),
`packages/web/test/slotBoxes.test.ts` (layout slots as items, flowed boxes,
place and reset ops, undo snapshots), `e2e/slot-boxes.mjs` (a title slot
selected by its edge shows eight handles, moved by a drag, resized by a corner
handle, nudged with the arrows; the box override on disk and after a reload;
typing inside still saves; Reset position and size restores the layout box
and keeps the slot's other overrides; Ctrl+Z and Ctrl+Y; the frame on the
slot's own rect within 1 px; mid-drag the content moved by the drag and a
resize reflowing the text; Escape cancelling a drag).
