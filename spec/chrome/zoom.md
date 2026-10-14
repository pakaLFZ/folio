# Chrome: zooming and panning the slide

## Demand

- "add scroll to zoom feature to the slide" *(user, 2026-10-12)*
- Read as: the wheel zooms the slide in the editor's scene about the pointer;
  once zoomed in, the slide pans; a double-click, the `0` key or a small zoom
  chip returns to fit; everything drawn on the slide follows the zoom; line
  measurement never changes with it.
- "for scroll to zoom, make shift default change cursor to drag icon which
  user can left click to drag the page to see different position (part)"
  *(user, 2026-10-12)*. Holding Shift is the pan mode; it replaces the
  Space-drag first proposed.
- "ur zoom's step is too large, also make it more smooth (without
  acceleration or momentum to make it accurate), and it does not have zoom
  down mode, add it" *(user, 2026-10-12)*. Read as: shrink the step to about
  5%, make every step a fixed size regardless of how fast or far the wheel
  moved (no scaling with speed, no coasting after the wheel stops), and let
  zoom go below fit.
- "right click drag is drag page" *(user, 2026-10-12)*. Read as: a right-button
  drag pans the slide, the same as Shift-drag, without needing Shift held.
- "should right-click on the slide stop opening the browser's own menu, so
  right-drag panning works?" / "yes pls" *(user, 2026-10-13)*. Read as: the
  scene always suppresses the browser's own context menu, on a plain
  right-click as well as a right-drag — see the superseded lines below, and
  **Never**, for why "only when the press moved" could not work.
- Screenshot at 134%: the slide is wider than the scene and cut off at the
  right, but fits vertically. "e.g. in this case right click I can only move
  it left and right. no I want freedom to move any direction I want."
  *(user, 2026-10-12)*. Read as: panning (Shift-drag, right-drag, middle-drag,
  Shift/sideways wheel) must move the slide freely in both x and y at any zoom
  at or above 100%, including the axis the slide already fits inside the
  scene — not only the axis that overflows.
- "make zoom indicator auto hide (with fade animation) and move it next to
  the top view mode button group" *(user, 2026-10-12)*. Read as: the chip
  moves from the scene's bottom-left to the top row, one gutter right of the
  Edit/View switch, on the switch's own centre line and at its height; it
  appears while zooming and for about 1.5 s after the last change, or while
  the row is hovered, then fades out over about 200 ms (no fade under
  `prefers-reduced-motion`); it is still clickable while visible, and at
  exactly 100% it never shows.
- "can u make it so that right click I can always move page in both x and y
  despit ezoom (as currently when zoom < 100 I cannot move), also, zoom state
  resets when I switch page" *(user, 2026-10-13)*. Read as two asks:
  - pan freely at any zoom, including below 100% — superseded the same day by
    the column view below (a column scrolls natively, so there is nothing to
    "pan" there any more; the complaint is answered by scrolling instead, not
    by extending the custom pan offset below 100%);
  - zoom and pan must not reset when the current slide changes (rail click,
    keys, inbox navigation into the same deck); only the free scene's own
    size changing resets them (see **What resets**). Opening a different deck
    still starts fresh, since the whole editor remounts for a new deck.
- "also consider make it ctrl + scroll = zoom, and then learn from edge pdf
  viewer so that when zoom is less than 100 we see pages in a column"
  *(user, 2026-10-13)*. Read as the Edge PDF viewer model: Ctrl+wheel (and a
  trackpad pinch, which already carries `ctrlKey`) zooms about the pointer; a
  plain wheel no longer zooms at all (superseded below); below 100% the scene
  shows every slide of the deck stacked in one scrolling column instead of
  the old shrunk-and-centred single slide (also superseded below).
- "consider smartly dont render page for performance" *(user, 2026-10-13)*.
  Read as: the column must not mount every slide's real content at once —
  only the ones near the viewport, the rest same-size placeholders, reusing
  `Rail.tsx`'s own windowing rather than a new mechanism, and measurement
  must not depend on what the column has mounted.
- "dont add stuff without my explicit permission" / "no no u can add other
  stuff, just not in the slide tab, in other places u can" *(user,
  2026-10-13)*. Read as: no control, indicator or toolbar item was added
  beyond what these asks needed; none of this feature touches the panel's
  Slide tab.

## Behaviour

- **100% is the floor for the single slide; below it is a column, not a
  shrunk slide (superseded 2026-10-13).** The zoom is a factor over fit, from
  0.25 (a quarter of fit) to 8; 1.0 is "100%", the slide at the size the
  space between the rail and the panel allows, as before. At 1.0 or above the
  scene shows the current slide alone, panned and scaled as below. Below 1.0
  the scene instead shows the whole deck as one scrolling column (see
  **The column, below 100%**); there is no more a single, shrunk, centred
  slide below fit; that line is superseded, along with "panning does nothing
  below fit" — see **Never**.
- **Zoom is Ctrl+wheel only (superseded 2026-10-13).** Over the scene (the
  slide, its column, or the empty page around either), Ctrl+wheel zooms about
  the pointer; a trackpad pinch arrives as a wheel event with `ctrlKey` set,
  so it takes the same path. Every step is the same fixed factor (`STEP =
  1.05`, about 5%), never scaled by the speed or size of the wheel delta:
  - a mouse notch (a wheel event reported in lines or pages, `deltaMode !==
    0`) is one step outright, regardless of its magnitude;
  - a trackpad's continuous pixel deltas (`deltaMode === 0`) are accumulated
    and a step is spent every 50 px of accumulated `deltaY`, so a fast flick
    steps no further than the same distance scrolled slowly — no coasting
    once the wheel stops, no jump from a quick flick;
  - each step is applied at once, with no easing animation;
  - a **plain wheel, with no Ctrl, never zooms** (superseded: it used to be
    the zoom gesture outright — see **Never**). It scrolls instead: at 100%+
    it pans the single slide (see below); below 100% it is left alone, so the
    column's own native scroll handles it;
  - `+` (or `=`) and `-` still zoom by the same `STEP` (1.05x in, 1/1.05x
    out) about the centre of the free scene, when no text slot, input or menu
    has the focus and no modifier is held; two presses are two steps. `0`
    still returns to 100% from either mode.
  - crossing between the two modes on a Ctrl+wheel step keeps the slide under
    the pointer: below 100%, every Ctrl+wheel step (whether or not it ends up
    crossing to 100%+) first tells the column which slide is under the
    pointer and makes it `current`; so the slide that becomes the single view
    once zoom reaches 100% is always the one the pointer was last over, not
    whatever was `current` before the zoom began. Going the other way
    (100%+ down into the column), there is only ever one slide on screen in
    single view, so it is trivially the one "under the pointer" already.
- **Pan at 100% or above: Shift is the pan mode, and it is free in every
  direction.**
  - holding Shift over the scene turns the cursor into a grab hand
    (`grab`); a left-button drag with Shift held pans the slide, with the
    cursor `grabbing` while it moves. This works in Edit, Comment and View,
    and while Shift is down it takes precedence over region drawing,
    sketching and text selection on the slide;
  - releasing Shift restores the normal cursor and behaviour;
  - **except in text:** while the caret is in a text slot (or any text
    field), Shift keeps extending the text selection; pan mode is suspended
    and no hand is shown until the caret leaves;
  - below 100%, Shift does nothing: there is no single slide to pan, only the
    column, which scrolls on its own;
  - a right-button drag pans the slide the same way, with no Shift needed: the
    cursor is `grabbing` while it moves, the same clamping applies, and it
    works starting over a text slot too, without moving the caret or the
    selection. It does nothing below 100%, matching Shift. The scene always
    calls `preventDefault` on `contextmenu` for a press inside it, so the
    browser's own menu never opens there, on a plain right-click or a
    right-drag alike (*superseded 2026-10-13: "If the right-button press
    moved more than about 4 px before release, the following browser context
    menu is suppressed for that press; a plain right-click with no movement
    opens the menu as before" — see **Never**). This applies only to a press
    inside the scene/slide area — the rail's own right-click menu, outside
    the scene, is unaffected;
  - a plain wheel pans too, now that it no longer zooms: vertical by default,
    horizontal with Shift held; a middle-button drag also pans.
  - **the pan moves freely in both x and y, on whichever axis the drag or
    wheel asks for it, even the axis the slide already fits inside the
    scene** — a drag or wheel component is never dropped just because that
    axis has no overflow at the current zoom. The pan is not the scene's
    native scroll (whose range is only as wide as the overflow, which is why
    a slide that fits vertically used to move only left and right); it is a
    2D offset `useZoom` owns and renders as its own CSS translate on the
    sheet, so it can move the slide in a direction the scene itself has no
    scrollable room for.
  - **the bound is loose, not the scene's edge.** The offset is clamped per
    axis so at least 48 px of the slide, or a tenth of that axis's own size
    (whichever is larger), stays inside the free scene; past that the slide
    may be panned under the rail and the panel's glass, and mostly out of
    view, but never dragged entirely off-screen. (`panBound` /
    `clampAxis` in `zoom.ts`.)
- **The column, below 100% (added 2026-10-13, the Edge PDF viewer reading).**
  The scene shows every slide of the current deck, in deck order, stacked
  vertically with a 16 px gap, each at the same `fit * zoom` scale, centred
  horizontally; this is `ColumnScene.tsx`, a plain native-scrolling `<div>` (`overflow-y:
  auto`), not the single slide's custom pan offset.
  - the slide most in the middle of the viewport is `current` — the same
    `current` the rail, the keyboard and inbox navigation already drive. The
    rail's own selection follows it, and clicking a rail thumbnail, or moving
    with the keyboard, scrolls the column to bring that slide back to the
    middle. A click on a slide in the column also makes it `current`;
  - "in this mode, when I click the slide panel on the left, the slide cannot
    jump to the correct page" and "when I scroll in this mode, the main page
    jump thus scrolling is not smooth" *(user, 2026-10-13)*. Read as: only a
    scroll by the user picks `current` from the middle of the viewport; a
    `current` set from outside (rail, keys, a click) scrolls the column once
    to centre that slide, and the offset it lands on is pinned, so neither
    that scroll nor a clamped one (the first and last slides cannot reach the
    middle) hands `current` to a neighbour. A re-render never scrolls the
    column; it moves only when `current` changes to a slide other than the
    one in the middle;
  - "for some reason the cursor canot go to the select tool when zoom <
    100%" / "the native pointer, meaning not the tool" *(user, 2026-10-13)*.
    Read as: over the column's slides the pointer is the chosen tool's own,
    as over the single slide (an arrow with Select, the comment tools' own
    pointers, a crosshair with Shape or Text), never the browser's hand;
  - the `current` slide in the column is live (superseded 2026-10-13, "at <
    100% zoom the tools are not working and they directly select stuff",
    user): it renders in the editor's own mode with the scene's overlay, so
    text editing, the Cursor tool's selection, the comment tools and the
    Shape and Text tools all work on it as on the single slide. Every other
    slide renders read-only in the rail's "thumb" mode, with no text
    selection, and is never a source of overflow-warning measurement, so
    scrolling the column never triggers a re-measure. A click on such a slide
    makes it `current` where it sits: the column scrolls only when the new
    `current` is not wholly in view. The earlier rule, "editing a slide
    resumes once zoom returns to 100% or above", is superseded;
  - **virtualized**, reusing `Rail.tsx`'s own windowing rather than a new
    mechanism: only the slides within one screen's height of the viewport
    (above or below) are mounted with their real content; the rest are
    same-size placeholder `<div>`s, so the scrollbar and every slide's
    position stay exact regardless of what is drawn. A 100-slide deck
    measured at 50% zoom (1440x900, Playwright): first paint of the column
    280 ms, 7-8 of the 100 slides drawn with real content at any time, the
    document's total DOM node count flat at ~1,500 nodes whether scrolled to
    the top or the middle, and no PerformanceObserver long tasks while
    scrolling top to bottom. Figures and background images already carry
    `loading="lazy" decoding="async"` (`FigureSlot.tsx`, `LayoutView.tsx`),
    so a slide's pictures do not fetch until it is actually mounted.
- **Back to 100%.**
  - a double-click on the empty page around the single slide (not on the
    slide, where a double-click selects a word; not applicable in the
    column, which has no empty page of its own);
  - `0` when no text slot or input has the focus;
  - the zoom chip: a small glass button at the top row, one gutter right of
    the mode switch, on its centre line. It shows the zoom as a percentage of
    100% (`200%` is twice, `40%` is below) in mono tabular figures, appears
    whenever the zoom is not exactly 1.0 — including below 100%, in the
    column — and a click returns to 100%. Its tooltip says "Back to fit (0)".
- **What resets.** The zoom returns to 100%, and the pan to none, when the
  free scene's own size changes — the window is resized, or the rail or
  panel opens or closes and changes the free scene. **It does not reset when
  the current slide changes** (rail click, the keyboard, inbox navigation
  into the same deck already open) — superseded 2026-10-13, see **Never**.
  Opening a different deck resets it, because the whole editor remounts for a
  new deck (`PageShell.tsx` keys a fresh `DeckEditor` per deck visit).
- **Everything follows, in the single-slide view.** The zoom changes the one
  scale the slide canvas is drawn at, so everything drawn inside the canvas
  scales and moves with it: comment regions and sketch marks, comment pins,
  the selected-slot outline, the overflow outlines, figures and the text
  caret. Typing into a text slot works at any zoom at 100%+. The new-comment
  bubble reads the slide's drawn rectangle and re-places itself when the
  slide's size changes and when the scene pans (the scene dispatches a
  `scroll` event on every pan change, for the bubble's own listener, even
  though the pan is no longer the scene's native scroll), so it stays beside
  its region through zoom and pan.
- **Comment tools at 100% or above.** In Edit, with the Region tool a drag
  still sets the region, and the pen, rectangle and arrow draw, at any zoom
  from 100% up (*superseded 2026-10-12: "Comment mode at any zoom"; Comment
  mode merged into Edit*; *superseded 2026-10-13: these tools no longer run
  below 100%, since that is now the read-only column*): pointer positions are
  converted through the slide's screen transform, and stored regions and
  marks stay in slide pt. Shift-drag and middle-drag pan instead of drawing.
- **Measurement.** Overflow line measurement does not change with zoom:
  `measureText` reads `offsetHeight`, `scrollWidth` and `clientWidth` of the
  slot's text and box, which are layout sizes of the unscaled pt canvas, and
  the zoom is a CSS transform on an ancestor (`.folio-slide`), which layout
  sizes ignore. The column never measures at all (its slides render in
  "thumb" mode, which skips `onSlotMeasured`), so mounting and unmounting
  slides while scrolling cannot perturb a warning.
- **Where it is off.** The print/PDF page, the rail's thumbnails and the
  layout cards draw slides at their own fixed scale and never zoom.

## Never

- A plain wheel that scrolls the browser's own page: the scene always owns
  the wheel over it, as either a zoom (Ctrl held) or a pan/scroll (not held).
- A plain wheel that zooms (*superseded 2026-10-13*: it used to be the zoom
  gesture outright, and Shift or a sideways wheel panned instead; now a plain
  wheel never zooms, only Ctrl+wheel or a trackpad pinch does, and a plain
  wheel always scrolls or pans).
- A shrunk, centred single slide below 100% (*superseded 2026-10-13*: that
  whole reading — "the slide is smaller than the free scene and sits centred
  in it... panning does nothing there" — is replaced by the scrolling column;
  there is no level below 100% where a single small slide just sits still).
- Panning (the custom 2D offset) running below 100%: the column's own native
  scroll owns movement there instead; extending the single-slide pan offset
  below 100% was the first reading of "I cannot move" (*user, 2026-10-13*)
  and was superseded the same day by the column view, which answers the
  complaint by scrolling rather than panning.
- Zoom or pan resetting when only the current slide changes (*superseded
  2026-10-13*: "the zoom returns to fit... when the current slide changes"
  — rail click, keys and inbox navigation into the same open deck now all
  keep the zoom and the pan exactly as they were).
- A zoomed-out slide floating off-centre in the scene; the single slide stays
  centred at 100%, and the column's slides are centred horizontally too.
- Re-laying out the slide at a new size: the canvas is scaled as one piece;
  line breaks never depend on the zoom.
- Acceleration or momentum in zoom: a step's size never grows with how fast
  or how far the wheel moved, and nothing keeps moving once the wheel stops.
- Regions or marks stored in screen px or in zoomed units.
- Zoom on the print page or in thumbnails.
- A zoom chip shown at exactly 100%.
- A zoom chip that stays glued to the scene corner instead of the top row, or
  one that sits off the mode switch's centre line.
- Space-drag as the way to pan (proposed first; the user chose Shift).
- Shift taking over a drag while the caret is in a text slot.
- Pan locked to the axis that overflows: a drag or wheel pan moves the slide
  on both x and y together, never only the axis the current zoom happens to
  push past the scene's own edge on.
- Suppressing the context menu only when the right-button press moved more
  than 4 px, and letting a plain right-click open it (the original rule,
  *superseded 2026-10-13*): Chromium on Linux and macOS fires `contextmenu`
  on the right-button press itself, before any movement is known, so a
  press-then-check never gets the chance to tell a click from a drag — the
  native menu already opened and blocked the pan. The scene now suppresses
  `contextmenu` unconditionally.
- Editing, comment tools or shape tools running on a column slide other than
  `current`: those are read-only thumbnails; a click only makes one `current`,
  and then it is live.
- Mounting every slide's real content in the column at once: only the window
  near the viewport is drawn; the rest are placeholders of the right size.
- Re-measuring overflow from a slide mounting or unmounting in the column.
- Adding any new control, indicator or toolbar item beyond what these asks
  needed, and adding anything at all to the panel's Slide tab (*user,
  2026-10-13*).

## Where it lives

`packages/web/src/editor/Scene.tsx` (the free scene; chooses the single-slide
view at 100%+ or `ColumnScene` below it, and lifts the zoom value and reset up
to its `onZoom` prop instead of drawing the chip itself),
`packages/web/src/editor/ColumnScene.tsx` (the column: windowed mounting,
scroll-driven `current`, and scrolling to meet an externally-driven
`current`), `packages/web/src/editor/chrome.tsx` (the chip, beside the mode
switch, with its own show/hover/linger/fade state),
`packages/web/src/editor/DeckEditor.tsx` (holds the lifted zoom state),
`packages/web/src/editor/useZoom.ts` (Ctrl+wheel, drag, keys, the
pointer-anchored zoom, the 2D pan offset and its clamp, and telling the column
which slide is under the pointer while zooming below 100%),
`packages/web/src/editor/zoom.ts` (the pure rules: clamp, the Ctrl+wheel step
accumulation, the key step, the pan bound, and `columnIndexAt`, which slide a
px offset in the column falls on).

## Checks

`packages/web/test/zoom.test.ts` (clamping to 0.25-8, the fixed-step
Ctrl+wheel mapping including a discrete mouse notch and a fast flick stepping
no further than the same distance spread out, delta normalisation, the pan
bound's 48px/10% floor and its clamp, `columnIndexAt`'s px-to-slide math at
its edges and on an empty deck).
`e2e/zoom.mjs` (1440x900, `decks/example-b` extended with extra slides for
the column checks): the chip is absent at 100%; a plain wheel does not zoom;
a Ctrl+wheel step over a point keeps that point under the pointer within 2
px and shows the chip; the selected-slot outline and an overflow outline
scale with the slide; the slot's line count is unchanged; `0` and the chip
return to 100%; a region dragged with the Region tool at 2x stores the same
pt box as at 100%; holding Shift while zoomed shows `grab`, and a Shift
left-drag pans by the drag and draws no region; with the caret in a text slot
Shift shows no hand and a Shift-click does not pan; a right-drag pans the
same way with `grabbing` while it moves, draws no region and moves the slide
in both x and y, and neither it nor a plain, unmoved right-click ever opens
the browser's own context menu; a right-drag still moves the slide vertically
after zooming to a level that overflows the scene's width but still fits its
height (the one the user's screenshot showed stuck); zoom and pan survive
switching to the next slide with the keyboard; Ctrl+wheel below 100% shows
several slides stacked in a column with a gap, not overlapping; the column
only draws a fraction of a 14-slide deck's slides at once; a plain wheel
scrolls the column (never the browser page) and changes which slide is
`current`; Ctrl+wheel zooming in from the column lands on the slide that was
under the pointer. `e2e/chrome-toggles.mjs` also checks the chip's position
(hidden at 100%, shown on the mode switch's centre line right after a
Ctrl+wheel zoom, hidden again after the linger delay) and now zooms with
Ctrl held.

A one-off Playwright measurement (not part of the suite) on a generated
100-slide deck confirmed the column's virtualization: see the numbers under
**The column, below 100%**.
