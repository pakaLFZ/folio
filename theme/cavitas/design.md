# Cavitas — Style Reference

> A laboratory instrument, not a dashboard.

**Theme:** adaptive, canvas-derived

Cavitas is a scene with one pane of frosted glass laid over it. The scene owns the whole window, so nothing is ever cropped by chrome and the canvas is never resized when the panel moves; the panel floats on top, blurring the structure behind it into a wash of colour rather than hiding it. The palette is achromatic and adaptive — pale material with dark ink over a light canvas, charcoal material with luminous ink over a dark one — because every chromatic colour on screen belongs to an atom, a bond or a cavity. Structure comes from hairlines and whitespace, never from shadows inside the panel. Every control is a pill; every card takes the 24px radius of the pane or the 6px radius that reads as architectural. Numbers are set in a monospace face with tabular figures, because a column of angles that jitters as it is typed is a column that cannot be read.

The single source of truth for all of it is `web/src/styles.css`. The tables below describe what is in that file; they do not replace it, and a value changed here and not there is simply wrong.

**This file governs the panel. The scene has a reference of its own: [`design-rendering.md`](design-rendering.md).** The split is the same one the palette rule above draws. Everything here is achromatic and answerable in CSS, because none of it is chemistry; everything in the other file is chemistry — how hard the light falls on an atom, how much chroma the element palette carries, and how the depth is taken apart — and none of it is answerable in CSS at all. Its opening claim is the one this file is the other half of:

> The structure is the display type. Nothing drawn should be harder to look at than the thing it is drawing.

That is the same sentence as *"the scene is the display type"* below, read from the scene's side rather than the panel's. Here it means no heading competes with the structure; there it means the structure does not compete with itself.

## Tokens — Colours

| Name | Value | Token | Role |
|------|-------|-------|------|
| Ink | contrast pole, ≥4.5:1 | `--color-ink` | Primary text, the filled action button, the focus ring |
| Ink muted | derived, ≥5.5:1 | `--color-ink-muted` | Row labels, helper text, de-emphasised controls |
| Ink faint | derived, ≥4.5:1 | `--color-ink-faint` | Section titles, field prefixes and suffixes, notes |
| Surface | material composited over canvas | `--color-surface` | Opaque fallback, mobile sheet and popovers |
| Raised | surface lifted towards white | `--color-raised` | Fields, selected segments, knobs and draggable handles |
| Ash / Sunken | surface moved towards ink | `--color-ash`, `--color-sunken` | A selected icon button, a sunken well |
| Whisper | active ink at 4–8% | `--color-whisper` | Hover and quiet state fill |
| Line | active ink at 12–16% | `--color-line` | Every border and divider |
| Line soft / strong | active ink at 7–10% / 24–30% | `--color-line-soft`, `--color-line-strong` | Quiet divider / interactive edge |
| Danger | red shifted to ≥4.5:1 | `--color-danger` | A number that is wrong: one that does not parse |

Borders are translucent active ink rather than fixed grey: dark over pale material and light over charcoal material. The material is frosted and what is behind it changes as the scene turns, so a fixed grey would sit on some structures and float above others.

Danger is the one colour that is not chemistry, and it is spent on one thing: a number the panel is telling you is wrong. A field whose text does not parse takes it, and it is always carried on a second channel as well, `aria-invalid`, so the meaning survives a projector, a monochrome display and an eye that does not separate red from black.

## Tokens — Typography

| Role | Size | Weight | Where |
|------|------|--------|-------|
| body | 13px / 1.5 / -0.01em | 400 | Row labels, buttons, the default for everything |
| field | 12px, mono, tabular | 400 | Every number and every text input |
| note | 11px / snug | 400 | Section titles, fieldset legends, asides under a control |
| caption | 10px, uppercase, 0.06em | 500 | The label over a standalone field |

Sans is `OpenAI Sans` with system fallbacks; mono is `SF Mono` / `Cascadia Code` / `JetBrains Mono` with `ui-monospace` behind them. `calt` and `liga` are on for the sans. Nothing on the panel is set above 13px — the scene is the display type, and a heading competing with it would be a heading nobody asked for.

## Tokens — Shape, motion and depth

| Name | Value | Token |
|------|-------|-------|
| Radius, controls | 9999px | `rounded-full` |
| Radius, a tag and the swatch that sets it | 7px on a 22px square | — |
| Radius, links and focus | 4px | `--radius-xs` |
| Radius, cards | 6px | `--radius-sm` |
| Radius, the panel pane | 24px | `--radius-xl` |
| Ease, the panel | `cubic-bezier(0.16, 1, 0.3, 1)` | `--ease` |
| Ease, the scene | `3t² − 2t³` (smoothstep) | — |
| Duration, a control answering | 120ms | `--dur-fast` |
| Duration, a section opening | 200ms | `--dur` |
| Glass fill / blur | white 74% → charcoal 62% / 28px | `--glass-fill`, `--glass-blur` |
| Glass edge | active ink at 9–20% | `--glass-edge` |
| Panel fill / blur | white 62% → charcoal 64% / 64px | `--panel-fill`, `--panel-blur` |
| Layers | scene 0, overlay 10, panel 20, popover 30 | `--z-scene` … `--z-popover` |

**There are two eases, and the split is evidential rather than decorative.**

- **The panel's ease is exponential out.** A section opening, a control answering a click. Quick to leave, slow to land, no overshoot. This is the one every piece of chrome uses, and a third curve anywhere in the panel would be a second material.
- **The scene's ease is smoothstep**, `3t² − 2t³`, for a step between two structures. Symmetric, because neither structure is arriving or leaving — both are already loaded and already on screen.

The reason they differ is that they are answering different questions. An ease-out is the curve for an object *entering* the screen, which is exactly what a panel section does and exactly what a morph does not. Measured at half the duration: the panel's curve is at 0.969, Material's `standard` — the curve it publishes for an object moving between two already-visible states — is at 0.776, and smoothstep is at 0.500. Scene motion carries data, so it takes the curve the case calls for rather than the one the chrome uses.

Continuous playback is not eased at all: easing each frame of a played sequence would turn twelve frames a second into twelve stop-and-go pulses. Only a discrete step is eased.

There is exactly one shadow in the system, `--glass-lift`, and it belongs to floating glass alone — never to a card inside the panel.

The material is calculated from the canvas rather than chosen from two presets.
Canvas luminance runs through a smooth response curve from pale glass to charcoal
glass; hue enters only through the blur, never through a coloured UI overlay.
The expected composite chooses one contrast pole for foregrounds, because fading
black ink through grey into white would create an unreadable middle. Muted, faint
and danger ink are then derived against that composite to their contrast floors.
The same variables live on the document so portalled tooltips, popovers and the
save dialog cannot fall out of the material surrounding them.

## What scene motion may and may not do

**This is a standing rule. Any future motion proposal is checked against it before it is designed**, so that "it would look better" and "it would be a lie" are separated before anyone builds either.

**The one constraint everything else follows from: this is data, not character animation.** An atom may never be drawn in a position that neither endpoint structure supports. A principle that changes only *when* a point passes through positions it was always going to occupy is free. A principle that invents a position is forbidden, however good it looks.

The twelve principles of animation, classified against that:

| # | Principle | | Why |
| --- | --- | --- | --- |
| 1 | Squash and Stretch | **Forbidden** | Deforms the atom; every atom is a fixed-radius sphere, so any deformation draws geometry nothing supports |
| 2 | Anticipation | **Forbidden** | A wind-up is a position on neither side of the transformation |
| 3 | Staging | Not applicable | Composition and camera. Its one testable analogue, staggering, is already rejected |
| 4 | Straight Ahead / Pose to Pose | **Free**, trivially | A morph is always between two fully known poses by construction |
| 5 | Follow Through / Overlapping Action | **Forbidden** (follow-through) | Its defining move is continuing *past* the target. Timing-offset overlap alone is free, but that is staggering under another name |
| 6 | Slow In and Slow Out | **Free** | Changes only the speed profile through fixed endpoints |
| 7 | Arcs | **Free** | The rigid transformation the data itself implies is a path, not an invention |
| 8 | Secondary Action | Not applicable | Every atom already has its own real correspondence; nothing subordinate to add |
| 9 | Timing | **Free** | Allocates duration; invents no position |
| 10 | Exaggeration | **Forbidden** | Pushes past the true endpoint |
| 11 | Solid Drawing | Not applicable | Solves 2D implying 3D volume; this is already 3D |
| 12 | Appeal | Not applicable | Character charisma; a crystal has none to give |

**Four are available and four are banned outright.** The four available — slow in and out, arcs, timing, pose-to-pose — are the whole of what scene motion has to work with.

**Every curve that overshoots is excluded**, because a value above 1 draws an atom past the position the destination structure puts it in: `easeOutBack` peaks at 1.100, `easeOutElastic` at 1.373 and crosses the target repeatedly, Android's `OvershootInterpolator` at 1.132, and its `AnticipateInterpolator` dips to −0.132 before moving. A damped oscillator overshoots by `100·exp(−ζπ/√(1−ζ²))` per cent, so **a spring is admissible only at critical damping or beyond** (`ζ ≥ 1`), where overshoot is exactly zero.

**Safe, and the list to choose from:** smoothstep `3t² − 2t³`, smootherstep `6t⁵ − 15t⁴ + 10t³`, cubic and quintic ease-in-out, sinusoidal `(1 − cos πt)/2`, exponential-out, and any `cubic-bezier` whose two handle `y` coordinates lie in `[0, 1]`.

## Numbers you can type

This is the part of the interface that is not decoration, and it is the part to copy when adding anything new.

**Every quantity the viewer will let you set with a gesture, it also lets you type, in the same units, under the same names Python uses.** A figure is found by dragging and kept by typing; a control that only answers the mouse can be photographed but not reproduced. Two things are written this way today — a guest's pose and the camera — and they are deliberately written identically:

```
Angle °
[x  30.00] [y -35.00] [z   0.00]

Offset Å
[x   0.000] [y  0.000] [z  0.000]
```

**A triplet is a `fieldset` with a `legend` carrying the name and the unit, over a three-column grid of `NumberField`s prefixed `x`, `y`, `z`.** The legend is 11px `--color-ink-faint`, with the unit in mono. The prefix is a 10px mono letter inside the box at the left, not a caption above it: three fields in a row have to say which axis each one is, and the letter says it where the number is read. Values are centred.

**Angles are always extrinsic x-y-z Euler degrees, and offsets are always angstroms.** This matches `cavitas.rotation_from_angles` and `web/src/lib/math.ts`'s `rotationFromAngles` exactly, so a pose reported by an insertion search can be typed into the camera and mean the same rotation. Two decimals for an angle, three for an offset. A quarter turn about y folds x into z; the readout there is the equivalent view rather than what was typed, which is a property of Euler angles and is said out loud in the panel rather than hidden.

**Zero means "as found", not "at the origin".** A pose's zero is the pose the search reported. The camera's zero is the framing the scene opened at — square on, centred, whole structure in view — and its zoom of 1 is that same framing, so 2 is twice as close. That is what makes a value worth writing into a script: `camera_zoom=2` means the same thing for one unit cell and for a block of twenty-seven.

**A triplet carries a hairline track under each of its three boxes, in the same column.** Nothing has to say which track belongs to which number, and no line of the panel is spent on labelling them. A track needs a range and a field does not, so an angle's track runs the full turn while its field stays unbounded — typing 200 is a legitimate way to say −160, and clamping it would be the control arguing with the number. An offset's track reaches through the nearest wall: from where the frame on screen holds the guest, its tightest contact, plus the molecule's own length, plus two angstroms, so a severe steric crash is one drag away for somebody preparing a strained start on purpose. It is measured on the frame on screen, never from the reference cavity, which may have closed or split by then. A guest's triplets are written one axis to a row — `AxisRows`, the field then a track the width of the panel — because a guest is swept rather than read, and a track a third of 320px wide moves a molecule by degrees per pixel. Zoom's track is logarithmic, because zoom is: half as close and twice as close are the same size of step.

**A quantity with one number is written in the same shape as one with three.** Zoom is a `FieldGroup` like the angles and the offset above it — a legend carrying the name and the unit, a box in the triplet's first column, its track beneath it in that same column — rather than a labelled row with its slider on the right. Three readings of one camera stacked in one shape are read as one block; a row among fieldsets is read as a setting of the panel.

**Every group ends with a `Reset`, disabled until something has actually moved.** Beside it sits whatever turns the current values into Python: `Python` on a pose, a bare copy glyph on the camera for the three `camera_*` keywords alone, and `Copy this view as Python` on the Export tab for the camera and the settings together. The weight follows the scope: a full-width pill for the action a whole tab is about, an `IconButton` for one that belongs to the group of fields beside it.

**An action whose result lands somewhere invisible says so in a `Notice`.** A clipboard has nothing on screen to show for itself, and a button that rewrites its own label can only be read while the pointer is still on it. One pill of glass at the foot of the window, monochrome like every other piece of state — a check for a thing done, a warning glyph for one that failed — up for two seconds, taking no pointer events and carrying no dismiss button. It is `role="status"` rather than an alert, so a screen reader reaches it at a pause instead of over the top of whatever it was saying. Only the last message is shown: a stack of transient notices is a log, and nothing in this panel is worth one.

**The fields follow the mouse as well as driving it.** Dragging the scene writes back into the boxes on the frame it is drawn in. A readout that only updated when typed into would be a second, stale view of the same camera.

**Typing commits on every keystroke that parses.** The field holds its own text while focused — a half-typed `-` or `1.` is not a number and reformatting it under the cursor makes a field impossible to type in — and takes the canonical text back on blur. All four arrow keys step: alone by `step`, with shift by ten times it, with alt by a tenth.

## Components

| Component | Shape |
|-----------|-------|
| `Row` | Label left in `--color-ink-muted`, control right, `min-h-8`, nothing between them; `tone="quiet"` drops the label to the 11px faint note and the height to `min-h-7`, for a setting that belongs to the line above it rather than to the tab |
| `Section` | A titled block separated from the next by air, never by a rule; title 11px faint |
| `Note` | 11px faint aside under a control, used sparingly — most settings say enough |
| `Button` | Pill. `solid` is filled ink and is reserved for the action that leaves a file behind; `outline` and the default ghost carry a hairline or nothing |
| `IconButton` | Pill, no border. A whisper of active ink on hover is the whole affordance |
| `PlaybackControls` | One 77px transport capsule, second in the top-left control row — two of the row's button slots and the gap between them, cut straight down the middle: Play on the left, a caret on the right that drops the rate under it. Play becomes Stop in place and the list's two arrows are disabled while the frames run, never removed; the caret is drawn in every state. Its popover is an opaque card holding four rates a press away and a typeable number, and nothing else |
| `WindowButton` | The window's own 36px control — full screen, synchronized window, or link health — one slot left of the panel toggle; on a split page it is the page's, before the settings button at the end of the page's row |
| `SplitSettings` | A split page's settings, the last button of its row: the rate popover's card, one pill row for the panes drawn and one for what the camera link carries |
| `FillBadge` | A split pane's reading in the slot beside its panel toggle while its picture is drawn between two of its frames; the link badge's box, a spline glyph, and a tooltip that says the picture is drawn, not computed |
| `FrameRail` | The playhead: a fixed track down the left edge of the window, in the column the row's buttons stand in and always present. A half-width cylinder at the frame on screen, the quarter-width bar dark behind it and faint ahead of it, drawn there in per-step hairlines. Drag or arrow keys to scrub |
| `Toggle` | 32×18 pill switch, `role="switch"`, filled ink when on |
| `Segmented` | A row of pills in a sunken well, for two to four exclusive choices |
| `SectionLink` | The quiet 11px underlined route to a section of another tab, which switches the tab and unfolds the section in one press |
| `ColorField` | The `Tag`'s square, at the `Tag`'s size and corner — the one control that is not a pill, because colour in this panel means a cavity and a cavity wears a square |
| `NumberField` | Pill, mono, tabular, optional `x`/`y`/`z` prefix or unit suffix |
| `SliderRow` | A label, a track, and a field carrying the same number |
| `AxisTriplet` | A `fieldset` of three `NumberField`s, with a hairline track under each |
| `FieldGroup` | The legend and three-column grid a triplet is built from, shared with the quantities that have one number |
| `CopyButton` | An `IconButton` that puts the live value on the clipboard and raises a `Notice` |
| `Formula` | An empirical formula with its counts as `<sub>`, in the sans and not the mono — the one number in the interface that belongs to the symbol in front of it rather than to a column. The digits stay digits in the markup, so the clipboard and a screen reader get the flat string |
| `SummaryTab` tables | The one place the panel sets a table: a `<table>` with 10px uppercase caption heads over a `--color-line` hairline, `--color-line-soft` between rows, a Total row over a `--color-line` rule; every number mono, tabular, right-aligned. No fill, no shadow. An element's swatch is an 8px circle, because an element is a sphere and the square is a cavity's; the share of the atoms is a 6px stacked pill in the elements' drawn colours. The stress is a 3 × 3 grid between `--color-line-strong` brackets (`border-inline` on a 6px corner), the symmetric lower half in faint ink |
| `Notices` | One transient glass pill at the foot of the window, `role="status"`, monochrome, no dismiss |
| `Fold` | A section that is one line until it is opened, carrying its value on the right; `summary` replaces the faint title when the subject is a thing rather than a setting, and `flush` drops the body's indent for contents that carry one |
| `Tag` | The name of a cavity or of a group, in SVG: a 22px square with a 7px corner, filled with the cavity's exact live colour, its label in white or near-black 11px mono at weight 600 according to contrast. One template everywhere — it widens into a rectangle only for a name of three characters or more, and one that is not being drawn goes grey |
| `Badge` | A state chip, in two weights: hairline `outline` for a fact about a row, filled `solid` for the rare state worth spotting on a row that carries no `Tag` |
| `Appearance` | A colour and an opacity as one unlabelled line — the `Tag`'s square, a track, and the field carrying the same number. One shape at both levels of the cavity list; where it sits says whose appearance it is |
| `PageRow` | A cavity's row, and the way into its page. It has no chevron, since nothing under it opens; the whole row lights under the pointer. A group member keeps a 12px blank where the fold's mark stood, so its tag stays on the list's rail |
| `AxisRows` | A guest's triplet, one axis to a row: the field with its axis letter inside it, then a full-width track |
| `GuestGizmo` | The corner triad drawn on the cavity page and turned on the guest; see the Layout section |
| `PoseScope` | In a sequence, which frames the fields pose — this one — and the presses that copy the pose further, each saying how many frames it will change |
| `SavePanel` | The one modal: an opaque card centred over the whole window, on a 14% black scrim |

### The one modal

Nothing in this interface interrupts, with a single exception: choosing where a
file goes. The panel is an instrument laid over a live scene and everything on
it can be pressed at any moment; the save dialog cannot be, because it is a
question with an answer and the file does not exist until it has one. So it is
the one surface that takes a scrim, the middle of the window and the keyboard —
Escape cancels, Enter in the name field saves — and it is the reason the rest of
the interface never needs any of that vocabulary.

It is 34rem wide rather than the panel's 328px, and opaque rather than frosted:
a directory listing is small mono type, and glass under it costs legibility for
a surface nobody is looking through. Its listing is a fixed 13rem tall, so a
dialog walking a tree does not move its own Save button between an empty folder
and a full one. Everything else is the system as it stands — pill buttons, the
one filled ink action, hairline dividers, `--color-ash` for the place that is
current, `--color-danger` for the one sentence that says a save failed.

## Do's and Don'ts

### Do
- Give every GUI control a Python argument of the same meaning, named in snake case, and list it in `STYLE_ARGUMENTS` or `CAMERA_ARGUMENTS` so a misspelling is an error rather than a silent no-op.
- Use `rgb(0 0 0 / 0.12)` for borders rather than a grey hex, so they sit correctly on frosted glass over any structure.
- Make every interactive control a pill; keep 24px for the pane and 6px for a card.
- Set numbers in the mono face with `tabular-nums`, always.
- Separate sections with whitespace and a faint title, never with a horizontal rule.
- Keep one filled high-contrast button per surface for the action that produces a file, and let everything else be ghost or outline.
- Say what a control does in a `Note` when the answer is not obvious from its name, and say nothing when it is. One line is the whole of the budget: a fact about one number goes on that number's own row as a hint, and a fact about what a press will do goes on the press.
- Name a row for the quantity it sets, not for the kind of number it is. If two quantities in this package could answer to the word, either say what the number is the size of or make the row the quantity the word already meant to the reader.

### Don't
- Do not add a second modal. The save dialog is the one interruption this interface makes, and it earns it by being a question the file cannot be written without; anything else belongs in the panel, in a `Notice`, or nowhere.
- Do not add an accent colour, a gradient or a brand hue. Colour on screen means chemistry; a coloured control competes with a cavity marker.
- Do not put a box-shadow on anything inside the panel. `--glass-lift` belongs to floating glass and to nothing else.
- Do not put a filled surface inside a filled surface. Depth here is fill, then hairline, then nothing; a second fill at a different strength reads as lighting, not as a level, and there is no third fill to reach for after it.
- Do not open a popover for two settings. A pane of glass over a panel of glass barely separates from it, and a fold already has a body to put them in.
- Do not set panel text above 13px. The scene is the display type.
- Do not use weight 600 or heavier anywhere in the panel.
- Do not put a live camera value in the settings store. The camera changes on every frame of a drag, and the settings store is subscribed to by the whole panel; `web/src/state/camera.ts` exists for exactly this reason.
- Do not spell a unit out in a label when it can be a mono glyph in the legend or inside the field.
- Do not use a native `input[type=number]`'s spinners; the arrow keys already step, and the spinners steal the width a three-column triplet needs.

## Layout

The cavity list is the one place where a fold holds content rather than
settings, and it reads at two levels. A symmetry group — A1 and A2 are both
group A, which is also the name `cavity_groups` takes in Python — is a `Fold`
with a `summary`: its `Tag` in the members' own tag column, how many cavities
it holds, the radius they share, and the eye that draws the whole group or does
not. The group's tag says `A` and its members' say `A1` and `A2` — the strings
Python labels them with and the scene stamps on the markers — and they are the same
tag in the same weight, because what tells a group from a cavity is where it
sits, not a second design. Under it sit its members as `PageRow`s.

**The two levels are told apart by material.** A group open is a quiet grey
surface that gathers the family; a member row takes no surface of its own,
because that would be a card inside a card. A nested chevron is drawn lighter
and its row is shorter than the group header above it, and its size and gap put
every member tag on the same vertical rail as the group tag.

**How a group or a cavity is drawn is one unlabelled line, the same line at both
levels.** A `ColorField` is the `Tag`'s square, so the line opens with the mark
the row above it wears, and that is what says whose appearance it is: a swatch
under a group's tag in the group's own tag column is the group's colour, and one
on a cavity's page is the cavity's. The opacity track and its field follow on
the same line. Nothing is captioned — "Colour" beside a colour and "Opacity"
beside a track both say what the control already says, and a triplet's tracks go
uncaptioned for the same reason. This was a settings popover before, which is one
press too many for two settings and a pane of glass laid over a list of glass:
it barely separated from the rows behind it and its contents overran a 224px
card.

**The eye is the row's only control.** A cavity row carries one `IconButton`,
and hiding is what the list is worked with. Framing the camera on a cavity was a
second one beside it, held back until the row was hovered; it moved the camera
so little on a cell this size that it read as a dead button, and a control whose
effect cannot be seen is worse than the room it costs. A radius the whole group
shares is printed on the group's line and not again on each of its rows. Groups open by
default, unlike every other fold: their contents are the list the tab was opened
for.

**A cavity is a page, not a fold.** A press on a cavity's row turns the panel
into that cavity's page. The tab row at the foot gives its place to the page's
own bar: the way back (Esc does the same), the cavity's tag, its radius and its
eye at the far end as it is on the row, where the hand already goes, in the
header's own 36px buttons; the tabs return with the list, and the header
keeps the tab's title and the close button. It is a page because a guest's pose — six numbers, their tracks and a
gizmo — does not fit in a fold of a 320px list without every track being a
third of the panel wide. A page opens at its top, and leaving it lands on the
list scrolled where it was, with that cavity's group open, so the row just left
is under the eye. Which page is showing is
where somebody is looking, not what was done to the structure, so it is never
remembered and never sent to a linked window.

**The guest comes first on the page, and the marker under it.** Top to bottom:
the gizmo, then the angle and offset triplets in the shape
the Scene tab's camera uses, then "Reset this guest" and the Python glyph, as
the camera has "Reset camera" and its glyph, then in a sequence the `PoseScope`
row of quiet buttons; the marker's colour and opacity
follow under their own title, which says "Reference-frame marker" in a sequence
whose framework moves, because that marker is one frame's cavity drawn over all
of them.

**The guest gizmo is the corner triad, turned on the molecule.** Its arms are
the guest's own axes in the cavity's frame, seen from one fixed view tipped
twenty degrees down and twenty-five round, so that no ring is edge on. A pose is
relative to the cavity, so the gizmo is too: it moves when the pose does and
never when the scene is turned. Every handle is locked to one quantity: a ring
turns the guest about that axis of its own through its centre of mass, the
outer ring about the gizmo's line of sight, an arm end slides it along that
axis of its own at one arm length to the angstrom, the hub slides it in the
gizmo's plane, and anywhere else tumbles it, the empty panel either side of the
gizmo included. It draws no far ends, because there is no view to look along:
an arm under the pointer is drawn heavier, with a dashed guide along the whole
line it slides on, the other two arms step back, and the cursor becomes a white
double arrow lying along that arm (a four-way one over the hub). Shift snaps a turn to fifteen degrees and
a slide to a tenth of an angstrom, both counted from where the drag began. A
drag is composed as rotation matrices from the pose it began at and written
back into the six fields, which stay the truth.

**In a sequence a pose belongs to the frame it was set on.** The frames of one
list need not be one motion, and along one band the framework can close or
split the cavity a guest was named for, so the same "+1 Å in x" can be harmless
in one image and inside a wall in the next. The fields therefore move the frame
on screen alone; copying the pose to the frames joined to it without a cut, or
to every frame, is a press of its own that names how many frames it will
change in its tooltip, and each copy is read against that frame's own guest.

**A moving framework's cavities are followed through its frames under Auto search.**
With the switch on, a band whose framework moves is searched on every frame at
the settings its cavities were found at, and the voids are linked frame to
frame by overlap (`cavitas/cavity/tracking.py`); from then on the markers drawn
are the frame on screen's own, a cavity that split is two markers named `A2a`
and `A2b`, one that closed is gone, and one that opened is `N1`. It runs after
the scene's own search has answered, so the markers arrive first and the track
replaces them in place; the frames are searched side by side in the session's
spawned worker processes, sized like the search queue, which takes a 31-image
band of 211 sites from 29 s to about 7 s. There is no button and no note:
with the switch off, the markers are the reference frame's. The list stays the reference frame's cavities; the page of a guest says which
followed cavity holds it on the frame on screen, and offers to copy a pose to
the run of frames it is still in that cavity.

**A wrapper is drawn where there is a family to wrap, and the whole list agrees
on whether there is one.** Grouping is what the labels already say, so the tab
asks one question of the scene — does any group hold more than one cavity — and
answers it for every row at once. A scene with `A1 A2` and `B1 B2 B3` is two
group folds, each with its own eye, its own colour and opacity reaching all of
its members, and its rows underneath. A scene whose labels run `A1 B1 C1 … H1`
is eight families of one, and it is drawn as the flat list of eight cavity rows
it always was: a fold that holds exactly one row is a press that reveals what it
already said, an eye duplicated on the line below it, and a grey surface around
a single cavity. The decision is taken over the whole scene rather than per
group, because a list where some rows are nested and their neighbours are not
has no readable left edge; and it is taken over every cavity the probe admits
rather than over what the filter box left, so typing narrows the list without
rearranging it. This is not the group control being absent — it is absent
exactly when there is no group to control, and the same scene with a second
member in any family draws every fold back.

**A family is drawn in one colour, and it is the colour of its largest cavity.**
Python hands the palette out by free radius within `cavity_color_tolerance`,
which is the right reading of cavities that are not related to each other: two
voids of the same size are the same kind of site. But once two cavities are one
family they are the same void repeated, and drawing `B5` in a different hue from
`B1` because it measures a tenth of an angstrom smaller says the opposite of what
the grouping just said. So the family takes its first member's colour — the
cavities arrive ranked by radius, so that is its largest — and the list, the
markers and the badges on them all say it. This is the rule the notebook legend
has always drawn: one row per family, in the colour of `family[0]`.

Where no family has a second member the size palette survives untouched, because
a family of one is its own representative. Two rows in the same colour are then
the same size and not a family, which is exactly as much as colour is being asked
to carry: at any tolerance, same colour means same row in the list above it.

**Colour by size reads the free radius off a continuous scale** (viridis, or
turbo when neighbouring radii must separate), and one radius is one colour
everywhere it is drawn: every frame of a band, and every framework of a list or
pane of a split page, because the scale's ends are the smallest and largest
radius over all of them (`shownWith`, written by `cavitas/viewer/together.py`).
Pinning the range is the only way the ends move. Spacing decides how the radii
spread between the ends: linear, log (small radii spread, large ones gather), or
rank, one equal step per distinct radius as the panel prints it, which is what
separates two cavities a few hundredths of an ångström apart. The colour range is
the part of the scale the radii are drawn in: it opens trimmed, at each end, to
where the colour stands out from the background at 3:1 (WCAG 2.1, 1.4.11), by no
more than a quarter of the scale — viridis loses its pale yellow over white and
its black-purple over a dark scene, turbo its dark ends over a dark scene — and
the two sliders under the legend move either end by hand. Only the ends can be
trimmed, so turbo's light middle stays on a white scene; the gradient is the one
to use there. The bar under the scale is the
legend, with a tick per cavity on show. Every reader of a cavity's colour asks
`cavityPaint` (`web/src/viewer/cavity-paint.ts`); a new scheme is an entry
there and an option in the fold, and no caller changes.

**Every tag in the list stands on one vertical rail, whatever level it is on.**
A group's tag and its members' tags line up to the pixel — 24px from the list's
own edge, reached from the group's side as 4px of card, a 12px chevron and an
8px gap, and from the member's side as the same 4px, half a step of negative
margin, a 12px blank where a chevron stood and a 10px gap. The two sums are
different and their answer is not, which is what makes the rail the thing to
check: a chevron or its blank resized or a gap retuned on either row breaks it silently, and a column of tags
that steps in and out by two pixels per level is the one failure this list
cannot absorb, because the tag is how a row is found at all. Indent is not how
depth is said here — material is, as above — so nothing is ever pushed right to
prove that it is inside something.

**A group header is a row, never a heading.** It carries its tag, its count, the
radius its members share and its eye, and under it nothing explains it: no
caption, no subtitle, no line of prose saying what a symmetry group is. The
labels already say it, the members are directly underneath, and a description
placed between the two would be a subtitle the reader has to step over on every
pass down the list. This is the whole-panel rule read at close range — a control
says what it does by what it is, and a second line of type under a row that is
already legible is chrome. Where something genuinely lives elsewhere, it is
reached and not described: one underlined `SectionLink`, no sentence.

The marker's `Border` row in the Cavities tab is a `Segmented` of `None` and
`Outline`, which is what two exclusive choices are in this panel and nothing
else: a control drawn as a pair of radio dots with sample glyphs beside them was
a second material for a question every other row on the tab answers with the
same one. `Outline` reveals width in Å and opacity; `None` hides every border,
including periodic copies, while keeping the full measured marker radius and the
stored outline values. Width and opacity remain editable at zero, and toggling
the mode preserves those zeros. The default is `None`, with an outline width of
0.08 Å and opacity of 0.65 ready when enabled. A zero marker fill may still
leave an outline as a pure border. `Blend overlaps` hides outlines and says so
in a short note beside these settings.

**A setting that lives on another tab is reached, not described.** Everything
about the cavities is on the Cavities tab — which of them are drawn is the
probe, how each one is drawn is `Cavity markers` under it, and both sit above
the list they act on. The Structure tab keeps one line for them, because every
other subject in the scene has one there: a switch that puts the markers in the
picture or takes them out, and a quiet underlined `SectionLink` to the section
with the rest. The tab is switched and the section unfolded in one press, and
neither tab keeps a second copy of the other's number.

**The probe is two numbers, and neither of them is a search.** The search has
been paid for; these are the two questions its answer can still be asked. `Free
radius` is the size a cavity has to reach, and above the floor the search ran at
it filters the answer already paid for, exactly and instantly. `Tolerance` is how
close two cavities have to sit, under the framework's own symmetry, before they
are one family rather than two: it decides every label in the list — `A1 A2 B1 …`
at one value and `A1 B1 C1 …` at another, for the same cavities in the same
places — and it decides nothing else. Both carry their unit inside the field.
Neither is in the settings store: the floor is a display filter that is, the
tolerance is a reading of the scene rather than a preference about pictures.

**The tolerance moves without a search because the search does not depend on
it.** The cavities, their radii and their positions are the same at every
tolerance; only the partition over them moves, which is about five milliseconds a
rung. So Python computes every rung while it is building the scene and ships the
ladder inside the document, and this row walks it — instantly, with no session,
and on a page saved to disk as well as a live one. The alternative was a round
trip per drag, which would have made the one number a reader most wants to sweep
the one number they cannot. The field snaps to a rung rather than taking any
number, because what is on the ladder is what was measured and a value between
two rungs would be a claim nobody checked.

**A control is named for the quantity it sets, never for the kind of number it
is.** This row set `min_separation` and read `Tolerance` until a reader took it
for the tolerance that decides the labels, set it to 0.6 Å and expected eight
cavities to become one family. That reader was not careless: the package has four
numbers with a claim on the word, and a panel offering one of the four under the
bare noun is claiming all four. Renaming it `Merge distance` fixed the name and
left the real fault standing — the row was the wrong quantity. The panel's one
tolerance is now the one a reader has a reason to move, and the merge distance is
not on the panel at all: it decides what a search accepts, which makes it an
argument to `find_cavities` rather than a reading of the answer in front of you.
The test to apply to any label on any row survives the change, and this row now
passes it rather than being excused from it: if two quantities in this package
could answer to the word, it is not the label.

**The press is for the one thing no number here can do.** Nothing below the floor
the search ran at was ever refined, so no slider brings it back; that, and a
scene handed no cavities at all, is the whole of what a search is for now, and
the button is not drawn when there is nothing for it to find. A press offered
beside a filter would be inviting a search for an answer already on screen.

The note under the two is one line, and it says how many families this tolerance
makes of these cavities — or, when the floor has gone below what was searched,
that nothing under it was ever measured. Everything else that was once in it —
that the floor filters rather than searches, that a cavity keeps its size, its
place and its label as it moves — is true and was four sentences of standing
prose under two sliders,
which is a paragraph the reader is asked to step over on every visit to pick up
something they have already learnt. A fact about one number belongs on that
number's own row, and a fact about what a press will do belongs on the press:
the rows carry theirs as hints and the button changes its own word. What stays
under them is the one thing neither can show, and one line is the whole of the
budget for it — under any row on any tab.

Every section of every tab is a `Fold`: one line until it is opened, at the same 11px faint weight a plain `Section` title carries, because a fold is not louder than what it replaces — it is only smaller. What sits on the right of a closed one is a *value* and never a description: `1.24 Å` or `hidden` says which way it is set, while a sentence explaining what it is for would be a second heading competing with the first. One section per tab opens by default, and it is the one the tab is opened for. Which are open lives in the store rather than in the tab, because a tab is discarded and rebuilt when it is switched away from, and a section that shut itself every time is a section nobody opens twice.

**A section may hold a section, and it means an exception rather than a
sub-topic.** The Structure tab asks one size question of the whole scene —
`Atoms and bonds`, a row of presets over the two layers the renderer has, named
`Atoms` and `Bonds` — and carries a `Fold` per half of the scene underneath it:
`Framework override` and `Guest override`, each with a switch on its own header.
Nested because a departure is only ever read against the number it departs from,
so it has to sit under it; a section of its own further down the tab would put
the two readings a scroll apart, which is the arrangement this replaced — the
same three quantities asked twice, once under `Framework atoms` and again under
`Guest atoms`, with nothing saying they were the same three. The nested fold is
the same fold in every respect — same 11px faint header, same chevron, same
value on the right, same switch-on-the-header rule `Polyhedra` and `Cavity
markers` use — and the body's own indent is the whole of how the level is said.
It is not a container for settings that merely belong together: a second
question about the same subject is a second section, and only an *exception to
the question above it* earns the nesting.

**A departure's closed line says `shared`, and a layer's says `off`.** The two
are different claims and the panel must not spend one word on both: `off` is a
thing not drawn, which is what a `LayerFold` means when its size has gone to
zero, and a half that is not departing is drawn exactly as much as it ever was
— at the numbers above it. The numbers a half departs to are kept while its
switch is off, so pressing the switch twice returns to them rather than to the
defaults. That is what makes the switch worth pressing at all: the way to
compare a shared reading against a departed one is to flip between them, and a
switch that reset on the way past would give you the shared one twice.

**Periodic context is an independent override inside `Neighbouring cells`, not
a second repeat control.** Its header switch adds or removes only the boundary
copies that make one unit read continuously. Its opacity starts at `1.00`, so a
context framework copy follows the main framework and a context guest follows
the main guest instead of inheriting either neighbouring-cell fade. `Auto`,
`Manual`, and manual padding stay inside that nested fold; changing any of them
never changes the repeat counts or directions above.

**What is left in a section once the shared question has moved out of it is
what is true of that half and of nothing else.** `Framework` keeps its opacity;
`Guests` keeps its opacity, its edge and the way back out of every pose edit. A
section holding one slider is not too thin to exist — it is one line until it is
opened, and its value is on that line.

The window is the scene. The panel is a floating pane inset `--panel-inset` (12px) from the top, right and bottom, `--panel-w` wide (328px by default, dragged between limits by a `role="separator"` grip on its left edge). The scene is fitted once to the surfaces that are open when it is first drawn; after that the panel and strip are overlays, and opening, closing or resizing either one never rewrites the camera underneath it. Below 40rem the panel stops being a card beside the scene and becomes the whole window — at that width a 328px card next to a sliver of canvas serves neither — the inset drops to zero, the frost is dropped for an opaque surface so the text stays crisp, and the resizer disappears. Four sections share the pane one at a time, named along the foot of it rather than iconned along the top: five unlabelled glyphs in a row is a guessing game, and at the foot each one gets its word and lands under the thumb holding a phone.

**A window with a set in it has two edges, because it has two jobs.** The panel on the right is settings for the structure on screen; a strip on the left, `--strip-w` wide (the panel's own 328px by default, dragged between the panel's own limits from its own right edge), is navigation across a set of independent structures — the members and a permanent `‹ ›` stepping through them. The two are the same width and it is the same number, read from `DEFAULT_SETTINGS.panelWidth` rather than written twice: a matched pair reads as a frame around the scene, where a narrow strip against a wide panel reads as the lesser of the two surfaces, which is the wrong thing to say about the navigation. It is also the width the content wants — an identifier here is a content hash, and a hash that has to be truncated cannot be checked against the one in the notebook. The test for which edge a surface belongs on is whether it should survive a tab change: settings should not, navigation must. Both stay open together and the scene keeps the middle; below 40rem there is room for one, and opening either closes the other. The strip is drawn only for a page that carries more than one structure, and every part of it appears only when it has more than one thing to say — one member and there is no strip at all.

**The strip is the panel's mirror and is built like one.** It takes the full height of the window inside the same inset, but it does not repeat the selected member in a header: that member already names itself in the highlighted row below. Its first line starts with one fixed group of 36px controls — list toggle, Play, previous, next — and no numeric index: the highlighted row already shows the current position. The pane opens underneath that group, so all three controls keep the same position, box and focus whether the surface is open or shut. Playback may append its own controls to that row; it never changes or replaces the list's three landmarks.

**A verb does not stop being the primary one because its surface was collapsed.** A set is usually shut to get the scene back rather than to stop walking it, so the stepper's two arrows remain on the top-left corner beside its own toggle — one row of controls in the popout button's 36px box and 5px gap, whether the pane is present underneath it or not. The scene's own caption gives way to them, since it is the one thing over the canvas that is part of the picture rather than part of the chrome — a caption with a button sitting on its first three characters is a caption nobody can read. **All four arrow keys step the set while the strip is open or closed**, because the list is read down and stepped across: which pair a hand reaches for depends on which of those two it was just looking at, and up is back for the reason the row above is the one before.

**Playback is another persistent verb in that same top-left row, and it stands second.** A page with more than one frame adds one 36px Play button whether or not it also has a selection — and a set of independent structures is a page with more than one frame, so it gets one too. A set and a sequence are two ways of storing frames, taken from the data rather than asked for, and the reader is meant to know about neither: one index, one playhead, one transport over whichever the page holds. Pressing it changes the glyph in place to Stop — the two glyphs are stacked and cross-faded, because the button does not become a different button when it is pressed — and **the list's two arrows go faint and stop taking presses.** A step taken by hand against a running clock is a press the clock takes back a third of a second later, so the arrows are exactly the control that has nothing to do while it runs; the rail is the scrub instead. **They are disabled, not removed.** A control that leaves takes its neighbours' places with it, and a row that is a different row each time play is pressed tells a bigger lie about the interface than a pair of faded glyphs does: the row is a set of landmarks before it is a set of buttons, and the whole point of one fixed corner row is that a pointer, a finger and keyboard focus keep the same targets. So the row is 200px in every state, the caption starts at the same pixel whether the clock is running or not, and the arrows wear the faint weight every other spent control in this interface wears — the same weight they already take at either end of the list.

**The playhead is one fixed track down the left edge of the window, and there is no other.** It stands in the column the row's buttons stand in — `--corner-x` from the edge, `--corner-btn` wide, on their own vertical line — and it is there whether the list is open or shut and whether the frames are playing or stopped. One fact, one indicator, one place: a thing that is always true should not be told by something that appears. **It is a cylinder with a thin bar inside it**: the same 36px box the buttons take, the same pill, the same frost and hairline, so it reads as one more control of that row rather than as a rule drawn down the window. The bar keeps a cap of its own at each end of the tube, and the grip sliding along it is the row's own button drawn small — 20px of white with the same hairline and the same lift, narrow enough that the bar is read either side of it rather than covered by it. **The bar it rides is one width and two weights** — a quarter of the column from end to end, dark above the handle for what has been played and faint below it for what is still ahead — so the position can be taken from the ink as well as from the handle and neither needs a number beside it. The part ahead is drawn in segments, one per gap, in the three weights the step track uses — hairline for a given correspondence, dashed for an inferred one, nothing at all for a cut — so a reaction path reads as a line and a filtered gallery reads as a column of gaps, which is the honest picture of each. Both stand on frost and nothing else: no fill and no edge, so over an empty corner of the canvas there is nothing to see, and a structure passing behind the bars is softened rather than covered. **While the frames run the handle travels rather than ticking** — the playback clock writes its position between frames as a custom property, which is why it moves at the rate the frames do without a render per animation frame. Holding it pauses the clock without ending the play session; letting go resumes from the frame chosen. The list's own scrollbar keeps the right edge and says how far down it is scrolled: two facts, an edge each, and neither borrowing the other's ten pixels. This is the one filling indicator in the interface, and it fills because a playhead is measured — unlike a search, which reports nothing until it answers, so no control fills while one runs. What it gives up is stated rather than hidden: a fixed track cannot follow a scrolling list, so the handle stands at its fraction of the whole rather than beside the row it names, and the row that is showing is the one wearing the fill. The handle travels the track less its own height, the way a slider's does, and the bar runs from its centre at one end to its centre at the other, so a handle at either end wears the bar's own end inside it. **Dragging it follows the pointer exactly** — it is not snapped frame by frame under the finger placing it, the scene follows the nearest frame meanwhile, and letting go settles it onto the frame it chose, on the curve a step by hand takes; under a running clock there is no transition at all, because the clock is already writing the position. **And the head does not lead the picture**: a set is one document per frame and the document arrives before the motion into it, so during that interval the scene is still travelling from the member before and the head says so, rather than reaching the last frame while the last frame's own slide has not begun. The rod runs the full height of the edge and the triad stands beside it rather than under it: the triad's rotation rings fill its whole 112px box, so a box beginning at the rod's own left edge would draw them straight through it. It begins where the rod's column ends, at the gap the corner row keeps, and the two feet are level. The rate button opens a single-setting non-modal popover with a typeable `fps` number and the four rates worth a press under it — 0.5, 1, 1.5 and 3, which is where a reaction path and a trajectory are actually read — and nothing else. A groove to hunt a number along was a drag for a value four presses covers; the limits are the field's own ends, and printing `0.5 fps` and `60 fps` under them describes a control instead of setting it. The popover is an opaque card rather than another frosted one — it opens over the list's own glass as often as over the scene, and frost on frost is two pale layers with nothing between them — and its four rates are pills on that card's ground rather than a segmented track, which at four short numbers reads as a grey slab with figures on it. It opens clear of the playhead rather than centred on its button: it comes down across the top of the rod's own column, so the rod's measured right edge is the floor its left edge may not cross. A press anywhere else shuts it, taken on the way down and before the canvas under it can claim the press.

**Play and its rate are one capsule cut straight down the middle, not two controls.** It is exactly two of the row's button slots and the gap between them — 77px — so it takes a whole number of the row's places rather than a width of its own, and the cut falls dead centre, end to end, as the edge each half actually has. Two equal halves, because this is one control with a division rather than two controls that happen to be adjacent: the verb on the left, the way in to its rate on the right. **The caret is drawn in every state, stopped as well as running**, which is the point of the change: a rate that arrived with the clock could only be set after pressing play, and the moment anybody wants it is before. The frost belongs to the capsule and the halves are transparent inside it, so a press fills its own half — flat against the cut, round at the outer end, because a fill that rounded away from the seam would leave the line floating in ink — and the capsule's edge is an inset hairline rather than a border, or it would stand 38px in a row of 36s. Both glyphs lean towards the cut rather than sitting at the centre of their halves: the verb by a tenth of a half, the caret by half that, since the smaller glyph in the lighter half reads as nearer the seam at the same distance from it. Inside the pane, where the capsule wears no frost and has no edge of its own, the cut is half the height and half the ink: there it is dividing nothing visible, and a full line at full weight reads as a rule drawn between two separate buttons rather than as a seam in one. The caret turns over while its popover is open, so the control says which way the next press will go.

**Playback loops, and there is no control for what happens at the ends.** These frames are read rather than watched through: a band is stepped back and forth between two images of it, and a sequence that halted on its last frame read as a sequence that had broken. `Once` and a reverse loop remain, named as `playback_mode=` in the call that builds the scene — which is where a figure's decisions are written down and version-controlled, and it keeps the transport at the two things a reader reaches for while it runs. This paragraph used to specify a third button cycling `Once → Loop → Reverse loop`, with `Once` as the default; the button was pressed to get to the loop and then never again.

**A row is an identifier and a formula, and the list draws no numbers at all.** A set arrives already sorted by the value the query was about, so position in the list *is* the ranking and a column of figures beside it is the same statement made twice — and made worse the second time, because a number printed with no units and no direction invites a reading of "good" and "bad" that only a clearance can carry. An energy's smallest is its best; a margin's smallest is its worst; the row cannot tell which it has, so it says neither and the mark that used to flag the smallest is gone with it. The values ride in the manifest and go back to Python whole, the notebook that asked for them is where they read properly, and the set's own `repr` states the count, the sort and the extreme in one line for an agent to pass on. The formula is drawn once, the document's own, never a `formula` column beside it in a second spelling, and it is set as a `Formula` — counts subscript, in the sans — because `Al18C28H24O56` is eight things to sort before the compound can be read and Al₁₈C₂₈H₂₄O₅₆ is four. Its order is Hill's, through `cavitas.optimade.hill_formula`, which is what the export writes. The rail down the edge of the list is not a breach of this: it is a position, drawn as a position, and the thing it says — which frame is on screen — is the one fact a row cannot say about the row above it.

**Selecting is the only verb the list has.** It used to be one `Disclosure` per member, each with a chevron that opened the row *and* selected it — a row's other values are worth nothing next to a structure you are not looking at — so the chevron was a second press for a decision the first press had already made, and its cost was a column of marks down the left of every identifier advertising more about nine rows that were not the subject. There is no chevron, and nothing left for one to open onto. The member the cursor names wears a quiet fill on the 6px corner; every other member is the same two lines without it. The fill is a fill and not a border because the strip is already a surface, and a box drawn around a row inside a pane of glass would be a card in a card.

**An identifier is a content hash, and the next thing anybody does with one is paste it.** So every row carries a `CopyButton` in a column of its own, held back until the row is pointed at or focused and standing out on the member that is showing — the panel's rule for an action that belongs to one line. The column is reserved whether the glyph is showing or not, because nothing on a row may move under a pointer crossing it. The member showing writes its hash whole, since a hash truncated cannot be checked against the one it is supposed to be.

**A split page is several scenes on one playhead, and a viewer is unchanged by it.** One frame per pane, laid out as a tree of rows and columns with a one-pixel gutter between them — the canvas with a hairline laid over it, so the line reads as the edge between two pictures rather than a border round either. The list, the rail, the transport and the page's settings button are the page's and move every pane together; a pane with fewer frames holds its last. The rail's strip down the left is nobody's picture, so the pane behind it is wider by exactly that strip and centres its scene in what is left. Each pane is otherwise a viewer: its own panel toggle alone in its top-right, on the row's line; its own caption, in the caption's own glass and type, moved to its bottom right because the row it would follow is the page's. A pane's panel is always the card beside its scene, starting below the page's row where the row stands over it. Where the row would reach a pane's own buttons it puts its frame arrows away first, and only a pane narrower still has its buttons drop under it. **The page's settings are one card**, the rate popover's: which panes are drawn, and which of rotation, pan and zoom the camera link carries between them. A pane whose frames stand further apart on the playhead than the page's draws the steps between them along the playback curve, and says so with a badge in the slot beside its panel toggle. A divider is the gutter with a wider handle that draws the line heavier under the pointer; a double-click on a caption fills the page with that pane.

The orientation gizmo — the triad, the three rotation rings around it and the roll ring outside them — belongs to the scene rather than to the chrome, so it stands on the scene: bottom left of whatever the two surfaces have left of it, beginning where the strip ends at the same gap the strip keeps from the window. It gives way to the list rather than holding a notch out of it, which is the trade the other way round from the one this started as, and the right one: an empty 112px box is a poor reason for a list to lose its bottom edge. The panel, the strip, the shared top-left controls, the scene's caption and the gizmo are the only things drawn over the canvas.

## Agent Prompt Guide

**Quick reference**
- text: canvas-derived primary, muted ≥5.5:1, faint ≥4.5:1
- material: neutral pale-to-charcoal glass; hue arrives through backdrop blur only
- controls: 9999px radius; panel: 24px; card: 6px
- body: 13px/1.5/-0.01em sans; numbers: 12px mono, tabular

**Example component prompts**

1. **Axis triplet**: A `fieldset` with a `legend` in faint ink and its unit in mono. Below it, `grid-cols-3 gap-1.5` of pill text inputs on the raised surface, each with a 10px mono `x`, `y` or `z` at `left-1.5` inside the box, value centred, mono, tabular. Line border, strong line on hover, active ink on focus, adaptive danger when the text does not parse.

2. **Settings row**: `flex min-h-8 items-center justify-between gap-4`. Label left in muted ink, truncated, with the full hint as its `title`. Control right, `shrink-0`. No border, no background, no divider.

3. **Section**: `grid gap-1 py-2`, with an optional 11px faint-ink title above it. Sections are separated by their own padding and nothing else.

4. **Save button**: Full width, pill, filled with strong ink and surface-coloured 13px text, a 13px lucide icon before the label. Exactly one of these per section.

5. **Floating glass**: `rgb(255 255 255 / 0.74)` fill, `1px solid rgb(0 0 0 / 0.09)`, `backdrop-filter: blur(28px) saturate(180%)` — with the `-webkit-` spelling written *first*, because the minifier keeps the prefix set of whichever declaration comes last — and `--glass-lift` for the shadow.

## Similar systems

- **OpenAI** — the palette, the hairline weight, the pill controls and the single black CTA come from here directly.
- **Linear** — the same typographic restraint at small sizes and the same exponential ease on its chrome.
- **Figma / Blender side panels** — the closest relatives for the numeric triplets: type it or drag it, and both are the same number.

## See also

- [`design-rendering.md`](design-rendering.md) — the scene: lighting, the element palette filter, and the depth fog. Read it before changing anything about how an atom is drawn.
