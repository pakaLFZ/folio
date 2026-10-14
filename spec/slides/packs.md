# Slides: portable template packs

## Demand

- "A framework that can allow me to create page templates, and export to pdf,
  and better allow me to see changes in real time ... Aim it like ppt
  alternative but designed for agent." *(user)*
- Templates are the template manager of `deliverables/CLAUDE.md`, that is,
  slidekit's kind catalog: one standard defined once, named profiles for
  exceptions. *(user)*
- "the deck template, of course, should be portable and made to be
  generalized". A pack's look is one theme among many, never baked into
  folio. *(user, 2026-10-12)*
- A pptx importer is a later step and needs the user's go-ahead; it was asked
  for on 2026-10-13 ("Add either help or tool so thag future agent can easily
  convert other ppt to templates", user) and is `pack-tools.md`.
- Build on json-render core; learn its style. *(user)*
- "top prioritiy is customized overwrite > slide's own style. there should be
  no second global backgroundstyle" *(user, 2026-10-13)*: every layout names
  its own background; a slide's own `background` prop overrides it; there is
  no pack-wide default.
- "Test both templates and none template" and "It must be easy to learn and
  use for agents" *(user, 2026-10-13)*. Dogfooding found that a deck could
  not exist without a template: `folio init-deck <dir>` without
  `--template` was refused, so an agent that just wanted slides had to write
  a whole pack first. Reading: folio ships one neutral pack, `plain`, and a
  deck made without a template uses it.
- Tables and the `below` flow are their own topic, `tables.md`.
- Block styles (`blocks`: named text boxes and code blocks, the way a
  user adds their own "component" to a pack) are their own topic,
  `blocks.md` (user, 2026-10-13).
- Per-slide overrides of anything a layout gives a slide are their own topic,
  `overrides.md`, as is turning them into a new layout or into the slide's
  own layout ("Design mechanism so that slide overwrite can be turned to a
  new slide template", user, 2026-10-13). Such a change keeps the pack's
  version, so exact pins such as `lectern@1` stay valid.
- Importing a pptx, merging packs, scripted edits, export as a zip or a
  pptx, the version rule and the conversion guide are their own topic,
  `pack-tools.md`.
- "edit so that for deck template there is this option of a note explain when
  and how to use the template" *(user, 2026-10-12)*
- "empty template should have sample text, like ppt" *(user, 2026-10-12)*
- Of the Slide tab's layout cards: "add a tempalte manager here, e.g. add 2
  collapsable, 1 is tempalte bank (template groups), 2 is individual template
  slides" *(user, 2026-10-13)*
- On a screenshot of the template manager, the counts at the right of both
  section headers and the "3 layouts" line struck in red, the "In use" tag
  circled in blue: "delete red labelled part, and change in use to a check
  mark"; then "and get rid of the divider". *(user, 2026-10-13)*
- Both sections collapsed, the two headers circled: "consider reduce a bit
  margin?" *(user, 2026-10-13)*
- An agent building a real deck on Windows asked for "`folio layouts <deck>`
  listing slots and boxes" *(user, 2026-10-13, relayed)*: `folio prompt`
  printed a box only for figure slots, none for text slots, and repeated the
  line-plot hook's inputs schema in every figure slot (62 KB for `lectern`),
  so the page geometry could not be seen at a glance.

## Behaviour

- A pack is one folder, `templates/<pack>/`: `pack.json` (theme and layouts),
  its fonts, images and hooks. Copied to another machine it works unchanged:
  no absolute path, no machine, no project vocabulary in folio itself.
- Three layers: the **theme** (canvas in pt, fonts, text roles, backgrounds),
  the **layout** (slot boxes against the theme's canvas), the **slide**
  (content only). A slide names its layout; a deck names its pack and version
  (`"template": "lectern@1"`).
- A slot has a box `[x, y, w, h]` in pt, a role (`title`, `subtitle`, `body`,
  `label`, `caption`, `note`, `figure`, `table`, `shape`, `block`; tables in `tables.md`, shapes in `shapes.md`, blocks in `blocks.md`) and, for text, a line limit (declared,
  or the whole lines its box holds). The role fixes font, size, weight, line
  height, alignment, anchor, case and colour; a named style profile (`style`)
  covers an exception such as a cover title, and is still defined once in the
  pack.
- A slot may carry an optional `placeholder`: the sample text the editor
  shows while the slot is empty, as PowerPoint's "Click to add title", but
  written as a hint of what belongs there ("One sentence on what the three
  figures show"). It is a non-empty string of at most 200 characters; a bad
  one is refused with its path and the fix
  (`layouts.note-figure.slots.caption.placeholder: placeholder is empty:
  write the sample text, or remove the field to show the role's default`).
  A pack without placeholders stays valid. A slot without one shows the
  default of its role: title "Title", subtitle "Subtitle", body and note
  "Text", label "Label", caption "Caption", figure "Figure"; a slot named
  `author` shows "Author" (core `placeholderOf`). `folio prompt` prints a
  declared placeholder after the slot (`Placeholder: "..."`) as a hint for
  agents; defaults are not printed. How the editor shows it is in
  `editing.md`.
- `lectern` declares a placeholder for every slot of its layouts.
- Background variants are part of the theme (`plain`, `smoke`, `khaki`,
  `black` in `lectern`); a slide switches variant, never paints a fill.
  Decorations (marks, a wordmark) belong to a layout and may be limited to
  some variants.
- ~~The template decides the background: a slide without a `background` prop
  renders with the pack's `defaultBackground`.~~ *Superseded (user,
  2026-10-13: "there should be no second global backgroundstyle").*
- **Layout background.** Every layout declares `"background": "<name>"`, one
  of the theme's `backgrounds`. A slide's explicit `background` prop wins over
  its layout's; nothing else decides (core `backgroundOf(pack, layout,
  requested)`; an unknown requested name falls back to the layout's). The ink
  follows the variant chosen: on `black` the ink is white and the layouts'
  `backgrounds`-limited decorations switch to the white marks.
- A pack that still carries `defaultBackground` is refused:
  `defaultBackground: is no longer read: there is no pack-wide background.
  Remove it and give every layout "background": "<name>"`. A layout without a
  background, or with an unknown name, is refused naming the layout and the
  known names: `layouts.title.background: is missing; every layout names its
  background: add "background": "<name>" with one of the theme's backgrounds
  (known: plain, smoke, khaki, black)`, `layouts.title.background: "navy" is
  not one of the theme's backgrounds (known: ...)`.
- The editor offers no background control ("the background should be part of
  the deck template", user, 2026-10-12); the optional per-slide `background`
  prop remains in the slide schema for agents. `folio prompt` prints each
  layout's `Background:` line.
- The pack's `rules` hold its house rules (character limits by role,
  guidance such as the passive voice); folio's core holds none.
- A layout may declare `aliases` (`{"body": "note"}`) so a slide written for
  another pack renders, checks and draws hooks under this pack's slot names.
- The json-render catalog and `catalog.prompt()` are generated from the pack
  at load time; a new pack or layout needs no code. `folio prompt <deck>`
  prints the agent instructions.
- **Usage note.** A layout, and the pack itself, may carry an optional
  `usage`: `{"when": "...", "how": "..."}`. `when` is one plain sentence on
  when to choose it; `how` (optional) says which slot holds what, line limits
  and figure hooks. Plain sentences, no markup. Two fields rather than one
  string, because an agent choosing a layout needs only "when", and an agent
  filling a slide needs "how" as well. The name is `usage`, not
  `note`, because `note` is already a role and a slot name.
  - A pack without notes stays valid. A wrong shape is refused with the path
    and the fix, e.g. `layouts.title.usage: must be an object {"when": "...",
    "how": "..."}`, `layouts.title.usage.when: is empty; say in one plain
    sentence when to choose this`, `layouts.title.usage: unknown key "note";
    a usage note holds only "when" and "how"`.
  - Where it shows: `folio prompt` prints `When:` and `How:` lines between a
    layout's description and its slots, and the pack's own note under the
    first line. Notes are for agents only: the editor shows neither a
    layout's note nor the pack's, on its cards or as a tooltip (see
    `editing.md`).
  - It lives in `pack.json`, so `folio pack export` and `import`, which copy
    the folder, carry it unchanged; `folio pack schema` describes it.
  - Example (`lectern`, `title`):
    `"usage": {"when": "The opening slide of a talk, or a break that starts a
    new part of it.", "how": "title holds the talk or section name in at most
    two lines; subtitle adds one qualifying phrase and may stay empty; author
    names the speaker, with the affiliation or date on a second line. ..."}`
- `folio pack schema` prints the JSON Schema of `pack.json`; `folio pack check
  <dir>` validates a folder and names every bad path; `folio pack export
  <pack|deck>` copies a pack (or the pack a deck uses), and `--zip`/`--pptx`
  bundle it; `folio pack import <dir|git-url>` validates and installs one,
  moving a replaced pack to `templates/.archive/`; `folio pack import
  <file.pptx> --name <pack>` drafts a new pack from a pptx and never
  replaces one (`pack-tools.md`).
- `lectern` (version 1, 2026-10-14) is the bundled example pack, an
  original design with no institution or logo: 960 x 540 pt, IBM Plex Sans
  for text and tables, IBM Plex Serif SemiBold for titles, IBM Plex Mono for
  code (all SIL OFL 1.1, `fonts/LICENSE-IBMPlex.txt`). Titles sit over a
  hairline rule with a short accent segment. It holds 27 layouts, each with
  its own background and a usage note: `title`, `separator` and `closing`
  (both `black`), `note-figure`, `note-wide-figure`, `three-figures`,
  `profile-pictures`, `plot-table`, `plot-table-below`, `plot-note`,
  `summary-table`, `title-classic`, `section-header`, `agenda`, `title-only`,
  `title-and-content`, `two-content`, `three-content`,
  `three-images-captions`, `large-text`, `title-text-content`,
  `content-four-images`, `content-nine-images`, `text-and-content`,
  `content-and-text`, `end`, `blank`. One table style, `default`.

### `folio layouts`: every slot box in one table

- `folio layouts <deck> [--json] [LAYOUT ...]` prints the deck's pack's
  layouts (all, or the named ones, in the pack's order), compactly:
  - once at the top: the pack and version, the slide size in pt, that boxes
    are `[x, y, w, h]` in pt, and that `folio hook show <pack>/<hook>` gives a
    hook's inputs;
  - per layout: its name and one-line description, its background, then one
    row per slot: name, role, box, and what limits it. Text slots: font size,
    line limit, the pack's character limit for the role, and a hook that
    rewrites the text. Tables: the table style's size, the rows of one line
    that fit and the style. Blocks: the block style. Figures: `file or hook
    <name>` (the hook's name only, never its schema). A slot that flows
    `below` another says so as the layout states it (`below table:b +12`).
- The boxes are the layout's own, as the server resolves them (the same
  numbers `folio box` starts from); a flowed slot's top moves with what is
  above it, which the `below` note says.
- `--json` prints the same as one object: `{"pack", "slide": {"w", "h",
  "unit"}, "layouts": [{"name", "description", "background", "slots":
  [{"name", "role", "box", ...}]}]}`, the layouts an array.
- A layout name the pack lacks is refused, listing the pack's layouts.
- `folio prompt` says once that `folio layouts <deck>` lists every layout's
  slot boxes in one table.

### The built-in `plain` pack and decks without a template

- folio ships one built-in pack, `plain` (version 1), in
  `packages/server/packs/plain/`: 16:9, 960 x 540 pt, Liberation Sans (OFL,
  the same files as `lectern`), black on white (`plain`) or white on near
  black (`dark`), one table style `default`, the roles `title`, `subtitle`,
  `body`, `label`, `caption`, `note` (plus `cover-title` and `section-title`
  profiles), and no house rules beyond plain guidance. It is neutral: no
  wordmark, no logo, no project vocabulary.
- Its layouts, each with a `usage` note and placeholders: `canvas` (no
  slots; a freeform page built from slots added by overrides, its `how`
  giving the command), `title`, `section`, `title-and-content`,
  `two-columns`, `figure` (one figure and a caption), `figure-and-text`,
  `table`.
- **Where it lives, and how a workspace gets it.** A workspace's packs are
  the folders of its `templates/`. A built-in pack is copied into
  `templates/<name>/` the first time a deck asks for it, and from then on it
  is an ordinary pack of the workspace: it travels with the workspace, can
  be edited, merged, exported, and promoted into (`folio slide promote`
  writes only under `templates/`, never into folio's own package). A
  workspace that already has a `templates/plain/` keeps its own; it is never
  overwritten.
  - `folio init-deck <dir>` without `--template` uses `plain@1`, installs it
    when missing, and says so: `no --template given: using the built-in pack
    plain@1 (installed into templates/plain)`, then the usual `created ...`
    line and the hint `folio prompt <dir>` for the layouts.
  - `folio init-deck <dir> --template plain@1` installs it the same way.
    Any other missing pack is refused as before, listing the installed and
    built-in packs.
- Rejected: resolving built-in packs from the package at run time, without
  a copy. Promotion and `folio pack edit` write the pack's folder, which
  would then be folio's own install; a copy keeps every pack a workspace
  folder.

### The template manager (the Slide tab)

- The Slide tab is a template manager with two collapsible sections, in this
  order (*superseded 2026-10-13: it used to sit under a Figure section when
  a figure slot was selected*):
  1. **Template bank**: the template groups, that is every pack installed in
     the workspace's `templates/` folder, one row each: a small live preview
     of its first layout and its name. The deck's own pack carries a check
     mark (Lucide `Check`, 14 px, ink, named "In use" for assistive
     technology and as its tooltip). Pressing a row selects that group for
     the second section (the row takes the ash fill, `aria-pressed`); it
     never changes the deck's pack and writes nothing.
  2. **Templates**: the layouts of the selected group. For the deck's own
     pack these are the layout cards of `editing.md`, unchanged: pressing one
     inserts a slide of that layout after the current slide. For any other
     group they are the same previews drawn with that pack's own fonts and
     backgrounds, but not buttons, and one line above them says that slides
     use this deck's pack, naming it.
- The selected group starts as the deck's pack. A group that disappears from
  `templates/` falls back to the deck's pack.
- Each section has a header row: a chevron (Lucide `ChevronRight`, turned a
  quarter down when open) and the title, nothing else. The
  whole row is one button with `aria-expanded`. Both sections are open by
  default; the two sections are separated by spacing alone, with no rule
  between them or under a header. Spacing is compact: header rows are 28 px
  with 4 px between sections, so two collapsed headers sit 32 px apart; an
  open section's content starts 6 px under its header and leaves 8 px before
  the next header (12 px with the gap). That spacing lives inside the folding
  body, so a collapsed section leaves nothing but its header row. The first
  header's top stays one `--panel-header-pad` below the panel's header row,
  level with the rail's first thumbnail. This browser remembers each one's state (`localStorage`
  `folio.templateManager`, read and written inside try/catch, so a blocked
  storage just means both open).
- Collapsing and opening animate the height over 150 ms with the chrome's
  ease; with `prefers-reduced-motion` the change is instant. A collapsed
  section's content is inert (no focus, not read out).
- Sizes and colours are the panel's: header type is the section title (11 px,
  faint ink), rows and cards use the card radius, `hover:bg-whisper`,
  selected `bg-ash`, icons 14 px; dark mode comes from the same tokens.
- The list comes from `GET /api/packs`: `{"packs": [<pack>, ...]}`, every
  loaded pack in full (theme, canvas, layouts), sorted by name, read-only.
  Packs that fail to load are not listed (`folio pack check` names their
  problems). Until the list arrives, or if it fails, the bank shows the
  deck's pack alone.

## Never

- A second, pack-wide background fallback (`defaultBackground`) beside the
  layouts' own. *(user, 2026-10-13)*
- ~~A per-slide box move, resize, font or size. Geometry belongs to the
  template; changing it changes every slide that uses it. A per-slide override
  recreates the "many standards" problem the user rejected on 2026-10-09.~~
  *Superseded (user, 2026-10-13: "Slide template can allow overwrite thus
  freeform as long as typescript accept it"): a slide may override any value
  of its layout, validated by the layout's own types (`overrides.md`). The
  "many standards" concern stays as a rule: an override is explicit and
  visible, never silent.*
- Theme values compiled into folio (no built-in canvas, font or colour). The
  built-in `plain` pack is a pack folder like any other, not code.
- Deck-specific code in a pack. ~~A pptx importer before the user says so~~
  *(asked for 2026-10-13; `pack-tools.md`)*.
- Placeholder text saved into the slide: a placeholder lives in the pack and
  is shown by the editor; it is never slide content.
- Placeholders in View mode or the PDF (see `editing.md`).
- Selecting a group in the template bank changing the deck's pack, or
  inserting a slide of another pack's layout: a deck names one pack, and a
  slide of a layout that pack lacks would not render. Switching a deck's
  pack is a separate decision the user has not asked for.
- A count at the right of a section header, an "N layouts" line under a
  pack's name, an "In use" text tag, and a divider line between the
  sections or under a header (all removed 2026-10-13 at the user's request).
- Section padding outside the folding body: collapsed headers then sat 44 px
  apart and read as loose (2026-10-13).
- Printing a hook's inputs schema per slot in `folio layouts`: it is what
  made `folio prompt` 62 KB; `folio hook show` prints it once.
- A template manager that hides the layout cards behind a dialog or a second
  click: the deck's own layouts stay one press from a new slide.

## Status

- The pptx importer is built: `folio pack import
  <file.pptx> --name <pack>`, with merge, edit, export and the guide
  (`pack-tools.md`, 2026-10-13). `lectern` v2 itself stays the hand-made
  pack; the importer reproduces its boxes but not its judgement calls.

## Where it lives

`packages/core/src/pack.ts`, `theme.ts`, `catalog.ts`, `schema.ts`
(`resolveAliases`), `templates/lectern/`, `packages/cli/src/packcmds.ts`,
`packages/web/src/slide/LayoutView.tsx`, `packages/server/src/routes-packs.ts`
(`GET /api/packs`), `packages/web/src/editor/TemplateManager.tsx`,
`LayoutCards.tsx`; `folio layouts`: `packages/core/src/layoutsheet.ts`
(rows as values), `packages/cli/src/layoutscmd.ts` (printing); the built-in pack `packages/server/packs/plain/` and its
installer `packages/server/src/builtin.ts`, used by `packages/cli/src/deckcmds.ts`.

## Checks

`packages/core/test/tables.test.ts` (layout background refusals and
precedence), `packages/core/test/core.test.ts` (pack load, line limits, usage note
loaded, old pack without notes valid, wrong shapes refused by path,
placeholder field, defaults and refusals, golden `catalog.prompt()` with the
notes and placeholders), `pure.test.ts` (aliases), `folio pack check templates/lectern`,
`packages/server/test/builtin.test.ts` (`plain` loads as a valid pack with a
usage note on every layout; installed once, never over a workspace's own),
`e2e/freeform.mjs` (a deck made without `--template`),
`packages/cli/test/layouts.test.ts` (`folio layouts` on `lectern`: slide size
once, every slot's box, figures as `file or hook`, no schema, `below` as
stated, `--json`, a named layout, an unknown one refused),
`packages/server/test/packs.test.ts` (`GET /api/packs` lists every loaded pack
by name with canvas and layouts), `e2e/template-manager.mjs` (both sections
open, headers holding only their titles; a second pack listed, the "In use"
check on the deck's own and no "layouts" text;
selecting it shows its layouts as previews with the note and no insert
button, and writes nothing; collapsing hides and is remembered after a
reload; the deck's cards still insert).
