# Turning a PowerPoint template into a folio pack

Read this before converting a pptx, merging packs or editing one. The tools do
the mechanical part; the calls marked **Judge** are yours, and the pack is not
done until each one is made.

## The steps

1. **Import a draft.**
   `folio pack import deck.pptx --name <pack> --from-slides`
   writes `templates/<pack>/` with `pack.json`, `images/` and
   `import-report.md`. It reads the slide master and every layout (boxes in
   pt, text styles through the master, backgrounds, logos), the table styles,
   and with `--from-slides` proposes a layout for every distinct slide
   structure. It refuses to overwrite a pack; import under a new name and
   `folio pack merge` into the old one instead.
   - Before importing, it helps to name shapes on the live slides with folio
     slot names (`title`, `subtitle`, `note`, `caption`, `label:a`, `fig:a`,
     `table:a`): the importer keeps those names and the roles they imply, and
     guesses only for the rest.
2. **Read `import-report.md` top to bottom.** Every item is a guess or a gap,
   with the command that settles it. Nothing in it is silent.
3. **Decide the layouts.** The master gives the PowerPoint layouts; the
   proposals (`title-only-s8`, named after their layout and first slide) give
   the pages the deck actually uses. Keep what the house uses, under the
   house's names (`folio pack edit <pack> layout rename title-only-s8
   profile-pictures`); drop the rest (`layout remove`, archived, never
   deleted). **Judge:** which kinds the house has, and their names.
4. **Decide the roles.** Each slot has a role (title, subtitle, body, label,
   caption, note, figure, table); it fixes the font, size, line height and
   the line limit. The report lists every guessed role.
   **Judge:** a one-line box above a picture is a label, at the foot a
   caption, a block of small text a note; a content placeholder that held a
   picture is a figure. Fix one with
   `folio pack edit <pack> set layouts.<layout>.slots.<slot>.role='"caption"'`.
   Set `lines` on single-line slots (`...slots.title.lines=1`).
5. **Measure the self-made kinds from live slides, not from the master.** A
   house often draws its real pages on a bare layout (`Title Only`) with
   text boxes and pictures; those pages are the proposals. Where a proposal
   and the master disagree, the live slide wins: it is what the house shows.
   Merge near-duplicates by hand (one with and one without `set-id`), and
   add a slot the house always uses even if one slide lacked it.
6. **Backgrounds per layout.** Every layout names its own background; a
   slide may switch it. PowerPoint variants (`Title Slide Black`) were folded
   into backgrounds (`black`), with logos limited to the backgrounds they
   belong on. **Judge:** each kept layout's own background (a separator is
   usually black), and whether a variant that did not fold (its boxes moved)
   is a real layout or a sloppy copy.
7. **Table styles.** PowerPoint's per-cell borders become three switches
   (outer, rows, columns), the header row's fill, ink and weight, and body
   banding. Compare one table in the browser with the pptx and fix with
   `set tables.<style>.<field>=...`. Table slots take the height their table
   may grow to; a note under a table flows `below` it (`tables.md`).
8. **Fonts and licences.** folio draws only the font files a pack carries.
   The report names every typeface and an open stand-in where one exists.
   **Judge:** which file you may ship. Copy it with its licence file into
   `templates/<pack>/fonts/`, then
   `folio pack edit <pack> set fonts='[{"family": "Liberation Sans", "file": "fonts/LiberationSans-Regular.ttf", "weight": 400}]'`.
   Never ship a font whose licence you have not read (Arial and Calibri are
   not redistributable; Liberation and Carlito are their metric twins).
9. **Write the notes.** Each kept layout gets a `description` (what the page
   is for) and a `usage` note (`when` to choose it, `how` to fill it), and
   the placeholders that tell an agent what belongs in each slot. Add house
   `rules` (character limits, guidance) if the house has them.
10. **Wire hooks.** A slot that should be drawn or rewritten by a script names
    a hook of the pack (`hooks.md`): a plot slot names a figure hook, a text
    slot a text hook. Copy a hook in from another pack with
    `folio pack merge <src> <pack> --layouts <a layout that uses it>`.
11. **Check.** `folio pack check templates/<pack>` must pass after every
    change; every `folio pack edit` and `merge` checks before it writes.
12. **Render a sample deck and compare with the pptx.**
    `folio init-deck decks/sample --template <pack>@1`, one slide per kept
    layout (`folio new decks/sample --template <layout>`, then fill it), then
    `folio serve` or `folio pdf decks/sample`. Put each page beside the same
    page of the pptx: boxes, line breaks, colours, logos. **Judge:** what
    differs, and whether it matters.

## Write a pack from scratch

No pptx, no importer: a pack is just `templates/<pack>/pack.json`. The
smallest one that passes `folio pack check templates/<pack>` is:

```json
{
  "name": "dark",
  "version": 1,
  "canvas": { "w": 960, "h": 540, "unit": "pt" },
  "roles": { "body": { "size": 24, "lineHeight": 1.3 } },
  "backgrounds": { "plain": { "fill": "#ffffff", "ink": "#111111" } },
  "layouts": {
    "title": {
      "description": "A single text slot.",
      "background": "plain",
      "slots": { "body": { "role": "body", "box": [40, 40, 880, 460] } }
    }
  }
}
```

Every refusal names the field and the shape it wants: a missing `canvas`
says `is missing; write "canvas": {"w": 960, "h": 540, "unit": "pt"}`; an
unknown slot role lists the roles that exist (`title, subtitle, body, label,
caption, note, figure, table`); a layout's background not in `backgrounds`
lists the ones the pack has. Add layouts, roles, backgrounds and table
styles from there (`folio pack schema` prints the full JSON Schema).

## Merging, editing, exporting

- `folio pack merge <src> <dst> [--layouts a,b] [--rename a=b]` copies
  layouts and every style, background, table style, hook, font and image
  they use. A name both packs define differently is refused with the
  `--rename` that resolves it (`--rename roles.title=cover-title`) and the
  fields that differ; the destination's rules and canvas are never changed.
  Settle a fresh import's fonts first: a style whose font is the reader's
  fallback differs from the same style in a pack that ships its font.
- `folio pack edit <pack> layout add <name> --from <layout>`, `layout rename`,
  `layout remove`, `set <path>=<json>` (a dot path from the top of
  `pack.json`; strings need inner quotes: `set backgrounds.black.ink='"#FFFFFF"'`).
  A path that names no field is refused, so typos never land.
- **Decks are protected.** An edit that would stop a slide in this workspace
  rendering is refused, naming the deck and slide.
- **Version and pins.** Adding or changing values keeps the version, so
  `"template": "<pack>@N"` pins stay valid. Removing or renaming a layout,
  slot, background, table style or hook, or changing a slot's role, bumps the
  version; decks of this workspace that were on the old version are re-pinned
  and named. Decks elsewhere keep their pin and must move on purpose.
- `pack.json` is edited in place: its line endings, indent and number text
  stay as they were.
- `folio pack export <pack> --zip out.zip` gives a portable bundle;
  `--pptx out.pptx` a PowerPoint master that reproduces the pack (one layout
  per background variant, slot roles in each placeholder's alt text), which
  imports back to the same boxes.
