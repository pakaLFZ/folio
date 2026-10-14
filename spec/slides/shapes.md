# Slides: shapes (rectangles, ellipses, circles, arrows, lines)

## Demand

- "Enable shapes insertion like arrows and sqiare and circle"
  *(user, 2026-10-13)*
- Standing: "It must be easy to learn and use for agents" and "Slide template
  can allow overwrite thus freeform as long as typescript accept it"
  *(user, 2026-10-13)*.
- Reading, stated for the work: a shape is a slot of a new role, `shape`, so
  that a pack layout may declare one and a slide may add one by override
  exactly as it adds a text box (`overrides.md`); its look comes from named
  shape styles in the pack, as tables take theirs (`tables.md`), and the
  slide's own fields win over the style. The editor's drawing tools are a
  sibling feature that writes this same shape.

## Behaviour

### The slot and its content

- A shape slot is `{"role": "shape", "box": [x, y, w, h]}`, named
  `shape:<x>` (`shape:a`). A layout may declare one; a slide adds one by
  override:
  `folio override <deck>/s010 'slots.shape:a={"role":"shape","box":[100,120,200,80]}'`.
  The slot's optional `style` names one of the pack's shape styles.
- The slide's prop of the slot is the shape:
  `{"kind": "rect"|"ellipse"|"arrow"|"line", "style"?: NAME, "fill"?: COLOR|null,
  "stroke"?: COLOR|null, "strokeWidth"?: pt, "dash"?: "solid"|"dash"|"dot",
  "radius"?: pt, "heads"?: "end"|"start"|"both"|"none", "from"?: [x, y],
  "to"?: [x, y], "text"?: string}`.
  - A **circle** is an `ellipse` in a square box.
  - `radius` rounds a `rect`'s corners. `heads` is for an `arrow` (default
    `end`). `from` and `to` are for an `arrow` or a `line`, in pt relative to
    the box's top-left; they default to the left-middle and the right-middle
    of the box. `text` is for a `rect` or an `ellipse`.
  - A field that does not fit the kind (`heads` on a rect, `text` on an
    arrow, `radius` on an ellipse) is refused naming the kind's fields.
- A colour is a hex (`#c00`, `#cc0000`, `#cc000080`), `ink` (the slide
  background's ink), or a name from the pack's `colors`. `null` draws no fill
  or no stroke.
- An empty shape slot draws nothing; in Edit mode it shows a dashed outline
  and the placeholder "Shape".

### The pack

- `colors`: an optional record of named colours, `{"red": "#FF0000"}`; a
  name is lower-case letters, digits and hyphens, a value a hex; `ink` is
  reserved.
- `shapes`: an optional record of named shape styles,
  `{NAME: {"description"?, "fill": COLOR|null, "stroke": COLOR|null,
  "strokeWidth": pt, "dash", "radius": pt, "text": {role style fields}}}`.
  Every field has a default (fill none, stroke `ink`, 1.5 pt, solid, square
  corners), so `{}` is folio's neutral style.
- `default` is implied when the pack does not define it: folio's own neutral
  style, no fill, an `ink` stroke of 1.5 pt.
- Precedence: the slide's fields > the style named by the slide's `style` >
  the style named by the slot's `style` > `default`.
- Pack load refuses a shape style whose colour is not a hex, `ink` or a pack
  colour, a shape slot not named `shape:<x>`, a shape slot's `style` that
  names no shape style, and a `hook` on a shape slot, each naming its path
  and the fix.
- `plain` and `lectern` ship `default` and `accent` styles and a few named
  colours (`lectern`'s: magenta,
  red, orange, green). Adding them keeps each pack's version.

### Drawing

- The shape is SVG at exact pt inside its box, the same in the live view,
  thumbnails, `folio shot` and `folio pdf`.
- A `rect` and an `ellipse` keep their stroke inside the box (the outer edge
  of the stroke is the box edge). A `line` and an `arrow` run from `from` to
  `to`, on the point.
- An arrow head is a filled triangle in the stroke colour whose length is
  `4 + 3 x strokeWidth` pt and width 0.8 of its length, so it scales with
  the stroke; the line stops at the head's base.
- `dash` draws dashes of 3 x the stroke width with gaps of 2 x; `dot` draws
  round dots 2 x the stroke width apart.

### Text inside a shape

- `text` on a `rect` or an `ellipse` is centred both ways, inline markup as
  in text slots (`**bold**`, `X_{sub}`, `X^{sup}`).
- Its style is the pack's `body` role (the first role when there is none),
  centred and anchored in the middle, then the shape style's `text`, then
  the slot's `text` override (`overrides.slots.shape:a.text`).
- It sits in the shape's text box: a rect's box inset by 6 pt plus the
  stroke width; an ellipse's inscribed rectangle (w / sqrt 2 by h / sqrt 2,
  centred).
- It is measured as a text slot is: its line limit is the whole lines the
  text box holds, and more lines are `FOLIO-OVF-001` naming the slot. Text
  never shrinks.

### Agents

- `folio shape add <deck>/<id> rect|ellipse|circle|arrow|line --box x,y,w,h
  [--from x,y --to x,y] [--fill C] [--stroke C] [--stroke-width PT]
  [--dash D] [--heads H] [--radius PT] [--text T] [--style S]` adds the next
  free `shape:<letter>` slot and its content in one revision-checked write
  and prints the slot name.
  - `circle` takes `--box x,y,d` or a square box; another box is refused.
  - An `arrow` or a `line` given only `--from` and `--to` takes them in
    slide coordinates and gets a box round them (12 pt margin); with `--box`
    they are relative to the box.
  - A refused shape writes nothing and prints each problem by path.
- `folio shape rm <deck>/<id> shape:a` removes the added slot and its
  content in one write; a shape slot of the layout keeps its slot and loses
  its content.
- `folio prompt` explains shapes with one example command and lists the
  pack's shape styles and colours.

## Never

- A shape drawn as a picture file: shapes are vector, in the page.
- Text in a shape that shrinks to fit.
- A shape's look kept only in the slide when the pack could name it: the
  style is the pack's, the slide's fields are explicit and visible.
- Colours by CSS name (`red`) outside the pack's palette: a name means the
  pack's colour, so a pack changes its red in one place.

## Status

- The editor's tools to draw, move, resize and delete shapes are a sibling
  feature (shape editor); it writes the content above through the existing
  slide and override routes.
- `folio pack export --pptx` and `pack merge` do not carry shape styles or
  colours yet.
- No connectors that follow a shape when it moves.

## Where it lives

`packages/core/src/pack.ts` (`shape` role, `colors`, `shapes`, refusals),
`colors.ts`, `shapes.ts` (content schema, resolved shape, text
limits, next name), `shapegeometry.ts` (arrow heads, dashes, text box),
`shapeedit.ts` (the add and remove patches), `catalog.ts` (prompt),
`overflow.ts`; `packages/server/src/checks.ts`, `comments/service.ts` (a
comment's snapshot of a shape); `packages/web/src/slide/ShapeSlot.tsx`,
`LayoutView.tsx`; `packages/cli/src/shapecmd.ts`;
`packages/server/packs/plain/pack.json`, `templates/lectern/pack.json`.

## Checks

`packages/core/test/shapes.test.ts` (content refusals by path, style
precedence, colours from the palette, pack refusals, arrow geometry, text
box and line limit, overflow of shape text, next free name, prompt lines);
`e2e/shapes.mjs` (`folio shape add` for a rect with text, a circle and an
arrow on a `plain` deck; `folio shot` shows the fill colour at the rect's
centre and the stroke colour on the arrow; a rect whose text is too long is
`FOLIO-OVF-001`; a bad colour is refused; `folio shape rm` removes it).
