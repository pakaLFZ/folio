# Slides: shots, seeing the pages an agent made

## Demand

- "Try use folio with some freeform plots, eg u can try make a pitching ppt to
  prompt folio, one feature u want is to see screenshot of the pages u made.
  Test both templates and none template and try push the limit and interate.
  Make the testing and interation cheap tho" *(user, 2026-10-13)*
- An agent writing slides must be able to see the pages it made, cheaply,
  without printing a PDF and rasterising it. *(user, 2026-10-13, through the
  task brief)*
- "A deck can be 100 pages thus shot may need page options"
  *(user, 2026-10-13)*: pages by position and range, id ranges, only the
  slides changed since the last shot, only the slides with warnings, and
  sheets that paginate. *(user, 2026-10-13, through the coordinator)*
- A sheet label counts findings by severity as the report does: a slide
  whose only finding is a note is not labelled "1 warning" in red, and
  `--marks` does not outline a note-only slot in red. *(user, 2026-10-13,
  through the coordinator)*

## Behaviour

### Command and selection

- `folio shot <deck> [--slides IDS] [--pages N] [--changed] [--warned
  [--notes]] [--out DIR] [--width PX] [--sheet] [--per-sheet N] [--marks]
  [--wait S] [--json]` writes one PNG per slide shot, named
  `<slide-id>.png`, into DIR.
- `--slides` takes ids and id ranges, comma separated: `s001,s010-s020`. A
  range is every slide between its two ids in deck order (either way round).
  `--pages` takes 1-based positions and ranges in deck order: `1-10,42`. Both
  may be given; the union is shot, in deck order. An id or page the deck does
  not have is refused by name (exit 2). With neither, every slide is taken.
- `--changed` keeps only the slides whose picture is missing or was made from
  something else: another revision of the slide file, another last good
  figure in one of its hooked slots, or other settings (width, marks, the
  pack name and version). DIR holds `manifest.json` (settings and one key per
  slide) for this; the pictures of unchanged slides stay as they are and the
  output says how many were kept. A 100-slide deck with one slide edited
  costs one slide.
- `--warned` keeps only the slides that, once measured, have an active
  warning or error; `--notes` counts notes too. It lays out every selected
  slide to measure it and shoots only those it keeps. `--changed` and
  `--warned` together keep the changed slides that are warned.
- **Only the slides taken are laid out**: the print page is asked for those
  ids alone. Up to twelve slides use one print page; a longer run is split
  into consecutive runs of at least twelve on up to eight print pages at
  once, so a long deck is shot in parallel.

### Folder

- The default DIR is `<deck>/.shots/`. When folio creates it, it writes a
  `.gitignore` holding `*` inside it, so the pictures are never committed in
  any repository a deck lives in; the folio repository also ignores `.shots/`.
- In the default folder the old sheets (`sheet*.png`) are removed on every run
  (they are drawn again only when `--sheet` is given), and so is the picture
  of any slide no longer in the deck. Other pictures stay. `--out DIR` is
  written as given and nothing in it is removed; it has its own manifest.
- ~~When every slide is shot all the PNGs already there are removed first.~~
  *Superseded (2026-10-13, `--changed` keeps unchanged pictures): only the
  pictures of slides gone from the deck are removed.*

### Pictures

- The default width is **960 px** for the slide (half the 1920 px of a
  full-HD 16:9 slide, 540 px tall at 16:9): small enough to be cheap for a
  model to look at, large enough to read 12 pt text. `--width PX` sets it; the
  height follows the pack's canvas.
- The slides are drawn by the print page, the renderer and fonts `folio pdf`
  and `folio check` use, scaled by the browser's device scale factor (layout
  and line breaks are those of the canvas at 1:1). Each slide is a viewport
  screenshot of its page scrolled to it.
- Before shooting it waits for the deck's hook figures as `folio pdf` does (on
  the running server's queue when one runs, else drawing them itself), up to
  `--wait` seconds, **default 30**. Figures still drawing when the wait ends
  are shot from their last good version and listed. When the measurement
  causes a figure to be redrawn (a figure flowing `below` a text), the slides
  are shot once more, as `folio pdf` prints once more.

### Sheets

- `--sheet` also writes contact sheets in DIR, at most `--per-sheet N`
  slides each (**default 12**), as `sheet-1.png`, `sheet-2.png`, ...: the
  slides shot in this run as thumbnails 480 px wide, three columns, each
  labelled with its slide id, its layout name and its active findings counted
  by severity as the report counts them, zeros left out: "1 error, 2 warnings,
  1 note". Errors are red and bold, warnings red, notes grey; a slide with
  none reads "0 warnings" in grey. A sheet is an HTML grid of the slide PNGs,
  screenshot in the same browser; sheets are drawn at once.
- ~~`sheet.png` holding every requested slide.~~ *Superseded (user,
  2026-10-13: a 100-slide deck on one sheet is unreadable).*

### Marks

- `--marks` draws a debug overlay on the shots (and so on the sheets): every
  slot's box outlined thinly in dashed blue with its slot name; a slot with an
  active warning or error outlined in red with its slot name and codes; a
  slot with notes only outlined in solid grey with its codes. Codes on the
  slide but on no slot (or on a slot the page does not draw) are listed at
  the slide's top left, red when any of them is a warning or error, else grey.

### Output

- It prints the pictures written, one path per line when there are at most
  twelve, else one line naming the folder, the count and the first and last
  file; then each sheet with the slides it covers (`sheet-2.png  s013-s024`);
  then how many unchanged slides `--changed` kept; then the open-comment
  table and the warning report `folio check` prints, for the slides laid out;
  and last `shot N of M slides at W px in T s`.
- With `--json` it prints one JSON object instead: `shots` (slide, layout,
  path, `counts` of error, warning and note), `sheets` (path, first, last),
  `kept`, `stale` (figures still drawing) and the fields of `folio check
  --json` (`version`, `summary`, `warnings`).
- It exits 0, or as the report flags (`--max-warnings`, `--fail-on new`) say.
- `folio prompt` tells agents, in one line, to look at their slides with
  `folio shot <deck> --sheet` after writing them, and names `--changed`,
  `--slides`/`--pages` and `--marks`.

### Cost, measured 2026-10-13 (64-core login node, figures already drawn)

- 10 slides, `--sheet --marks`: 3.0 s for the whole command.
- 100 slides, `--sheet`: 5.9 to 6.3 s; `--changed` with one slide edited:
  3.3 s, one picture; `--changed` with nothing edited: 1.5 s, no page opened;
  `--pages 1-10 --sheet`: 3.8 s.

## Never

- One page load per slide: a deck of ten would cost ten renders.
- Laying out the whole deck to shoot part of it.
- `folio pdf` followed by a PDF rasteriser (pdftoppm): about 3 s for two
  slides, and a second program to install.
- A new image dependency (sharp, canvas) to composite the sheet: the browser
  already draws it.
- Shrinking anything in the slide to fit the picture: the page is laid out at
  1:1 and the whole picture is scaled.
- A warning from `shot` failing the command by default.
- A note shown in a warning's red.

## Status

Built 2026-10-13; page options, `--changed`, `--warned` and paginated sheets
added the same day.

## Where it lives

`packages/cli/src/shot.ts` (the command, parallel print pages, sheets),
`packages/cli/src/selection.ts` (ids, id ranges, pages),
`packages/cli/src/shotfolder.ts` (the folder, the manifest, `--changed`),
`packages/cli/src/sheet.ts` (the sheet's HTML and the marks overlay drawn in
the page), `packages/cli/src/figures.ts` (the figure wait shared with
`folio pdf`), `openPrintPage` in `packages/server/src/pdf.ts` (page options),
the prompt line in `packages/core/src/catalog.ts`.

## Checks

`e2e/shot.mjs` against its own copy of `decks/example` plus a note-only
slide (a plain picture): one PNG per slide at 960 x 540 under `.shots/` with
its `.gitignore`; `--slides`, `--width`, `--out`; an id range; `--pages`
positions and ranges; an unknown page refused; `--changed` shooting nothing,
then only an edited slide while the other pictures keep their mtime;
`--warned` and `--warned --notes`; sheets paginating with `--per-sheet 2`
and listed with their ranges, one sheet three thumbnails wide by default;
`--marks` red on the overflowing note and no red on the note-only slide; the
sheet's caption red for warnings and without red for "1 note"; `--json`
counts by severity and the summary of `folio check --json`; old sheets and a
removed slide's picture removed.
