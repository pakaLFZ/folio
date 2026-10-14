# Slides: per-slide overrides of the template

## Demand

- "Slide template can allow overwrite thus freeform as long as typescript
  accept it" *(user, 2026-10-13)*
- "top prioritiy is customized overwrite > slide's own style"
  *(user, 2026-10-13)*, said of backgrounds and read here for every value a
  template gives a slide.
- "Design mechanism so that slide overwrite can be turned to a new slide
  template" *(user, 2026-10-13)*
- Reading, stated to the user: a slide may override anything its template
  defines for it, as long as the result is still a valid value of the same
  TypeScript type the template uses and passes the same schema. The slide's
  override wins over the layout's value.
- "Try use folio with some freeform plots ... Test both templates and none
  template and try push the limit and interate." and "It must be easy to learn
  and use for agents" *(user, 2026-10-13)*. Dogfooding found that a slide
  could not add a slot: on `blank` an extra text box, picture or table was
  refused (`"headline" is not a slot of layout blank (slots: )`), so a one-off
  freeform page was impossible. Reading: an override may also **add** a slot,
  given in full, as a pack layout would declare it.
- This supersedes two older lines: `packs.md`'s Never line against a
  per-slide box move, resize, font or size, and `tables.md`'s Never line
  against free-form per-slide table styling. The concern behind them, that
  per-slide changes recreate "many standards" (2026-10-09), is kept as a
  rule on how overrides look: explicit and visible, never silent.
- A screenshot of the Slide tab, red box around the whole **Overrides**
  section ("10 overrides", its rows, "Reset all to template", "Save as new
  template...", "Apply to template..."), "dont show overwrite at all"
  *(user, 2026-10-13)*. Reading: remove that section from the browser
  entirely. Overrides keep working as data and through `folio override` and
  `folio slide promote` (CLI and HTTP); only resetting, saving as a new
  template and applying to the template lose their browser controls, moved
  to **Never** below. The template manager under it, for inserting slides
  from a layout, stays.

## Behaviour

### The shape

- A slide's root props may carry `overrides`, beside `background`:

  ```json
  {"root": "s", "elements": {"s": {"type": "note-figure", "props": {
    "title": "Results", "note": "...",
    "overrides": {
      "background": "smoke",
      "slots": {
        "note": {"box": [25, 120, 420, 380], "lines": 18, "text": {"size": 16, "color": "#7a0019"}},
        "table:a": {"tableStyle": "minimal", "table": {"headerFill": "#003d7c", "rule": {"width": 1}}}
      }
    }
  }, "children": []}}}
  ```

- Its type is derived from the template's own types (core `overrides.ts`):
  - `slots.<name>`: `DeepPartial<Slot>`, every field a slot declares (`box`,
    `role`, `lines`, `enforce`, `hook`, `style`, `placeholder`, `tableStyle`,
    `below`, ...), plus `text`, a `Partial<TextStyle>` laid over the slot's
    role style (`font`, `size`, `weight`, `italic`, `lineHeight`, `align`,
    `transform`, `color`, `wrap`, `anchor`), and `table`, a
    `DeepPartial<TableStyle>` laid over the table's named style.
    A block slot takes `block`, a `DeepPartial<BlockStyle>` laid over its
    named block style (`blocks.md`), and `text` laid over the style's text.
  - `background`: one of the theme's background names.
  - `decorations`: the layout's decorations list, whole.
- **A text slot's box style** (2026-10-13, for the editor's text boxes:
  "also add text background and border option", `drawing.md`). Any text
  slot, of the pack or added, may carry three slot fields (core
  `boxstyle.ts`, shared with any later role that draws a box):
  - `fill`: the background, a hex, `ink` or one of the pack's `colors`;
    null (the default) for none;
  - `border`: `{"color": C, "width": pt, "dash": "solid" | "dash" | "dot"}`
    (defaults `ink`, 1, solid), drawn inside the box; null for none;
  - `padding`: pt between the box's edge and its text (default 0). The text
    is laid out inside the padded box, and the line limit and overflow are
    counted from it (`lineLimitOf` takes the padding off the height, the
    width check off the width), the same in the browser, `folio check`, the
    PDF and shots.
  The background and border are drawn behind the text as SVG at exact pt in
  every view. A box style on a slot that is not a text slot is refused
  (`overrides.slots.fig:a.fill: only a text slot takes a fill`), and so is a
  colour the pack does not know, by path
  (`overrides.slots.text:a.border.color: "navy" is not a colour: ...`). A
  pack may give a layout's text slot a box style too. A text style's `color`
  may also name a pack colour or `ink`.
- **Added slots.** `slots.<name>` for a name the layout does not have adds a
  slot to this slide alone. It is a full slot definition, the pack's own
  `slotSchema` (at least `role` and `box`; `lines`, `style`, `hook`,
  `placeholder`, `tableStyle`, `below` as in `pack.json`), plus `text` or
  `table` as for any slot. The slide's props then hold its content exactly as
  for a template slot (`"headline": "..."`, `"fig:a": "plot.svg"` or a hook
  call, `"table:a": {...}`), and rendering, measuring and overflow warnings,
  hooks (figure, table, text), the editor's slot selection, comments,
  `folio check` and `folio pdf` treat it as a slot. It draws above the
  layout's own slots, in the order given.
  - Names follow the pack's rules: a figure is `fig:<x>`, a table is
    `table:<x>`, any other role a lower-case name, optionally with `:<x>`
    (`headline`, `label:c`, `body:b`).
  - Removing it is `--clear slots.<name>` (its content prop is then an
    unknown slot, reported as FOLIO-SPEC-001 until it is removed too).
  - `folio prompt` explains added slots with one example command:
    `folio override <deck>/s010 'slots.headline={"role":"title","box":[60,200,840,80]}'`.
- The zod schema is derived from the same zod schemas `pack.json` is
  validated with (defaults removed, every field optional, unknown keys
  refused), so what TypeScript accepts as an override and what the runtime
  accepts agree; a sibling change to the slot schema reaches overrides
  without code here.

### How it is applied

- Deep merge over the layout: objects merge key by key; arrays (`box`,
  `decorations`, a per-column `align`) and scalars replace; `null` replaces.
  The merged layout is parsed again by the pack's layout schema and checked
  by the pack's reference checks (backgrounds, table styles, `below` slots
  and cycles), so an override cannot make a layout the pack would refuse.
- Precedence: override > the slide's `background` prop > the layout. For a
  table: the override's `table` fields > the style named by the slide's
  value `tableStyle` > the slot's `tableStyle` (an override of `tableStyle`
  replaces the slot's).
- Everything downstream reads the merged layout (core `slideLayout`): the
  renderer, the live view's and the print page's measurement, the overflow
  warnings (line limits from the overridden box and size), `folio check`,
  `folio pdf`, flow (`below`), hooked figures (box size and hook), rail
  thumbnails, comment snapshots.

### Refusals

- An invalid override is refused naming its JSON path and what was expected:
  - `overrides.slots.note.box.2: Too small: expected number to be >0`;
  - a name the layout lacks, given without a full slot:
    `overrides.slots.notes.role: "notes" is not a slot of layout note-figure
    (slots: title, subtitle, note, ...); to add it as a new slot give its
    full definition, at least "role" and "box"` (one line per missing field,
    so a misspelt slot is still caught);
  - an added slot with a name its role cannot have:
    `overrides.slots.picture: an added figure slot is named "fig:<x>", like
    "fig:a"; rename it`;
  - `overrides.background: "navy" is not one of the theme's backgrounds
    (known: plain, smoke, khaki, black)`;
  - `overrides.slots.title.text: only a text slot takes text style fields`;
  - `overrides.slots.note.colour: unknown key; ...` for any key the type
    does not have.
- Writes through `folio override`, the HTTP overrides route and any
  `PATCH` that changes `overrides` are refused (422, CLI exit 2) when the
  result is invalid; nothing is written.
- A slide file edited by hand with an invalid override renders with its
  template (no part of the bad override is applied) and carries one
  `FOLIO-SPEC-001` per problem at `/elements/s/props/overrides/...`.

### Agents

- `folio override <deck>/<slide>` prints the slide's overrides, one
  `path = value` line each (`--json` for the object).
- `folio override <deck>/<slide> slots.note.box='[25,120,420,380]'
  background=smoke [--clear slots.note.text] [--clear-all]` sets and clears
  in one revision-checked write. A value is JSON; a value that is not JSON
  is a string. Paths are dotted, slot names keep their colon
  (`slots.table:a.table.headerFill=#003d7c`).
- HTTP: `GET /<deck>/slides/<id>/overrides` gives `{overrides, entries:
  [{path, value}], problems}`; `POST` with `{"set": {path: value},
  "clear": [path], "clearAll": bool}` and an optional `If-Match`.
- `folio_client`: `Slide.overrides`, `Slide.set_overrides({path: value})`,
  `Slide.clear_overrides([path] | None)`.
- `folio prompt` says overrides exist, their shape, that they win over the
  template, and asks agents to prefer the template unless a slide truly
  needs a change.

### From overrides to a template

- **Save as new template.** A slide's layout with its overrides laid over it
  is written as a new layout of the deck's pack, `templates/<pack>/pack.json`,
  under a name the caller gives: kebab-case and not taken, else refused
  naming the clash (`layout "title" already exists in pack lectern (layouts:
  ...); choose another name`, `"Note Figure" is not a layout name: use
  kebab-case, ...`). An optional description replaces the default one (the
  base layout's, plus "Made from a slide's overrides of <layout>.").
  - A `text` override becomes a new role style of the pack, named
    `<layout>-<slot>` (with `-2`, `-3` if taken), the base role style with
    the fields laid over it; the slot names it in `style`. A `table` override
    becomes a new named table style the slot names in `tableStyle`. So every
    look stays defined once in the pack.
  - An added slot becomes a slot of the new layout, with its definition as
    given (and its `text` or `table` turned into named styles as above). A
    new layout that gained slots does not copy the base layout's `usage`
    note, which describes other slots (`canvas` says it has none); add one
    with `folio pack edit`.
  - The slide is then moved onto the new layout with its overrides removed
    (and its `background` prop removed when an override background was
    saved, since the prop would otherwise win), so it renders exactly as
    before; `--keep-slide` leaves the slide as it was.
- **Apply to template.** The overrides are laid into the slide's own layout,
  which changes every slide of that layout in every deck of the workspace
  that uses the pack. It needs an explicit confirmation: `--all-slides` in
  the CLI, `"allSlides": true` over HTTP, a confirm popover in the editor
  that says how many slides change. Without it the refusal names the count
  and the slides. The slide's own overrides are then removed.
- A table override cannot be promoted while the slide's table value picks
  its own `tableStyle` (the pick would win over the new style); the refusal
  says to remove one of them.
- The pack file is edited in its own style: line endings (lectern v2 is
  CRLF), indent and trailing newline kept, and every byte outside the
  members written left as it was. The result is validated as `folio pack
  check` would, and checked to read back as the intended pack, before it is
  written atomically under a lock (`templates/.locks/<pack>`). Only the
  pack's own `pack.json` under the workspace's `templates/` is written.
- **Versions.** The pack keeps its version. A deck pins `name@version`
  exactly (`lectern@1`), and both promotions keep every existing layout name
  and slot, so no pin needs to change; a version bump is kept for changes
  that break slides (a layout or slot removed or renamed).
- The server reloads its packs and tells every deck of that pack (`pack`
  event); the editor fetches the pack again, so the new layout appears in
  the template manager at once.
- Agents: `folio slide promote <deck> <slide> --as NAME [--description D]
  [--keep-slide]`, `folio slide promote <deck> <slide> --into-layout
  --all-slides`; HTTP `POST /<deck>/slides/<id>/promote` with `{"as",
  "description", "keepSlide"}` or `{"intoLayout": true, "allSlides": true}`;
  `GET /<deck>/slides/<id>/overrides` also gives `layoutSlides`, the slides
  that use the layout; `folio_client` `Slide.promote(name, ...)`.

### Editor

- The Slide tab shows no overrides UI: no list of override paths, no reset,
  no "Save as new template..." or "Apply to template..." control. All of it
  moved to **Never** (user, 2026-10-13); the template manager for inserting a
  slide from a layout stays below where the Overrides section used to be.
- Reading, resetting, saving as a new template and applying to the template
  are reached from `folio override`, `folio slide promote` and the HTTP
  routes under "Agents" above; an agent or a shell does what the removed
  section's rows and buttons used to.

## Never

- Silent overrides: an override that changes a slide without showing in the
  Slide tab, in `folio override` and in `folio show`.
- Overrides that bypass validation: a value TypeScript would refuse, an
  unknown key dropped quietly, a merged layout the pack would refuse.
- Concatenating arrays when merging (a box is replaced, never appended to).
- Applying the valid part of an invalid override set.
- An added slot from a partial definition (a box alone): a name the layout
  lacks is either a full slot or a refusal, never a guess at its role.
- A pack-wide or deck-wide override: overrides are per slide; a change for
  every slide belongs in the template.
- Silently editing a shared layout: applying a slide's overrides to its
  layout always names how many slides change and waits for a confirmation.
- Writing outside the pack's folder, or a pack file that would not load.
- Rewriting the whole pack file (its CRLF, indent or number spelling) for a
  promotion.
- ~~An Overrides section in the Slide tab: a list of override rows, "Reset to
  template", "Reset all to template", "Save as new template...", "Apply to
  template..." as browser controls.~~ *(user, 2026-10-13: "dont show
  overwrite at all")* Removed; reading, resetting, saving as a new template
  and applying to the template are CLI/HTTP only now (`folio override`,
  `folio slide promote`), same as before for everything else overrides can
  do. The removed components moved to
  `.archive/web-overrides-20261013/`.

### Boxes set on the slide

- In Edit a slot's box is moved and resized on the slide (`drawing.md`,
  "Layout slots as boxes", user 2026-10-13); each drag end writes
  `slots.<name>.box` (with `below: null` for a slot the layout flows below
  another), and the element menu's "Reset position and size" clears exactly
  those paths. The write is an ordinary override write, validated and
  revision-checked, and everything downstream reads it as above.

## Status

- On-slide editing covers a slot's box only; no font controls.
- No browser UI for listing overrides or promoting them; the one reset is a
  slot's box, from its element menu.

## Where it lives

`packages/core/src/overrides.ts` (types, schema, merge, `slideLayout`,
problems), `overridepaths.ts` (path edits), `promote.ts` (pack edits), `theme.ts` (`textSlots` reads `text`), `tables.ts`
(`tableStyleOf` reads `table`), `catalog.ts` (prompt), `slidecheck.ts`;
`packages/server/src/routes-overrides.ts`, `promote.ts`, `packedit.ts`,
`checks.ts`;
`packages/cli/src/overridecmd.ts`; `packages/web/src/slide/LayoutView.tsx`
(the merged layout still renders); `python/folio_client/client.py`.
The removed browser UI is archived, not deleted:
`.archive/web-overrides-20261013/OverridesSection.tsx`, `PromoteActions.tsx`.

## Checks

`packages/core/test/overrides.test.ts` (deep merge, added slots: accepted
in full, refused without role or box and by name, their content valid,
promoted into a new layout, arrays replace,
refusals by path, precedence over the layout background and the table
style, line limit and overflow from the overridden box, path edits,
table overrides baked into named styles, promote refusals);
`packages/server/test/promote.test.ts` (pack file edited in its own CRLF
style, a new layout the slide renders identically on, name clashes refused
with nothing written, apply refused without confirmation and then changing
every slide);
`e2e/overrides.mjs` (a box override set through the HTTP API moves the slot
in the page, the overflow warning recomputes, clearing it through the API
returns the note to the template's position, an invalid override is refused
by path; "Save as new template" over HTTP adds a layout the template manager
shows at once and the slide keeps its geometry; "Apply to template" over
HTTP says how many slides change and then changes them);
`e2e/freeform.mjs` (a deck made without `--template` on the built-in `plain`
pack; slots added to a `canvas` slide by `folio override` render in the page
at their boxes, with text, an SVG figure and a table; an added text slot past
its lines is reported; a partial added slot is refused naming the field).
