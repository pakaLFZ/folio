# Comments: a region, a sketch and a message

## Demand

- "select regions in the ppt, and leave comments, and agent will have access to
  a list of the comment that gave, which include screenshot, involved
  component, and my message. and it can leave comments to my comments as well,
  until its resolved and the comment is archived. the comment list for agent,
  e.g. show during compile or status check." *(user, 2026-10-12)*
- "add a quick canvas when user are in comment mode so that they can draw, put
  rectangles, draw arrows to help commentin" *(user, 2026-10-12)*
- Only the user resolves; a worker may mark a comment answered.
  *(user, 2026-10-12)*
- "remove red bit": the user struck through the numbered pins drawn on the
  slide in Edit mode. *(user, 2026-10-12)*
- "when I select, automatically insert a msg bubble next to it"
  *(user, 2026-10-12)*
- "for the selected region screenshot, auto hide the selection border in the
  selection screenshot" *(user, 2026-10-12)*: the user circled two inbox cards
  whose previews were all dashed border.
- On two marked-up screenshots of the Comments tab and the slide in Comment
  mode, with the number circles, the follow bells, each issue's header row
  ("1 Third in the queue. waiting on agent") and the three numbered pins on
  the slide struck out in red: "just make all the issues default show first
  msg. delete red part that I select. make the display order natually be the
  order of execution. on the slide, only show the selected issue's selection
  and draft" *(user, 2026-10-12)*. Of the misaligned expanded card: "this is
  weird" *(user, 2026-10-12)*.
- On the Comments tab, the hint line "Draw a region on the slide to comment",
  the divider under it, the section label "This slide" and the "Show
  resolved" toggle struck out in red: "remove them" *(user, 2026-10-12)*.
- Of the sketch toolbar, circled: "center to deck display area pls and get rid
  of the excess background" *(user, 2026-10-12)*.
- On the new-comment card, its head line "Region over note, fig:a" and the
  card around the input struck out in red: "for selection (red), remove the
  extra box border just attach the input bar near by, and if user click
  elsewhere with empty input, default meaning discard selection, otherwise,
  submit" *(user, 2026-10-12)*.
- Of the Edit / Comment / View switch, circled: "merge comment and edit to
  edit" *(user, 2026-10-12)*. Commenting moves into Edit; the switch keeps
  Edit and View.
- "since we merge edit and comment, thus default in edit mode there is a
  cursor tool, so that we can select text and edit" *(user, 2026-10-12)*.
- Written as a comment on a slide: "for input row add a shadow effect when its
  floating" *(user, 2026-10-13)*.
- "edit so that the selection tool's dash auto contrast with the background"
  *(user, 2026-10-14)*. Reading: the dashed region border is near-black ink
  only, so it disappears on a dark slide background or figure; it must read
  on any background without the user choosing a colour.
- "also, sometiems the selection tool can accidentally drag image. selection
  tool single click image can quick select image, card, or other object, but
  dont drag." *(user, 2026-10-14)*. Reading: "the selection tool" is Region.
  A press on a picture can start the browser's own native image drag (the
  ghost image follows the pointer) instead of drawing a region or taking the
  slot. Wanted: a single click on a picture, card/block, table, shape or text
  box with Region takes that slot exactly as a click on any other slot
  already does (the bubble opens on it); and nothing on a slide is ever
  natively dragged by the browser, in any comment tool, at any zoom including
  the column view, and in the rail thumbnails.

## Behaviour

- **Commenting is part of Edit** *(user, 2026-10-12: "merge comment and edit
  to edit")*. ~~A separate Comment mode in the top row: a drag on the slide
  set the region, a click took the slot under the pointer.~~ *Superseded.* In
  Edit the floating toolbar at the foot of the scene is always shown. It
  offers the **Cursor** tool (lucide `MousePointer2`, tooltip "Edit text
  (V)"), a hairline divider, then the
  comment tools **Region**, **Pen**, **Rectangle** and **Arrow**, a second
  divider, then Undo and Clear. Marks are vectors in pt on the pack canvas,
  drawn in ink over the slide; they never change the slide. Without a region,
  the region is the sketch's bounding box.
- **The tool decides what a press on the slide does; nothing else does**
  *(user, 2026-10-12: "default in edit mode there is a cursor tool, so that
  we can select text and edit")*. One rule, stated per tool:
  - **Cursor** (chosen whenever Edit is entered): the comment layer takes no
    pointer at all. A press in a text slot places the caret, a drag selects
    text, a click on a figure slot selects it, exactly as Edit did before. A
    drag never draws a region, wherever it starts. The selected issue's
    region and marks still show, and never block a click on the slot under
    them.
  - **Region**: a drag sets the region; a click (under 4 pt of travel) takes
    the box of the slot under the pointer — a picture, a card or block, a
    table, a shape or a text box alike — and opens the bubble on it exactly
    as a drawn region does. Overlapping slots pick the one painted on top
    (the layout's last-declared slot at that point, since slots paint in
    declaration order). Text slots do not take the caret.
  - **Pen, Rectangle, Arrow**: a press draws that mark. Text slots do not
    take the caret.
  The cursor shows the tool: a crosshair for Region, a cell cross for the
  marks, the slot's own cursor for Cursor. A drawing tool lasts one comment:
  sending or discarding it (Enter, Send, a click away or Esc) returns to
  Cursor; V or Esc with no draft open returns to Cursor too. Choosing a
  comment tool opens the Comments tab. *(Rejected: one tool that guesses, drawing a region when a drag
  starts outside a text slot or travels past a threshold before text is
  selected. A drag that begins a hair outside a slot to select its first
  word would turn into a comment, a figure click would compete with a
  region click, and nothing on screen would say which one was coming. With
  explicit tools a press means one thing, the toolbar and the cursor say
  which, and typing can never start a sketch.)*
- **Tool keys**: V Cursor, R Region, P Pen, B Rectangle (box), A Arrow. They act
  only in Edit, only when focus is outside a text slot, an input or a menu,
  and only without Ctrl, Cmd, Alt or Shift, so a letter typed into a slot is
  always text and Ctrl+V is still paste. Each tool's tooltip names its key.
- **The sketch toolbar** is centred on the deck display area, not on the
  window: on the scene between the rail and the panel, using the same insets
  the scene fits the slide to (rail open or closed, panel open or closed, at
  whatever width either pane has). The editor publishes them once, as
  `--scene-left`, `--scene-right` and `--scene-bottom` on the floating chrome,
  so opening, closing or resizing a pane recentres it. Below 900 px the insets
  are zero across, so it is centred on the screen, and it stands above the
  bottom sheet. It is one button group with no shell around it: the group
  itself carries the glass material and `--radius-control`, a sunken well like
  the mode switch; the Cursor tool, a hairline divider, the four comment
  tools, a hairline divider, then Undo and Clear, all at the segments'
  height. *(user, 2026-10-12)*
- **The bubble.** Releasing a region (or finishing a mark) with a comment tool
  attaches the shared input bar (one line, the paperclip, Send; see
  `chat-and-following.md`) on the canvas next to the selection, and its text
  field takes focus at once. The bar is the whole thing: no card around it, no
  head line, no close button and no pointer *(user, 2026-10-12; superseded: a
  small glass card with a pointer, headed by the slots the region covers)*. It
  keeps its own bordered surface and takes the floating-glass shadow
  (`--glass-lift`, `InputBar`'s `floating` prop) so it reads as lifted above
  the slide *(user, 2026-10-13: "for input row add a shadow effect when its
  floating")*; its "Uploading" and error lines sit on the same raised surface.
  The bars docked in the Comments tab, a thread's reply and the inbox panel
  pass no `floating` prop and stay flat. The covered slots are no longer shown; they
  are still stored with the comment. It sits to the right of the selection's
  top-right corner; if that runs off the scene or under the panel it flips to
  the left, then below, then above. It never covers the selection. A redrawn
  region moves it and keeps the typed text; it follows the slide's zoom and
  the window's size. The pen, rectangle and arrow keep drawing while it is
  open, and their marks join this comment. Below 900 px it docks to the foot
  of the window, 12 px in from the edges.
- **Leaving the bar.** Enter or Send sends the comment and closes the bar;
  Esc discards the draft. A press anywhere else (a primary-button pointerdown
  outside the bar) leaves it *(user, 2026-10-12)*:
  - with an empty field (or only spaces) and no attachments, the draft is
    discarded: the selection and the sketch go and the bar closes, as Esc;
  - with text or attachments, the comment is sent, as Send.
  ~~It selects the new issue, unless the press was on another issue in the
  Comments tab, which that issue's own click then selects.~~ *Superseded
  (user, 2026-10-13: "default comment sent, make it the 'closed' state or the
  sttae with no msg bar showing"): a sent comment opens closed, in the
  Comments tab and on the slide, exactly like any other unselected issue. The
  user opens it the same way as every other card, by clicking it.*
  These presses do not leave it: on the slide while a comment tool is
  chosen (drawing a new region, which moves the bar, or a mark); on the
  sketch toolbar (switching tools included); the paperclip's file picker;
  the zoom chip; a pan (Shift or the middle button). With the Cursor tool a
  press on the slide is a press elsewhere: it leaves the bar by the rule
  above, then places the caret.
- The bar has no hint line. *(user, 2026-10-12: "red means remove (for
  simplicity)")*
- **The Comments tab** is one plain list of the current slide's open issues,
  with no hint line, no divider, no section label and no "Show resolved"
  toggle; choosing a comment tool opens it (*superseded 2026-10-12: entering
  comment mode opened it*). In Edit it is fully live: the top "New comment on
  this slide" bar, selecting an issue (which draws it on the slide), Resolve
  on hover, and the reply bar. Resolved issues are reached on the
  board's Done column and by `folio comment search`. With no open issue the
  tab shows only the input bar (see `chat-and-following.md`). The list stays
  on this slide, and the tab's badge counts the whole deck's unresolved
  comments *(user, 2026-10-14: "only show this slide, and the badge icon show
  total notification")*.
- **Every issue shows its first message** as a chat bubble, in the chat's
  bubble style (the user's in ink on the right), with its files and the
  region's screenshot as thumbnails. Pressing the bubble (or anywhere on the
  issue) selects it; pressing the selected bubble again clears the selection.
  The selected issue adds, under the first bubble, the rest of the thread
  and the shared input bar, on a faint fill. Resolve is an icon at the
  card's top-left, shown on hover or focus (see `chat-and-following.md`;
  *superseded 2026-10-12: a Resolve button under the thread*). Every issue, selected or
  not, has the same padding, so all share one left and one right edge, and
  the input bar's Send never runs past the issue's right edge. An issue has no
  header row: no number, no truncated title, no status text, no bell.
  Whose turn it is shows in the selected thread itself (the last bubble's
  side), so there is no status line *(chosen 2026-10-12: a "your turn" line
  would repeat what the last bubble says)*.
- **Order of execution.** The list is in the order agents work the issues
  (`executionOrder` in core): the board's columns left to right, each in its
  board order. Queue first, by rank, top first: the order `folio comment
  next` claims them; then In progress, Review and Held. Dragging a card on the
  board changes its rank, and the list follows live.
- **The dash auto-contrasts with the background** *(user, 2026-10-14: "edit so
  that the selection tool's dash auto contrast with the background")*, and
  **the colour changes along its length** *(user, 2026-10-14: "can u make it
  fancy as if the dashline auto change color" and "and its regional change
  color")*: the dash inverts whatever colour lies under each part of it —
  white over the black separator background, ink over white, the inverse hue
  over a coloured figure — rather than one fixed look. It is a white stroke
  with `mix-blend-mode: difference` (`RegionOverlay` in `marks.tsx`, used by
  `MarksLayer` and the region being dragged in `Sketch.tsx`), drawn in its own
  always-opaque overlay element, never inside a dimmed `MarksLayer`, so the
  blend always reaches the slide underneath rather than being cut off by an
  ancestor's `opacity`. It never doubles the count of dashed rectangles a
  check (or the screenshot hiding) looks for, and it is hidden everywhere the
  dashed border itself is hidden (the region screenshot). *(Superseded
  2026-10-14: a fixed two-tone white-under-ink stroke, same on the whole
  border regardless of what was under it.)*
- **Every draft mark auto-contrasts too**: "these shapes also share the
  dynamic background color constrat thing" *(user, 2026-10-14)*. The pen,
  rectangle and arrow (its shaft and head alike) take the same white stroke
  with `mix-blend-mode: difference` as the region border, so a pen stroke or
  a rectangle drawn over a black title slide stays visible exactly as one
  drawn over a white slide (`MarkShape` in `marks.tsx`). *(Superseded
  2026-10-14: a fixed near-black ink stroke, `MARK_INK`, which a difference
  blend cannot invert — difference against a near-black backdrop returns
  nearly the same colour, so the mark all but disappeared on a dark slide,
  the opposite of what the blend is for.)* The eraser draws no live preview
  stroke of its own (only its cursor icon), so there is nothing there to
  recolour.
- **A draft belongs to one slide, and switching slides never bleeds marks
  across that boundary**: "the drawing disappears on slide for some reason"
  *(user, 2026-10-14)*. Drawing after a slide switch used to write straight
  into the draft left on the slide behind (its `slide` field never moved
  with the view), so the new mark showed nowhere and the earlier slide
  silently gained marks it was never drawn on. Switching slides now matches
  the open draft to the one the current slide owns: leaving a slide flushes
  its draft to disk at once (the 1 s autosave may not have fired yet) and
  arriving at a slide loads that slide's own saved draft back, so a pen
  stroke, rectangle or arrow survives every tool switch, re-render and trip
  to another slide and back; it is only ever lost by Undo, Clear, the eraser,
  Esc (discards the whole draft) or sending the comment (closes the draft,
  keeping the marks on the sent comment).
- **Nothing on a slide is ever natively dragged by the browser**: no image,
  link or text drag ghost starts from a press on the slide, whatever comment
  tool is chosen, in the single-slide scene, the column view below 100% zoom,
  or a rail thumbnail *(user, 2026-10-14)*. `SlideView` (the one renderer
  Scene, ColumnScene and the rail thumbnails all draw through) clears the
  `draggable` attribute of every `img` and `a` under it after each render and
  on any later change (a `MutationObserver`), and a `.folio-slide img,
  .folio-slide a { -webkit-user-drag: none }` rule backs it up for the first
  paint. A rail thumbnail's own `<button draggable>` (reordering slides) sits
  outside `SlideView` and is untouched, so it still drags once the browser's
  walk-up past the now non-draggable image reaches it. The Select/Shape
  tools' own move of a shape or text box in Edit, and the Cursor tool's text
  selection, are unaffected: only the browser's native drag-and-drop is
  disarmed.
- **On the slide, only the selected issue.** In Edit, with any tool, the slide shows
  the selected issue's region (dashed) and its sketch marks, and the user's
  own draft while composing. Other issues draw nothing; with none selected,
  nothing of the existing comments is drawn. Selecting an issue in the list,
  or opening one by its address (`?comment=`), draws it and scrolls the tab
  to it. With a comment tool, clicking empty slide space starts a new region
  and the bubble; with the Cursor tool it does not.
  Resolving the selected issue clears the selection.
- **The record** is one file, `comments/<cid>.json`: slide, the slide's
  revision, region, marks, the covered slots as they were (text, figure path, or
  hook with its inputs and last run, and overflow), the thread, status,
  assignee, followers and queue rank.
- **Screenshots** are rendered on the server through the print page:
  `shot-slide.png` and `shot-region.png` (at 2x), in `comments/<cid>/`. A reply
  on a slide that changed since adds a new pair. Both carry the user's sketch
  (pen, rectangle, arrow) and never the selection border: no dashed rectangle,
  outline or tint. `shot-region.png` is the slide content inside the region
  plus the sketch. `shot-slide.png` locates the region with four faint ink
  corner ticks just outside it, hidden before the region shot is taken. The
  editor still draws the selection in Edit as before.
- **Re-taking screenshots**: `folio comment reshoot <cid> | --all [path]
  [--force]` re-renders the pairs in the current style, through the running
  server or headless. A pair whose slide has changed since it was taken is
  kept and named, so an old pair never silently shows today's slide; `--force`
  re-takes it from today's slide.
- **Screenshots** are rendered on the server through the print page with the
  region and the sketch drawn on it: `shot-slide.png` and `shot-region.png` (at
  2x), in `comments/<cid>/`. A reply on a slide that changed since adds a new
  pair.
- No pins, in any mode *(superseded 2026-10-12: numbered pins were drawn in
  Comment mode only)*. View draws no comment region, mark or draft; Edit
  draws the selected issue and the draft. Opening a comment from the inbox
  (`?comment=`) lands in Edit with that comment selected, its region and
  sketch drawn, and the Cursor tool chosen. ~~Edit drew no region, mark or
  draft; opening a comment, or selecting one in the tab from Edit, switched
  to Comment mode.~~ *Superseded (user, 2026-10-12: "merge comment and edit
  to edit").* In View the tab is read-only (see `spec/chrome/style.md`).
- **Agents** see comments every time they compile: `folio status`, `check` and
  `pdf` print the open-comment table first (id, slide, slots, whose turn, the
  last message, screenshot path, link). `folio comments <deck> [--json]` lists
  them with every message and file path. Open comments are a note
  (`FOLIO-CMT-001`, "awaits a reply"), never a failure; a comment whose slot or
  slide is gone is `FOLIO-CMT-002`, orphaned, not lost.
- **Replies**: `folio comment reply <cid> "text" [--attach F] [--answered]`.
  `--answered` (or `folio comment answered`) moves it to Review.
- **Resolve** (the user only) moves the comment and its folder to
  `comments/.archive/YYYY-MM-DD/`; Reopen brings it back. Nothing is deleted.
- Every browser sees new comments and replies live, from any writer, a CLI
  without a server included.

## Never

- A separate Comment mode: region, pen, rectangle and arrow are tools in
  Edit. *(user, 2026-10-12: "merge comment and edit to edit")*
- One tool that guesses between typing and drawing from where a drag starts
  or how far it travels.
- Comments inside the slide source (open-slide stores base64 markers in JSX).
- A worker resolving a comment.
- Red pins: danger red is for warnings only; pins are ink.
- The hint "No region yet: drag on the slide, or click a slot." in the
  composer; a resize grip, the word "Attach" or "or paste, or drop files"
  there; a composer with its own textarea instead of the shared input bar.
- Comment pins drawn on the slide in Edit or View mode. *(user, 2026-10-12)*
- Numbered pins on the slide, in any mode. *(user, 2026-10-12)*
- Per-issue header rows in the Comments tab: a number circle, a truncated
  first message, a status ("waiting on agent", "your turn") or a follow bell.
  *(user, 2026-10-12)*
- Collapsed one-line rows that expand into the chat; a selected issue
  indented differently from the others. *(user, 2026-10-12: "this is weird")*
- Drawing every issue's region at once; any issue's region or marks other
  than the selected one's. *(user, 2026-10-12)*
- A second ordering of comments for the tab: it reuses the board's
  (`viewOf`, `boardOrder`, through `executionOrder`).
- In the Comments tab, "remove them" *(user, 2026-10-12)*: the hint line "Draw
  a region on the slide to comment", the divider under it, the section label
  "This slide", and the "Show resolved" toggle. Also an "Other slides" section
  (dropped with them: the tab is one plain list for the current slide).
- The new-comment composer only in the side panel, far from the region it is
  about; and two composers for one draft.
- The selection border in a screenshot: the dashed region rectangle, its
  outline or its tint in `shot-region.png` or `shot-slide.png`.
  *(user, 2026-10-12)*
- A glass shell around the sketch toolbar; the toolbar centred on the window
  instead of the deck display area. *(user, 2026-10-12)*
- A card, head line ("Region over note, fig:a") or close button around the
  new-comment input; a pointer tail toward the region. *(user, 2026-10-12)*
- Losing typed text or attachments on a click away: a draft that holds either
  is sent, never discarded. *(user, 2026-10-12)*
- The `--glass-lift` shadow on a docked bar (the Comments tab, a thread's
  reply, the inbox panel); the on-slide bubble without it. *(user, 2026-10-13)*
- A native browser image/link drag starting from a press on the slide, in any
  comment tool, at any zoom, or in a rail thumbnail. *(user, 2026-10-14)*

## Where it lives

`packages/core/src/comments.ts`, `packages/core/src/inbox.ts`
(`executionOrder`), `packages/server/src/comments/`
(`service.ts`, `store.ts`, `shots.ts`, `routes.ts`),
`packages/web/src/comments/` (`Sketch.tsx`, `marks.tsx`, `CommentToolbar.tsx`,
`CommentBubble.tsx`, `bubblePlace.ts`, `CommentsTab.tsx`, `useComments.ts`,
`Composer.tsx`), `packages/web/src/ui/InputBar.tsx` (the `floating` prop),
`packages/web/src/slide/SlideView.tsx` (the drag guard every renderer shares),
`packages/web/src/print/PrintView.tsx` (the screenshot overlay),
`packages/cli/src/commentcmds.ts`, `reshootcmd.ts`,
`services.ts` (the table).

## Checks

`e2e/comments.mjs`: Edit and the Cursor tool are the defaults; R outside a
text slot picks Region; Esc on a draft returns to Cursor; with the Cursor
tool a drag draws no region and opens no bubble; an old `?mode=comment` address on the phone opens in Edit; the
bubble opens within 200 ms of the mouseup, beside the
region and not over it, on screen at 1440x900 and 390x844, with its text field
focused; it is the bare input bar (no card, head line, close button or
pointer); its bar carries a non-`none` computed `box-shadow` (floating), while
a thread's docked reply bar carries `none`; a click on the sketch toolbar keeps it; Esc discards it; a click away
with an empty bar discards it and its region; a click away with text sends it;
Send closes it; a region over the note and the figure lists both slots;
both screenshots exist; the arrow and the attachment are kept; `folio status`
prints the comment first; a worker's reply appears live; the selected issue
is its first bubble with no bell or status and its Send inside the card; no
pin is drawn; the selected issue's region shows and clearing the selection
removes it; Edit with the Cursor tool draws the selected region and no pin;
View draws no region and no slot outline and lists the issue without an
input bar or Resolve; Resolve archives it.
`e2e/comment-toolbar.mjs`: `?mode=comment` opens in Edit with two mode
segments; at 1440x900 with the rail and panel each open and
shut, the toolbar's centre is the centre between the rail and the panel, and
no painted or bordered element wraps the button group; at 390x844 it is
centred on the screen and above the sheet.
`packages/core/test/pure.test.ts`: execution order (queue by rank, then
In progress, Review, Held, Done).
`e2e/region-click.mjs`: with Region chosen, a press-and-drag of 30 px over a
figure fires no `dragstart` on the page and draws a region box; a single
click on a figure sets the region to that figure slot's own box and opens the
bubble; both hold at 50% zoom in the column view.
`e2e/comment-tools.mjs`: the sketch tools do not open the composer; Region
does; the eraser removes only touched draft marks; switching slides (PageDown
/ PageUp) shows none of the slide left behind's marks, a mark drawn on the
new slide shows at once, and switching back restores the first slide's own
marks unchanged by the one drawn elsewhere.
