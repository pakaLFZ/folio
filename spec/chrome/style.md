# Chrome: the editor's look

## Demand

- Of the editor's top controls: the rail and panel buttons, Edit/View switch,
  and right-hand icon buttons need one horizontal icon centre line, equal
  insets from the pane edges, and the same compact gray wells and selected
  white buttons as the bottom toolbar and panel tabs. The wells use 6 px
  corners; the panels retain their 12 px corners. Other icon buttons in the
  editor follow the same icon sizing and centring rule. *(user, 2026-10-12/13;
  latest screenshot supersedes the earlier pane-radius request for buttons)*
- The rail toggle sits directly on its panel with no gray well or selected
  fill around it. *(user, 2026-10-13)*
- Blue circle on the panel toggle (the `PanelRight` icon at the far right of
  the top-right icon group, inside the same gray well as Export PDF, Inbox
  and Theme): "move the right panel open close button out of the button
  gorup" *(user, 2026-10-13)*. The well keeps Export PDF, Inbox and Theme
  only; the toggle stands on its own to the right of it, `--gutter` away,
  with no gray well or selected fill of its own, the mirror of the rail
  toggle: same icon size, same top-row centre line, and the same inset from
  the pane's right edge as the rail toggle has from the left. The toggle does
  not move when the panel opens or closes.
- The bottom sketch toolbar's icon buttons, including its selected cursor,
  use the same square button size as the panel header icons. *(user,
  2026-10-13)*
- The PDF export control uses Lucide `Download`. ~~Lucide `FileText`. *(user,
  2026-10-12)*~~ *Superseded (user, 2026-10-13: "change the doc icon to
  download icon from lucid")*; see `spec/slides/pdf.md` for the button's
  download behaviour.
- ~~The rail's insertion line marks the actual gap between thumbnails and
  follows it while the list scrolls. *(user, 2026-10-12)*~~ *Superseded:*
  "add animation and get rid of the insertion horizontal line, so that
  animation is like top and bottom moves to creat espace for the slide"
  *(user, 2026-10-13)*: while dragging in the rail the neighbours slide
  apart by `transform`, 180 ms on `--ease`, none under
  `prefers-reduced-motion`, to open a gap the size of the dragged slides
  (spec/slides/editing.md).
- Install impeccable and import cavitas's style: the editor chrome (panels,
  toolbar, comment threads) follows cavitas's design; the slide content
  follows the deck pack, not cavitas. *(user, 2026-10-12)*
- Load the impeccable skill before any UI work; use the theme in
  `theme/cavitas`. *(user, 2026-10-12)*
- "remove red bit": the red overflow counters and the comment pins drawn on
  the slide in Edit mode are gone. *(user, 2026-10-12)*
- Of the top-left corner (the toggles, the mode pill and the rail of slide
  thumbnails): "the spacing and mergins feels werid". *(user, 2026-10-12)*
  One spacing system, taken from cavitas: one screen gutter, one panel
  padding, one thumbnail rhythm, thumbnails centred in the rail.
- Shadcn UI for interface chrome; mobile first, at least 200 px wide; no
  emoji anywhere (the user is on Windows). *(user, standing rules)*
- "remove (red), move = blue. in cavitas, the left and right panel button is
  within the panel and they do not move (size or position) when panel opens or
  closed. u break this. fix." Red marked the page counter (previous, "1 / 2",
  next); blue marked the Edit / Comment / View pill, moved out of the rail's
  column to the top of the canvas beside the rail. *(user, 2026-10-12)*
- "get rid of tooltip for left and right panel open and close button"
  *(user, 2026-10-13)*: the rail toggle and the panel toggle carry no `Tip`
  tooltip; each keeps its `aria-label` ("Toggle slides", "Toggle panel") for
  accessibility. Every other corner button (Home, Copy deck id, Export PDF,
  Inbox, Theme) keeps its tooltip.
- Screenshot, red circle on the right panel's open/close toggle at the top
  right of the open right pane: "I see shadow effect for this button, remove
  the shadow effect" *(user, 2026-10-13)*. The panel toggle carries no
  box-shadow in either state (open: `corner-fill bg-raised`, shut: `glass`,
  both with `shadow-none`). The left rail toggle gets the same `shadow-none`
  for consistency: it is the mirror of the panel toggle and shared the same
  `glass` shadow when shut, even though the user's screenshot only circled
  the right one. Every other corner button (Home, Copy deck id, Export PDF,
  Inbox, Theme) keeps its glass shadow.
- "if the panel is closed, they are align left just next to panel open button.
  when left panel is opened, they stay to the right of the left panel" (the
  mode pill). *(user, 2026-10-12)*
- "edit so that default the panel is opened for one slide only. we dont do
  multi slide management for now" *(user, 2026-10-12)*
- "make the whole page default theme light background (almost white). add
  theme option." *(user, 2026-10-12)* This overrides the earlier grey canvas:
  every page (editor, inbox board, landing) sits on an almost-white page by
  default, and a theme control offers Light, Dark and System.
- ~~"hide every deck by default" *(user, 2026-10-12)*: the editor's corner
  holds only the rail toggle; the Every deck link comes back only when the
  workspace asks for it.~~ *Superseded (user, 2026-10-13, a blue circle just
  right of the rail toggle: "add a home button here to view all deck"): a
  Home button (lucide `House`, tooltip and aria-label "All decks") always
  stands right of the rail toggle and opens the deck list; the config-gated
  Every deck link is gone, so the corner has one control for it, not two.*
- "add a copy button next to the home button so that that button allows user
  to copy deck id" *(user, 2026-10-13)*: a Copy button (lucide `Copy`,
  tooltip and aria-label "Copy deck id") stands right of the Home button,
  same size and material. It copies the deck's folder path relative to the
  workspace root (e.g. `decks/example`), the argument `openDeck` in
  `packages/cli/src/deckcmds.ts` accepts from the workspace root for every
  `folio` CLI command — not the deck's token, which no CLI command takes.
  The server now writes it into the deck boot as `deck.dir`. On click the
  icon turns into a check for 1.2 s and the notice reads "Copied
  decks/example".
- Of the space between the open rail and the Edit / Comment / View pill:
  "this mergin is weird" *(user, 2026-10-12)*. It was the 5 px toggle gap
  while every pane stands one gutter from the window.
- "reduce border radius" *(user, 2026-10-12)*: the chrome moves from 24 px
  panes and fully round pills to one tighter, calmer scale of five radius
  tokens.
- Of the rail's top edge, the Edit / Comment / View pill and the right
  panel's top edge, boxed in red across the top band: "they should be aligned
  top (the middle view mode thing)" *(user, 2026-10-12)*. The pill stood on
  the toggle row inside the panes' headers, its top 8 px (one hairline and
  the header padding) below the panes' tops.
- Of the deck title and the "0 err 0 warn 1 note" line in the panel header,
  struck in red: "remove them" *(user, 2026-10-12)*. The header keeps only its
  buttons; the counts no longer reach the user through a tab (the Warnings
  tab itself is gone, see `spec/warnings/warning-model.md`).
- "in view dont show selection and comments or notation" *(user,
  2026-10-12)*, of a View-mode screenshot that still showed a comment's dashed
  region, the red overflow outlines, faint slot boundaries and the Comments
  tab with its composer.
- Of that pill, now a 52 px glass pane with the segmented well sunk inside
  it, circled whole: "can u remove the outer shell and let it align top
  directly" *(user, 2026-10-12)*. The shell goes; the segmented control alone
  stands at the panes' top edge.
- Of the Edit / Comment / View switch, circled: "merge comment and edit to
  edit" *(user, 2026-10-12)*. Two modes remain, Edit and View; Edit does
  everything Comment did as well as text editing.
- "change view's icon to eye" *(user, 2026-10-12)*.
- "left and right panel drag to change width pls" *(user, 2026-10-12)*: the
  rail and the panel are each resized by dragging their inner edge.
- Of the space between each pane's header buttons and its first content
  (about 60 px in the rail, 47 px in the panel at 1900 px wide): "verticle
  margin too large" *(user, 2026-10-12)*.
- Of the rail toggle's icon and the thumbnails below it, whose left edges
  stood 5 px apart: "slide preview card and icon edge should align"
  *(user, 2026-10-12)*.
- Of the top of the left rail (the slides toggle button, its "Hide slides"
  tooltip and the first thumbnail), circled: "this bit seems to be a bit
  crowd pls improve" *(user, 2026-10-12)*.
- Of the rail toggle's icon (Rows3), circled: "use left panel icon, just like
  right panel uses right panel icon" *(user, 2026-10-12)*: the rail toggle
  takes lucide `PanelLeft`, the mirror of the panel toggle's `PanelRight`.
- "add an export button ... add this button next to the circled position"
  *(user, 2026-10-12)*, circled on the empty spot left of the inbox icon in
  the panel header. See `spec/slides/pdf.md`.
- "make the toast displayed on top rather than bottom as bottom is where
  tools lives" *(user, 2026-10-12)*, of the export notice; it holds for every
  notice.
- "ok this is poor alignement as button shifts" *(user, 2026-10-12)*, of a
  screenshot with the panes closed: the rail toggle pill, the mode switch and
  the panel toggle pill stood at three different tops and heights instead of
  one row.
- "pls align icons" *(user, 2026-10-12)*: every top-row control (the rail
  toggle, the mode switch, the panel toggle, and the panel header's inbox and
  theme buttons) shares one top, one height, and one icon centre line.
- "wait, I see they already aligned. just remove this background and then I
  think its nice" *(user, 2026-10-12)*, of the Edit/View mode switch: the
  glass well, sunken fill, border and padding around the two segments are
  gone; the selected segment keeps its raised pill, the unselected one is
  plain text and icon; the segments still fill the top row's height and
  top, so the icon centres stay on the row's line.
- "this hover shadow touches top, consider make the button in fig 2 slightly
  larger so that the icon aligns while hover shadow dont touch edge?"
  *(user, 2026-10-12)*: every corner button's hover and press background sits
  inside its pane, inset from the pane's top and side edges by
  `--panel-header-pad` (6-7 px); it never touches a pane edge. The mode
  switch's segments fill the row from the panes' top to the header row's
  bottom, its icons on the same centre line as the toggles', with no
  background behind it.
- "also u see that the margin is not balanced", circled the space above and
  below the rail's and the panel's header icons *(user, 2026-10-12)*: inside
  each pane, the space from the pane's top to the header row equals the space
  from the row to the first content below it (the rail's first thumbnail, the
  panel's first content: on the Slide tab the Template bank header row,
  2026-10-13, earlier the first layout card), both the one
  `--panel-header-pad` token that insets the hover boxes. The rail's first
  thumbnail and the panel's first content start at the same y.
- "make zoom indicator auto hide (with fade animation) and move it next to
  the top view mode button group, and then make the tool row align with the
  tab row to the right" *(user, 2026-10-12)*: the zoom percentage chip moved
  from the scene's bottom-left to the top row, one gutter right of the mode
  switch, on its centre line (spec/chrome/zoom.md). The sketch toolbar's
  centre line now matches the panel's tab bar at the panel's foot.

## Behaviour

- The slide is the scene: an almost-white page (`#fafafa` in Light) with the
  slide drawn as a sheet on it, a hairline edge and the faintest lift, as large
  as the space between the rail and the panel allows. The sheet keeps its
  pack's colours in every theme: `.folio-slide` sets its own ink and the
  light danger red, so nothing inherited from the chrome reaches it. Floating
  glass carries the chrome: the rail of live thumbnails on the left, the panel
  (328 px, 12 px inset, 12 px radius, tabs at the foot) on the right, the
  control row at the top, the comment toolbar at the foot.
- Each pane's toggle stands inside the pane, in its header row, as in
  cavitas: the rail's header holds the rail toggle alone, one corner button;
  the panel's header holds, right-aligned, the PDF export button, the inbox
  and the theme switch in one gray well, and nothing else (the export button
  `--corner-gap` left of the inbox, its size and hover; *user, 2026-10-12*):
  no deck title, no totals line and no live dot. The panel toggle stands
  outside that well, `--gutter` to its right, with no gray well or selected
  fill of its own: the mirror of the rail toggle, which sits directly on its
  pane with no well *(user, 2026-10-13: "move the right panel open close
  button out of the button gorup")*. The header row is one `--corner-btn` less one `--glass-edge-w`
  (the pane's own hairline, counted once since the toggle floats above it,
  outside the border): it ends at the toggles' bottom edge, so the toggle's
  corner is unchanged. The panel header no longer carries an error and
  warning total (the Warnings tab is gone; warnings read on the slide, the
  rail's dot, and `folio check`). Right of the rail toggle, always shown, stand a Home button (a
  link to the landing page, lucide `House`, tooltip and aria-label "All
  decks") and, right of that, a Copy button (lucide `Copy`, tooltip and
  aria-label "Copy deck id"). Both share the toggle's `size="corner"` and
  its glass-or-filled material, in the same `corner-row` as the toggle, so
  the three read as one strip *(user, 2026-10-13)*. The landing page at `/`
  still works when visited directly, and the inbox board's own Every deck
  button is a separate control, always shown. Copy puts the deck's folder
  path relative to the workspace root (`window.__FOLIO__.deck.dir`, e.g.
  `decks/example`) on the clipboard — `navigator.clipboard.writeText` where
  it exists, else a hidden textarea and `execCommand("copy")` for non-secure
  http — turns its icon into a check for 1.2 s, and names the path copied in
  the notice. The server computes `deck.dir` as the deck's folder relative to
  `WorkspaceConfig.root`, the same form `openDeck` in
  `packages/cli/src/deckcmds.ts` accepts from the workspace root. The toggles are
  one fixed element each, laid over the pane's header at a fixed corner: left
  or right at `--corner-x` (the inset, the pane's hairline and the header
  padding), top at `--panel-inset` ~~`--corner-x`~~ *Superseded (user,
  2026-10-12: "ok this is poor alignement as button shifts"): a closed
  toggle's top used to be `--corner-x` (20 px), 8 px below the mode switch's
  `--panel-inset` (12 px); both toggles now share the switch's top and its
  36 px height (`--corner-btn`), so with both panes closed the two pills and
  the switch read as one row.* A
  closed pane moves off-screen by transform and is hidden, kept mounted;
  only the toggle stays, at the same spot and size, as a small glass button
  (6 px corners); only its corner shape is set by the radius scale.
  Opening or closing either pane moves and resizes no toggle, at any width.
  The rail toggle's icon is lucide `PanelLeft`, the mirror of the panel
  toggle's `PanelRight` *(user, 2026-10-12: "use left panel icon, just like
  right panel uses right panel icon")*: ~~`Rows3`~~ *Superseded (user,
  2026-10-12).* Each toggle's tooltip opens off the pane it sits over, never
  across it: the rail toggle's ("Show slides"/"Hide slides") opens to the
  right, into the scene, so it never covers a thumbnail; the panel toggle's
  ("Show panel"/"Hide panel") opens to the left, into the scene, for the same
  reason on the right. The panel header's other tooltips (the inbox, the
  theme switch) open downward, the default side, since nothing but the panel
  itself sits below them. *(user, 2026-10-12: "this bit seems to be a bit
  crowd pls improve", of the rail toggle covering the first thumbnail.)*
- The mode pill stands at the top, one gutter (`--gutter`, 12 px) to the
  right of whatever stands left of it: the rail toggle's pill (now the rail
  toggle, Home and Copy together) while the rail is closed, the rail while it
  is open. One rule, the same distance as between every pane and the window.
  `--corner-gap` is only the gap between buttons inside one pill. The mode switch is the segmented control alone,
  with no shell around it: it takes the glass material itself, with its own
  `--radius-control`, padded to one `--corner-btn` tall (36 px, `p-1` on the
  well) so it stands the same height as the corner toggles, not its own
  natural height *(user, 2026-10-12: "ok this is poor alignement as button
  shifts")*. Its top edge is the
  panes' top edge (`--panel-inset`), with the rail open and with it closed.
  The toggles do not move for it. *(user, 2026-10-12)* ~~It is a small glass
  pane exactly one header row tall (`--header-row`), the segmented well
  sitting inside it at the header padding.~~ *Superseded (user, 2026-10-12):
  "can u remove the outer shell and let it align top directly".*
- **Two modes: Edit and View** *(user, 2026-10-12: "merge comment and edit
  to edit")*. The mode switch has two segments: Edit (pencil) and View (eye,
  *user, 2026-10-12: "change view's icon to eye"*). Edit is the default. It
  types into text slots and carries everything Comment mode did: the sketch
  toolbar (its Cursor tool, chosen on entering Edit, selects and edits text:
  "since we merge edit and comment, thus default in edit mode there is a
  cursor tool, so that we can select text and edit" *(user, 2026-10-12)*),
  the selected issue's region and marks, the new-comment bubble and the live
  Comments tab (see
  `spec/comments/region-comments.md` for how one press is told apart from
  another). View draws the clean slide and the read-only tab, as below. An
  address or stored state naming `mode=comment` opens in Edit; any value but
  `view` is Edit. ~~Three segments, Edit, Comment and View; View drawn as a
  pointer arrow.~~ *Superseded (user, 2026-10-12).*
- One slide in focus: the editor opens with the rail closed, so the page
  shows the current slide with the panel open beside it. The rail's toggle
  still opens it; an explicit open or close is remembered per browser
  (`localStorage` `folio.rail`), and with nothing stored the rail is closed.
- There is no page counter: slides change by the rail's thumbnails and by the
  keyboard (PageUp/PageDown always, arrows outside a text slot).
- Spacing is three tokens in `styles.css`, all from cavitas: `--gutter`
  (12 px, cavitas's `--panel-inset`) is the distance from the window to every
  floating pane on the left, the right and the top; `--panel-pad` (12 px,
  cavitas's panel body `px-3`) is the inner padding of both glass panels, the
  rail and the right panel, with the scrollbar's gutter counted inside it;
  `--thumb-pad` (half the panel padding) is the selected highlight's own
  padding on all four sides, not the gap under the header. ~~The rail and the panel start at `--chrome-top`: one
  gutter below the control row.~~ *Superseded (user, 2026-10-12): there is no
  control row above the panes, and the mode pill is not set on the toggle
  row; the rail, the panel and the mode pill all start at `--panel-inset`.*
- **First content under the header** *(user, 2026-10-12: "verticle margin
  too large")*: ~~in both panes the first content starts one `--thumb-pad`
  below the header row, which ends at the header buttons' bottom edge. In the
  rail that is the first thumbnail's card, its selected highlight touching
  the toggle row; in the panel it is the first section's title (the tab
  body's top is pulled up by `--section-pad`, the 8 px every section and
  list opens with). At 1440 px both stand at y = 62, where the rail card was
  at 81 and the panel title at 68. (Chosen 2026-10-12: the brief said one
  `--panel-pad` below a 50 px header row, which would have put both at 75 and
  moved the panel's content down 7 px against the user's words; `--thumb-pad`
  under the buttons is the tightest rhythm in which no content runs under a
  toggle's hit area.)~~ *Superseded (user, 2026-10-12): "this bit seems to be
  a bit crowd pls improve" of the rail toggle, its tooltip and the first
  thumbnail — `--thumb-pad` left the selected highlight touching the toggle
  row and let the "Hide slides" tooltip, which opens downward, cover the
  thumbnail under it.* In both panes the first content now starts one
  `--panel-pad` below the header row, which still ends at the header
  buttons' bottom edge: in the rail, `.rail-list`'s own top padding
  (`--panel-pad`) before the first thumbnail's button, whose own padding is
  `--thumb-pad` and no longer part of the gap; in the panel, `.panel-body`'s
  `margin-top` is `calc(var(--panel-pad) - var(--section-pad))`, so the tab body's
  `--section-pad` top padding (or a `py-2` wrapper of the same height) still
  lands its content `--panel-pad` down. The two panes match because both read
  the same token.
- **Thumbnail edge on the glyph's edge** *(user, 2026-10-12: "slide preview
  card and icon edge should align")*: the thumbnail's visible left edge (its
  1 px hairline, `--thumb-hairline`) stands on the rail toggle glyph's visible
  left edge, the icon's ink: the pane's hairline, the header padding, the
  button's centring of its `--corner-icon` (16 px), and the 2/24 of the icon
  the Lucide stroke stands inside its box (`--corner-icon-ink`). That is
  `--corner-glyph-x`; `--thumb-inset` is it plus the hairline, rounded to a
  whole pixel (20 px) so the card's hairline stays crisp. The right inset
  equals the left, so each thumbnail is the rail's width less two
  `--thumb-inset` (156 px at the initial 196 px), read from the token at run
  time. *(Chosen: the glyph's ink rather than the icon's box, because the
  ink and the hairline are what the eye compares; they now differ by a third
  of a pixel.)* The panel has no button on its left, so its content keeps
  `--panel-pad` inside its edge.
- Each rail thumbnail is centred in the rail, its left inset equal to its
  right; its number is a small mono label inside the card's lower-left
  corner, so no number column pushes it off centre. Consecutive thumbnails are
  one panel padding apart (twice the highlight padding). ~~The first sits as
  far from the rail's top as from its sides.~~ *Superseded (user,
  2026-10-12): "verticle margin too large"; ~~the first content stands one
  `--thumb-pad` under the header row~~* *superseded again (user, 2026-10-12:
  "this bit seems to be a bit crowd pls improve"): the first content stands
  one `--panel-pad` under the header row.*
- Achromatic: ink, greys and hairlines of translucent ink; corners from the
  radius scale below; mono tabular figures for every number and id; nothing in the
  chrome above 13 px. The one filled button is the action that sends or leaves
  a file.
- Danger red is spent on warnings about the slide (an overflowing slot, a
  failed hook); comment pins and the user's chat bubbles are ink. Severity
  colours (red, amber, blue per `WARNINGS.md`) show in `folio check` output
  and no longer in the browser, since the Warnings tab that once carried them
  is gone.
- Text contrast is at least 4.5:1 on every surface, in both themes (computed
  with frosted panes composited over the page; lowest pair listed per theme).
- Every chrome colour is a custom property in `packages/web/src/styles.css`;
  Light is the default set and `:root[data-theme="dark"]` redefines it. No
  component writes a hex or rgb colour of its own, except the comment marks,
  which are drawn on the slide and follow it.

- Chrome drawn inside the slide (a figure's state) keeps 11 px on screen at
  any zoom. An overflowing slot shows only its thin danger outline.
- **View mode shows the slide as the PDF does.** Nothing is drawn over it: no
  comment region, sketch mark or draft, no slot outline, no overflow outline,
  no selected-slot highlight, no figure state badge or empty-figure
  placeholder. The rail's warning dot stays (there is no Warnings tab any
  more). The Comments
  tab stays readable but read-only: an issue can be selected to read its
  chat, with no input bar and no Resolve, and selecting it stays in View and
  draws nothing on the slide *(chosen 2026-10-12: View promises to look
  without changing anything, so the list keeps reading and loses writing)*.
- Below 900 px the panel also closes by default and open as sheets (the
  rail down the left edge, the panel from the bottom); the toggles keep their
  corners, and the board scrolls column by column on a phone.

### The notice (toast)

"make the toast displayed on top rather than bottom as bottom is where tools
lives" *(user, 2026-10-12)*.

- Every editor notice (saved, refused, exporting, failed) is one glass card
  (`--radius-menu`, 13 px) centred between the open panes (`--scene-left`,
  `--scene-right`), its top one `--gutter` below the top row
  (`--panel-inset` + `--corner-btn`), so it never covers the mode switch, the
  zoom chip or a pane's header. It is `role="status"`, `aria-live="polite"`.
- It slides 8 px down and fades in over 200 ms on `--ease`; with
  `prefers-reduced-motion` it simply appears. Only the latest notice shows;
  a busy one stays until replaced, the rest leave after their time.
- ~~A pill at the foot of the window, `bottom-4`, centred on the whole
  window.~~ *Superseded (user, 2026-10-12): the foot is where the tools live.*

### Resizing the panes

"left and right panel drag to change width pls" *(user, 2026-10-12)*.

- **The grip.** Each open pane has one grip on its inner edge: the rail's
  right edge, the panel's left edge. It is an 8 px band straddling the edge
  (4 px inside, 4 px outside), running from the end of the top corner's curve
  to the start of the bottom one. At rest it draws nothing; under the pointer
  or while held it draws the edge as a 2 px line of `line-strong`, and with
  keyboard focus as a line of `ink`. The cursor is `col-resize` over the grip
  and, during a drag, over the whole page, where text selection is off.
- **Live.** Dragging resizes the pane as the pointer moves, one update per
  animation frame (pointer moves are coalesced with `requestAnimationFrame`),
  and the slide refits between the panes on the same frame. *(Chosen
  2026-10-12: the slide is scaled as one piece, never re-laid-out, so a live
  refit costs one transform; a ghost line with a refit on release would make
  the user judge the result from a preview.)* The rail's thumbnails follow
  the rail: each is the rail's width less two `--thumb-inset` (156 px at
  the initial 196 px), so their insets and rhythm do not change. The comment toolbar's
  centre (`--scene-left`, `--scene-right`) follows the same widths.
- **Limits.** The rail is 140 to 400 px wide (initially 196); the panel 280
  to 560 px (initially 328). Neither may leave the scene less than 320 px
  between the open panes; a shut pane takes no room. When the window narrows,
  the stored widths are fitted without being overwritten: the rail gives way
  first, then the panel, never below their minimums.
- **Reset and keyboard.** A double click on a grip returns the pane to its
  initial width. The grip is focusable (`role="separator"`,
  `aria-orientation="vertical"`, `aria-valuenow`, `aria-valuemin`,
  `aria-valuemax`, labelled "Resize slides" or "Resize panel"); Left and
  Right move the edge by 16 px, and do not change the slide.
- **Memory.** The widths are kept per browser in `localStorage`
  (`folio.rail-w`, `folio.panel-w`), read and written inside try/catch; with
  nothing stored, or storage blocked, the panes open at their initial widths.
- **What does not move.** The toggles stay at their fixed corners, the same
  place and size at every width: a resize moves only the pane's far edge.
  The mode switch keeps its rule, one gutter right of the open rail (or of
  the rail toggle when the rail is shut), so it follows the rail's live width.
- **Below 900 px** the panes are sheets at their initial widths; there are
  no grips and nothing resizes.

### Corner radius

One scale, five tokens in `@theme` in `styles.css` (Tailwind's own radius
scale is reset, so `rounded-md` and the like no longer exist and a
hard-coded `rounded-[..px]` is not used). The same in both themes.

| Token | Value | Use |
|-------|-------|-----|
| `--radius-pane` | 12 px | the rail and the panel, the board's chat panel, the board's columns, the docked comment sheet's top |
| `--radius-menu` | 10 px | menus and popovers (deck select, board settings, theme), chat bubbles, the notice |
| `--radius-card` | 6 px | cards and rows: board cards, layout cards, rail thumbnails' highlight, warning and comment rows, tooltips, the landing list |
| `--radius-control` | 6 px | every control: buttons (Duplicate, Archive, the pane toggles), inputs, the input bar, selects, menu rows, the wells of tabs and segmented controls (the mode switch, the swatch picker), floating button bars |
| `--radius-chip` | 4 px | small chips: the items inside a well, badges and counts, attachment chips, tags, the thumbnail number, the focus ring, the figure badge on the slide |

The pills are gone: the mode switch, buttons, the input bar and segmented
controls take the same 6 px as every control, so the chrome speaks one shape.
A segment inside a well takes the chip radius, the well's radius less its
2 px padding, so the corners nest. Only true circles stay round: status and
unread dots, the comment-pin number (it matches the pin on the slide), colour
swatch dots, the switch track and thumb, and the scrollbar thumb. The slide's
sheet has square corners.

### Theme tokens

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `canvas` | `#fafafa` | `#181818` (cavitas dark scene) | the page behind everything |
| `surface` | `#ffffff` | `#232325` | cards, the deck list, tooltips |
| `raised` | `#ffffff` | `#2e2e31` | inputs, the active segment in a well |
| `ash` | `#f0f0f0` | `#333336` | a selected row |
| `sunken` | `#f0f0f0` | `#111113` | the well of tabs and segmented controls |
| `column` | ink 3.5 % | white 4 % | the board's columns |
| `whisper` | ink 4 % | white 6 % | hover |
| `line` / `line-soft` / `line-strong` | ink 12 / 7 / 24 % | white 14 / 8 / 28 % | hairlines |
| `panel-fill` (glass) | white 72 % | `#242426` 78 % | the frosted panes |
| `ink` | `#000000` | `#f2f2f2` | text, pins, the solid button |
| `on-ink` | `#ffffff` | `#111111` | text on an ink fill |
| `ink-muted` | `#4d4d4d` | `#bdbdbd` | secondary text |
| `ink-faint` | `#616161` | `#a1a1a1` | tertiary text, counts |
| `danger` / `caution` / `info` | `#a12b26` / `#8a5a00` / `#2a5d8f` | `#ff8a80` / `#e6b14e` / `#8ab8e6` | warnings |
| `paper` | `#ffffff` | `#ffffff` | the sheet under a slide still loading |

Lowest text contrast: Light, faint on `ash` 5.43:1; Dark, faint on `ash`
4.87:1. Page luminance: Light 0.956, Dark 0.009.

### The theme control

- An icon button (sun, moon or monitor for the current choice) opens a menu
  with Light, Dark and System. It stands in the editor panel's header beside
  the inbox icon, in the inbox board's top bar and in the landing header.
- The choice is kept in `localStorage` under `folio-theme` (read and written
  inside try/catch); with nothing stored, or storage blocked, it is Light.
  System follows `prefers-color-scheme` and changes with it while the page is
  open.
- The resolved theme is `data-theme` on `<html>`, set by an inline script in
  `index.html` before the first paint, so a dark page never flashes white.
- The print page (`?print`, `folio pdf`) is never themed: the script leaves it
  without `data-theme`, and it prints on white.

## Never

- Slide content styled by chrome tokens.
- A grey page by default (the old `#ebebea` canvas): the user asked for an
  almost-white page *(user, 2026-10-12)*. The slide's edge is kept by a
  hairline and the faintest lift, never by greying the page.
- A slide edge carried by a heavy shadow or a coloured frame.
- Theming the slide: slide content, its background and the comment marks on it
  are the same in Light and Dark.
- A theme applied after first paint (a flash of the wrong page), or a print
  page that takes the dark set.
- A shadow inside a pane; a second filled surface inside a filled surface.
- An overflow badge drawn on the slide. *(user, 2026-10-12)*
- A Warnings tab in the panel, struck in red on a screenshot of its tab bar:
  "get rid of this tab" *(user, 2026-10-13)*. Warnings stay visible on the
  slide (the overflow outline and `data-overflow`), on the rail (the red
  dot), and through `folio check`/`folio ack`; see
  `spec/warnings/warning-model.md`.
- A separate Comment mode: commenting is part of Edit. *(user, 2026-10-12:
  "merge comment and edit to edit")*
- Anything but the slide drawn in View mode: comment regions, marks, drafts,
  slot outlines, overflow outlines, a selected-slot highlight, figure badges.
  *(user, 2026-10-12)*
- A screen gutter that differs between the left, the right and the top; a
  pane's padding different from the other pane's; a number column beside the
  thumbnail that the right side does not balance; a highlight wider on one
  side than the other; thumbnails that touch while the rail's top inset is
  large.
- An empty band under a pane's header buttons other than `--panel-pad`, or
  a different one in the rail and the panel. *(user, 2026-10-12)*
- A toggle's tooltip opening over the pane's own content instead of out into
  the scene. *(user, 2026-10-12)*
- With both panes closed, the rail toggle pill, the mode switch and the panel
  toggle pill at different tops or heights. *(user, 2026-10-12: "ok this is
  poor alignement as button shifts")*
- A thumbnail edge off the rail toggle glyph's edge, or a thumbnail width
  written as a number instead of following `--thumb-inset`.
  *(user, 2026-10-12)*
- `OpenAI Sans` bundled: it is listed first and falls back to system fonts.
- A page counter (previous, "n / m", next) in the chrome.
- The rail open by default: the editor is for one slide at a time until the
  user asks for multi-slide management.
- A fully round pill on a control, a 24 px pane, or a radius written as a
  number in a component instead of a token. *(user, 2026-10-12)*
- Toggles floating outside their panes, or a toggle that moves or changes size
  when its pane opens or closes.
- The panel toggle inside the icon well with Export PDF, Inbox and Theme.
  *(user, 2026-10-13: "move the right panel open close button out of the
  button gorup")*
- ~~Every deck in the editor's corner by default.~~ *Superseded (user,
  2026-10-13): the Home button is the way to the deck list, and it is always
  shown.*
- A Home or Copy button that differs in size or material from the rail
  toggle, or that is not right of it in that order. *(user, 2026-10-13)*
- A gap between the mode pill and the rail (or its toggle) other than the
  gutter. *(user, 2026-10-12)*
- A mode pill whose top edge is not the panes' top edge, or set on the
  toggle row inside the panes' headers. *(user, 2026-10-12)*
- The deck title and the err/warn/note line in the panel header.
  *(user, 2026-10-12)*
- A glass shell around the mode switch. *(user, 2026-10-12)*
- A well or glass background behind the mode switch. *(user, 2026-10-12)*
- A corner button's hover or press background touching the pane's edge, or
  unbalanced space above and below the header row. *(user, 2026-10-12)*
- A notice at the foot of the window, where the comment toolbar and the
  tools live, or one that covers the top row. *(user, 2026-10-12)*
- A line drawn in the rail to mark where dragged slides land (the 2 px ink
  insertion line with end caps): the neighbours open a gap instead.
  *(user, 2026-10-13)*
- A visible grip, bar or dots on a pane's edge at rest; a toggle that moves
  or resizes when a pane is resized; a scene narrower than 320 px between
  open panes; resizing below 900 px.
- A `Tip` tooltip on the rail toggle or the panel toggle. *(user, 2026-10-13:
  "get rid of tooltip for left and right panel open and close button")* Each
  keeps its `aria-label` instead.
- A box-shadow on the rail toggle or the panel toggle, open or shut. *(user,
  2026-10-13: "I see shadow effect for this button, remove the shadow
  effect")* Every other corner button keeps its glass shadow.

## Where it lives

`packages/web/src/styles.css`, `packages/web/src/ui/`, `packages/web/PRODUCT.md`,
the pane grips in `packages/web/src/editor/ResizeHandle.tsx` and their widths in
`packages/web/src/editor/paneWidths.ts`,
`theme/cavitas/`; the control in `packages/web/src/ui/ThemeSwitch.tsx`, the notice in
`packages/web/src/ui/notice.tsx` (`.notice` in `styles.css`), the
pre-paint script in `packages/web/index.html`. The top row's corner buttons,
the mode switch, the Home button and the Copy deck id button, and the zoom
chip live in `packages/web/src/editor/chrome.tsx`;
the panel's header icons (now a fixed row beside the panel toggle, not inside
the pane's own header) in `packages/web/src/editor/Panel.tsx`; the zoom value
is lifted from `packages/web/src/editor/Scene.tsx` to
`packages/web/src/editor/DeckEditor.tsx` so the chip can float outside the
scene. `deck.dir` (the deck's folder relative to the workspace root, what
Copy puts on the clipboard) is computed in `deckBoot` in
`packages/server/src/server.ts` and typed on `Boot["deck"]` in
`packages/web/src/boot.ts`.

## Checks

`e2e/chrome-toggles.mjs` measures the toggles and the mode pill with both
panes open, the rail closed, the panel closed and both closed, at 1440x900
and 390x844 (no Every deck link, the rail's pill holding the toggle, Home and
Copy at their combined width, Home right of the toggle and Copy right of
Home, each the toggle's own top and height, the
mode pill one `--gutter` past the toggle strip or the rail, the visible switch's
top at `--panel-inset`, no wrapper with a background or border around it, at
1440 each open pane's header row ending at its toggle's bottom edge, and with
both panes closed the rail toggle pill, the mode switch and the panel toggle
pill sharing one top (`--panel-inset`) and one height (`--corner-btn`)); that
the Home button opens the deck list with its own deck links; and that Copy
deck id puts `decks/example-b` on the clipboard, flashes a check icon for
1.2 s then reverts, and the notice reads "Copied decks/example-b". It also
checks that a fresh browser opens with the rail closed and that an opened
rail stays open across a reload, with the toggle in place. It also measures,
at 900 px and up: every top-row icon (the rail toggle, Home, Copy, the mode
switch, the
panel toggle, the panel's inbox and theme buttons) on one centre line; every
corner button's hover fill inset from its pane's edges by
`--panel-header-pad`, never touching them; the space above the header row
(pane top to the hover fill) equalling the space below it (row bottom to the
rail's first thumbnail or the panel's first content, on the Slide tab the
Template bank header row), both `--panel-header-pad`, and the rail's first
thumbnail and the panel's first content starting at the same y; the zoom chip hidden at fit, shown on the mode
switch's centre line after a wheel zoom, and gone after the linger delay;
and the sketch toolbar's centre line matching the panel's tab bar; and that
the panel toggle sits outside the icon well, on the row's own centre line,
`--gutter` right of the well, its inset from the pane's right edge equal to
the rail toggle's inset from the left, with no painted background or border
of its own.

`e2e/comments.mjs` (View mode: no region and no outlined slot on the slide;
the Comments tab lists the issue with no input bar and no Resolve).
`e2e/pane-resize.mjs` (at 1440x900: drag each grip, live widths, the slide
between the panes, thumbnails at the rail less two `--thumb-inset`, the mode switch one
gutter past the rail, toggles unmoved, the limits and the 320 px scene,
double-click reset, arrow keys, the widths kept across a reload; at 390x844
no grips). `packages/web/test/paneWidths.test.ts` (limits and fitting).
`e2e/rail-spacing.mjs` (at 1440x900 and 390x844, rail open: the three
gutters, every thumbnail's left and right inset, the gaps between thumbnails,
and the selected highlight's four paddings, each within 1 px; every
thumbnail's hairline on the rail toggle glyph's ink edge; the first thumbnail
and, at 1440, the panel's first content one `--panel-header-pad` under the
header buttons; the panel's content `--panel-pad` inside its edge);
`impeccable detect --json src` (no findings, 2026-10-12); the contrast figures
above were computed per surface; side-by-side with `~/cavitas/scene.html`. `e2e/theme.mjs`: with storage
cleared the editor and inbox pages have luminance at least 0.95; Dark is dark
and survives a reload; System follows an emulated colour scheme; the slide's
background is the same in both themes; body text contrast is at least 4.5:1
in both.
