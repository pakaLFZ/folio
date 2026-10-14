# Slides: pack tools (import a pptx, merge, edit, export, the guide)

## Demand

- "Add either help or tool so thag future agent can easily convert other ppt
  to templates and eg merge edit or export template" *(user, 2026-10-13)*
- Read as: both. Tools do the mechanical part (reading a pptx, copying
  layouts between packs, scripted edits, bundling); a written guide tells the
  agent what only it can judge. Every refusal names what is missing and the
  command that fixes it. *(relayed brief, 2026-10-13)*
- This is the go-ahead for the pptx importer, which `packs.md`
  held back until the user asked.
- "It must be easy to learn and use for agents" *(user, 2026-10-13)*; standing
  rule: every refusal names what was missing and how to fix it.
- Dogfooding a minimal hand-written `pack.json` against `folio pack check`
  found refusals that name only the zod type, not the shape:
  `canvas: Invalid input: expected object, received undefined`. An agent
  cannot tell what a canvas, a role or a background looks like from that.
  Every top-level and nested field's refusal now names the expected shape
  with a tiny concrete example instead.

## Behaviour

### Usage

```
folio pack guide
folio pack import <file.pptx> --name <pack> [--from-slides]
folio pack import <dir|git-url>
folio pack merge <src> <dst> [--layouts a,b] [--rename a=b] [--rename <kind>.<name>=<new>]
folio pack edit <pack> layout add <name> (--from <layout> | --json <file|->)
folio pack edit <pack> layout rename <old> <new>
folio pack edit <pack> layout remove <name>
folio pack edit <pack> set <path>=<json>
folio pack export <pack|deck> [--out DIR] [--zip out.zip] [--pptx out.pptx]
folio pack check <dir>
folio pack schema
```

A `<pack>` (and `<src>`, `<dst>`) is a pack name under the workspace's
`templates/`, or a path to a pack folder. `folio --help` carries one line
pointing to `folio pack guide`.

### The guide

- `folio pack guide` prints `docs/pack-guide.md`: the steps of a conversion
  (import, read the report, decide roles, measure self-made kinds from live
  slides, a background per layout, table styles, fonts and their licences,
  hooks, check, render a sample deck, compare with the pptx), the calls only
  an agent can make, and the lessons of the hand-made `lectern` v2: the cover
  overriding the master geometry, the separator black through its layout
  background, the wordmark font, and the CRLF ending of its `pack.json`.

### Writing `pack.json` by hand

- Every top-level and nested field of `pack.json` that a zod type error would
  otherwise describe only abstractly (`expected object, received undefined`)
  instead names the shape with a tiny concrete example: `canvas` ->
  `is missing; write "canvas": {"w": 960, "h": 540, "unit": "pt"}`; `roles` ->
  a role style's shape (`{"size": 26, "lineHeight": 1.2, "weight": 700}`);
  `backgrounds` -> a background's shape (`{"fill": "#ffffff", "ink":
  "#111111"}`); a slot's `box` -> `[x, y, w, h] in pt`; a slot, a layout, a
  table style, a decoration and a font entry each give their own minimal
  example the same way.
- An unknown role on a slot lists the pack's fixed roles (`title, subtitle,
  body, label, caption, note, figure, table`); a layout's background not in
  `backgrounds` lists the ones the pack has (already true before this
  change, kept).
- `folio pack check <dir>` on success prints one line counting layouts and
  roles: `dark@1 is a valid pack: 1 layout, 1 role`.
- `folio pack guide` carries a "Write a pack from scratch" section: the
  smallest `pack.json` that passes `folio pack check` (about 15 lines: name,
  version, canvas, one role, one background, one layout with one slot), so
  an agent with no pptx can still start a pack from nothing.

### Import a pptx

- `folio pack import <file.pptx> --name <pack>` reads the slide master and
  its layouts and writes a draft pack folder `templates/<pack>/`: `pack.json`,
  `images/`, `fonts/` when the pptx embeds a plain TrueType or OpenType font,
  and `import-report.md`. The pack is version 1.
- What it reads, per layout:
  - the canvas in pt (`p:sldSz`, 12700 EMU per pt, rounded to 0.1 pt);
  - the theme's fonts and colours, colour maps and their modifiers
    (`lumMod`, `lumOff`, `tint`, `shade`);
  - every text placeholder, by its type: `title` and `ctrTitle` become
    `title`, `subTitle` becomes `subtitle`, `body` and content placeholders
    become `body`. The text style is followed through the layout, the master
    placeholder and the master's text styles: size, weight, italic, colour,
    font, alignment, anchor, upper case, line spacing (a percentage times 1.2
    is the line height, as `lectern` was measured) and wrap. The box is the
    placeholder's, less its insets;
  - picture placeholders become figure slots (`fig:a`, `fig:b`, ...); table
    placeholders become table slots (`table:a`) with a style;
  - the background fill becomes a named background with a fill and an ink
    (white or black, whichever reads on the fill; the theme's dark and light
    colours when they read);
  - pictures that are not placeholders (logos, marks) become decorations,
    their files copied into `images/`; a text box that is not a placeholder
    (a wordmark) becomes a text decoration with its own style.
- **Variants.** Layouts named `<Base> <Word>` with the same placeholders as a
  layout named `<Base>` are one layout with background variants: the base
  layout keeps its own background, each `<Word>` becomes a background named
  in lower case (`Title Slide Black` gives `black`), and decorations that
  differ between variants are limited to their backgrounds (black marks on
  `plain`, white marks on `black`); an image used only on a variant is
  named after it (`logo-on-black.svg`). The base's own background is
  `plain` when it is white, otherwise the name a background of that colour
  already has, otherwise `bg-<hex>`.
- **Roles and styles.** Each role's style is the one most of its slots share;
  a slot that differs names a style in `roles` (`title-64-bold-bottom`), defined
  once and shared by every slot that looks the same.
- **Table styles.** The pptx's table styles (`ppt/tableStyles.xml`) become
  named table styles: the header row's fill, ink and weight from `firstRow`,
  body fill and banding from `wholeTbl` and `band1H`, the outer border, row
  and column rules from the borders, cell padding from PowerPoint's defaults.
  The presentation's default style is named `default`; the others are named
  from their PowerPoint names (`medium-style-2-accent-1`).
- **Slot names from shape names.** A shape already named like a folio slot
  (`label:a`, `fig:b`, `table:a`, `note`, `caption`) keeps that name and the
  role it implies; a name that is a valid slot name but no role (`set-id`)
  is kept with a guessed role; every other name is replaced by the role's
  own name and letter. A placeholder whose alt text reads `folio role:
  <role>` (as `--pptx` export writes it) takes that role. Every guess says
  so in the report.
- **`--from-slides`** also proposes layouts measured from the deck's own
  slides: each slide's placeholders at the slide's own geometry, its text
  boxes, pictures and tables. Slides with the same slots at the same boxes
  (within 1 pt) are one proposal; a proposal whose slots are all inside a
  larger one is folded into it. A slide that only fills its layout's
  placeholders where the layout put them proposes nothing. A proposal is
  named after its layout and first slide (`title-only-s8`), keeps its
  layout's background and decorations, and lists every slide it covers.
  Text boxes are guessed from size and place: large text near the top is a
  title, one line just above a picture or table a label, one line near the
  foot a caption, other single lines labels, blocks of small text notes.
  Empty text boxes are left out unless named like a slot. The text slot just
  under a table flows `below` it with the smallest gap its slides show, and
  the table may grow down to that text's bottom (a table's box height is a
  maximum, `tables.md`); slots that flow are compared by their sides and
  bottom, so slides whose note was moved to sit under a longer table are one
  proposal.
- **The report.** `import-report.md` lists everything the importer did not
  know for sure, each with the command that resolves it: guessed roles,
  unmapped shapes (lines, rectangles, charts, SmartArt, footers, slide
  numbers, dates), layouts named like a variant whose boxes moved, fonts not
  embedded (with an open stand-in to consider),
  background fills it could only approximate (gradients, pictures), slide
  proposals and the slides behind them, and table styles whose borders it
  simplified. A finding met in many places is one line listing them.
  Nothing is guessed silently.
- **Validation.** The written folder is loaded as `folio pack check` loads
  it; the command prints the check's result and the report's path, and exits
  2 if the draft does not load.
- **Refusals.**
  - An existing `templates/<pack>/` is never overwritten:
    `templates/lectern already exists; import under another name with --name
    <new>, then copy layouts in with folio pack merge <new> lectern`.
  - A missing `--name`, a name that is not lower-case letters, digits and
    hyphens, a file that is not a pptx, or a pptx with no slide master are
    refused, each naming the fix.
- `folio pack import <dir|git-url>` keeps its old behaviour: validate a pack
  folder and install it, moving a replaced pack to `templates/.archive/`.

### Merge

- `folio pack merge <src> <dst>` copies layouts from one pack into another,
  with every named thing they use that `<dst>` lacks: role styles,
  backgrounds, table styles, hooks (their folders), fonts (entries and files)
  and the images their decorations and backgrounds show. Without
  `--layouts`, every layout and every named item of `<src>` is merged; with
  `--layouts a,b`, only those layouts and what they use.
- A name present in both packs with the same value is shared, not copied. A
  name present in both with different values is a **clash**, and the merge is
  refused, listing every clash with its fix: `layouts.title: both packs
  define it differently; merge it under another name with --rename
  title=<new>`, `roles.title: ...; --rename roles.title=<new>`. A renamed
  role style, background, table style or hook is renamed in every copied
  layout that uses it.
- A copied role style whose font is null names `<src>`'s first font
  explicitly, so it keeps its typeface in `<dst>`.
- An image whose path is taken in `<dst>` by a different file is copied as
  `images/<src>-<file>` and the copied decorations point there.
- `<dst>`'s `rules`, `usage`, `canvas` and `description` are never changed. A
  `<src>` on another canvas size is refused: its boxes would not fit.

### Edit

- `layout add <name> --from <layout>` copies a layout of the same pack under
  a new name; `--json <file|->` adds a layout object read from a file or
  stdin.
- `layout rename <old> <new>` renames a layout in place, keeping its
  position in the file.
- `layout remove <name>` moves the layout out of `pack.json` into the pack's
  `.archive/<YYYY-MM-DD>/layouts/<name>.json`; nothing is deleted.
- `set <path>=<json>` sets one value: the path is dot-separated keys from the
  top of `pack.json` (`layouts.title.slots.title.box=[22.5,316.1,720,212.4]`,
  `roles.note.size=14`, `backgrounds.black.ink="#FFFFFF"`); an array index is
  a number (`layouts.title.slots.title.box.1=316`). The value is JSON.

### What every write does

- **The result is validated** as `folio pack check` validates it, before
  anything is written. An invalid result is refused with every problem.
- **Decks in the workspace are protected.** Every deck that uses the pack
  (by name, pinned to its current version or not pinned) is checked slide by
  slide against the result. A write that would make a slide stop rendering
  (its layout gone, a filled slot gone or changed to another kind (text,
  figure, table), its background, table style or hook gone) is refused,
  naming each deck, slide and what it would lose: `refused: decks/example/s003 uses layout
  "note-figure"; move those slides to another layout first, or rename
  instead of removing`.
- **Version and pins.** A deck pins a pack as `name@N`, and only version `N`
  renders it. So a pack's version counts the changes that can break a slide
  written for it:
  - adding anything (a layout, a slot, a style, a background, a table style,
    a hook, an asset) or changing values (geometry, sizes, colours, notes,
    placeholders) **keeps the version**, so existing pins stay valid;
  - removing or renaming a layout, a slot, a background, a table style or a
    hook, or changing a slot's role, **bumps the version by one**.
  - After a bump, every deck in the workspace pinned to the old version is
    re-pinned to the new one (it was just checked and still renders), and the
    command names each deck it re-pinned. A deck pinned to another version is
    left alone and named.
- **The file keeps its shape.** Edits are made in place in the text of
  `pack.json`: its line endings (LF in `lectern` v2 since 2026-10-13; CRLF kept where a pack uses it), its indent and every
  byte outside the changed members stay as they were.
- Every write prints one line per change and the version it leaves.

### Export

- `folio pack export <pack|deck>` copies the pack (a deck's own pack, when a
  deck is named) to `--out DIR` (default `<name>-v<version>`), without its
  `.archive/` or caches. `--zip out.zip` writes the same files as one zip
  whose top folder is the pack's name, so `unzip` then
  `folio pack import <folder>` installs it elsewhere.
- `--pptx out.pptx` writes a PowerPoint file with no slides whose slide
  master and layouts reproduce the pack: one PowerPoint layout per pack
  layout on its own background, and one variant per other background
  (`note-figure black`), as PowerPoint templates switch backgrounds; a
  placeholder per slot, named after the slot with `folio role: <role>` in
  its alt text, at its box (title, subtitle, body for every other text role,
  picture for figures, table for tables), carrying its style's size,
  weight, colour, alignment, anchor and line spacing; the decorations shown
  on that background as pictures and text boxes; the pack's table styles in
  `tableStyles.xml`; the theme fonts. Importing the written file gives back
  the same layouts, slot names, roles and boxes, backgrounds and table
  styles (`lectern`: 27 of 27 layouts, 136 of 136 slots).
- An existing output is never overwritten; the refusal names `--out`,
  `--zip` or `--pptx` to choose another.

## Never

- Overwriting an existing pack on import, or a file on export.
- Guessing silently: every guess the importer makes is in
  `import-report.md`, with the command that settles it.
- Editing a pack a deck in the workspace uses in a way that stops one of its
  slides rendering, or bumping a version and leaving the workspace's decks on
  a pin that no longer resolves.
- Rewriting `pack.json` from parsed JSON (losing CRLF, `720.0`, the indent).
- Merging by overwriting a clashing name, or changing `<dst>`'s house rules.
- Deleting a layout: `remove` archives it.
- Python for the importer: the CLI reads the pptx itself (a zip of XML), so
  `folio pack import` works with `pnpm install` alone and needs no runtime.

## Status

- Gradient and picture backgrounds are approximated by one colour and
  reported; pattern fills, lines, rectangles, charts and SmartArt on a layout
  have no folio counterpart and are listed, not drawn.
- Embedded pptx fonts in PowerPoint's obfuscated or EOT form are listed in
  the report, not extracted.
- `--pptx` export writes SVG decorations as SVG only (PowerPoint 2016 and
  later show them; older versions do not), as PowerPoint masters
  themselves do; background pictures are written as their fill colour. The
  written file is checked by re-import and by python-pptx, not yet opened in
  PowerPoint itself.
- A table style's text size is not part of PowerPoint's table styles: the
  import takes the size the deck's tables use (or the layouts' table
  placeholders'), one size for every style.
- `e2e/pack-tools.mjs` is written and in `e2e/run-all.sh`, not yet run.

## Where it lives

`packages/core/src/pack.ts` (the zod schema and its refusal messages,
`loadPack`; owned in full by `packs.md`, the shape-naming refusals of this
page live here); `packages/cli/src/pptx/`: reading (`ooxml.ts` zip and XML, `color.ts`,
`textstyle.ts`, `shapes.ts`, `model.ts`), mapping (`draft.ts`, `slots.ts`,
`placeholders.ts`, `variants.ts`, `tablestyle.ts`, `fonts.ts`, `flow.ts`,
`fromslides.ts`, `topack.ts`, `report.ts`, `importpptx.ts`) and writing
(`parts.ts`, `tablexml.ts`, `write.ts` for `--pptx`);
`packages/cli/src/packtoolcmds.ts` (the commands), `packcmds.ts` (dispatch);
`packages/core/src/packchange.ts` (what a slide names, slide breakage, the
version rule); `packages/server/src/packedit.ts`, the one pack writer that
promote (`overrides.md`), merge, edit and import all use: in-place JSON
text edits (jsonc-parser; `setJsonMember` for promote) and `writePack`
(the pack's lock, open inside it, validate, protect decks, version rule,
atomic write, re-pin); `packmerge.ts`, `layoutedits.ts`;
`docs/pack-guide.md`. The importer is TypeScript (fflate, fast-xml-parser)
so it needs no Python runtime.

## Checks

`packages/core/test/pack.test.ts` (a minimal hand-written pack passes;
missing `canvas`, `roles`, `backgrounds` and `layouts` each name the shape
with an example; a wrong-type slot, role style and background name their own
shape; an unknown slot role lists the pack's roles; a layout's unknown
background lists the pack's backgrounds),
`packages/core/test/packchange.test.ts` (version kept on additions and value
changes, bumped on removal, rename and role change; slide breakage found by
deck and slide), `packages/server/test/packops.test.ts` (two writers under the lock both land; merge refuses
clashes by name and with `--rename`, copies styles, backgrounds, table
styles, hooks and images, keeps `<dst>`'s version; edit add, rename, remove
archiving, set; remove refused while a deck uses the layout, naming the
slides; CRLF and number text kept; re-pin after a bump),
`packages/cli/test/pptx-import.test.ts` (a small fixture pptx made by
`packages/cli/test/fixtures/make_fixture.py`: canvas, roles, placeholders,
variants, decorations, table style, the report; the result passes
`folio pack check`; an existing pack refused; `--pptx` export imported back
to the same boxes), `e2e/pack-tools.mjs` (isolated workspace: import, check,
merge, edit, export zip and pptx, round trip).
