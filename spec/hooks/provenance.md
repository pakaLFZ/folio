# Hooks: traced, reusable, redrawn at every size

## Demand

- "The idea is all plots made, can be traced, and the function is sort of
  reusable direcly, and auto adjust for, eg, size change" *(user, 2026-10-13)*
- Read as three goals, stated to the user with the brief of 2026-10-13:
  1. **Traced**: every figure folio shows or exports can be traced to exactly
     what made it: hook name, version and file hashes, the full inputs, box,
     dpi, time, runtime, and the data files the inputs name, with their hashes.
  2. **Reusable directly**: a hook can be called without a deck, from the
     command line or from Python, through the same cache and the same code
     path as deck rendering, so a reused figure is identical to one in a deck.
  3. **Auto-adjusts to size**: any change of a slot's box redraws the figure
     at the new size, never rescaled; the old figure stays, faded, with the
     "drawing" mark, until the new one is ready.
- "should table be traced as well?" *(user, 2026-10-13)*; the plan for tables
  below (hooked tables traced as figures are, `.table.json` files with their
  hash and an optional source block, a note on typed-in numbers) was approved:
  "Implement" *(user, 2026-10-13, relayed)*.
- "Try use folio with some freeform plots ... push the limit and interate";
  "It must be easy to learn and use for agents" *(user, 2026-10-13)*. The
  dogfood of that day drew a flow diagram and a bar chart with a script
  (the pack's only plot hook is `line-plot`), sized by hand from the pt box
  in `folio prompt`, and got only `FOLIO-FIG-002`: a one-off figure had no
  traced route, as tables have `write_table`, and its size had to be worked
  out by hand.

## Behaviour

### The trace record

- Every output a hook makes has a trace record beside it in the cache,
  `.folio/hooks/<key>.json` next to `<key>.png|svg|pdf|out.json`, written in
  the same step that moves the output into the cache (spawn and warm alike):

  ```json
  {"trace": 1, "key": "8c1e0f3a9b2d4e57", "kind": "figure",
   "hook": {"pack": "lectern", "name": "line-plot", "version": 1,
            "scriptHash": "…16 hex…", "stamp": "line-plot@1:…",
            "files": {"draw.py": "<sha256>", "hook.json": "<sha256>", "style.py": "<sha256>"}},
   "inputs": {...the whole inputs...}, "box": {"w": 439.6, "h": 360.2},
   "dpi": 200, "format": "png",
   "slot": {"deck": "d1b2c3d4", "slide": "s002", "slot": "fig:a", "role": "figure"},
   "base": "/abs/path/decks/example",
   "data": [{"path": "data/energies.csv", "sha256": "…"}],
   "runtime": {"name": "python", "exe": "/…/python", "version": "Python 3.12.7", "mode": "spawn"},
   "at": "2026-10-13T10:00:00.000Z", "seconds": 0.43,
   "output": {"file": "8c1e0f3a9b2d4e57.png", "sha256": "…", "bytes": 81234}}
  ```

- `data` lists every string in the inputs that names an existing file under
  `base` (the deck folder; for a direct call, the folder the call was made
  from), with its sha256 at the time of the run. folio reads nothing into
  the inputs; it only records what the inputs point at.
- A run is reproducible: `SOURCE_DATE_EPOCH=0` is set for every hook, and
  `folio_hook.save_figure` fixes matplotlib's SVG hash salt, so the same hook,
  inputs, box and dpi give the same bytes (PNG, SVG and PDF).

### Seeing it

- `folio trace <deck>/<slide> <slot> [--json]` prints the record of the
  figure the slot shows (its last good output) and one line that regenerates
  it from scratch and compares the bytes:
  `folio hook run lectern/line-plot --inputs <abs>/.folio/hooks/<key>.json --fresh --out <key>.png`.
  A slot whose current inputs differ from the figure shown says so
  (`drawing`, `failed`, `stale`) above the record.
- A figure slot holding a plain image (a path, no hook) is **untraced**:
  `folio trace` prints `untraced: fig:a shows plots/a.png, a plain image no
  hook made`, and `folio check` lists it as the note `FOLIO-FIG-002` (a note,
  never a warning; the user decides later whether it becomes one).
- `GET /<deck>/trace/<slide>/<slot>` gives `{state, phase, trace, command}`,
  `state` being `traced`, `untraced` or `none`.
- An exported PDF (`folio pdf` and the editor's export) carries one info
  entry, `/FolioTrace`, a compact JSON: `{"v":1,"pages":[{"slide":"s002",
  "slots":{"fig:a":{"hook":"lectern/line-plot@1","key":"…","inputs":"<16 hex>"}}}]}`,
  one page per slide in print order; an untraced figure is
  `{"untraced":"plots/a.png"}`. It is appended as an incremental update, so
  the printed pages are byte-for-byte the renderer's.

### Tables

- **A table made by a table hook** is traced as a figure is: the record
  beside its cached output (`kind: "table"`, the rows it received as
  `inputs`, the box), `folio trace <deck>/<slide> table:b` with a regenerate
  line, and an entry in `/FolioTrace`. The record's
  `output.sha256` is of the output as `folio hook run` writes it
  (`{"columns", "rows"}`, two-space JSON), so the regenerated file compares.
- **A table read from `{"src": "<subject>.table.json"}`**:
  - each time a page reads the file (live view, print page, `folio check`,
    `folio pdf`), its sha256 and the time are recorded
    (`.folio/tables/<path>.json`); `folio trace` prints the file, its current
    sha256, the one last drawn and whether they still match (`CHANGED since
    drawn` when not); the PDF entry is `{"file", "sha256"}`;
  - the file may carry `"source": {"script", "command"?, "inputs"?:
    [{"path", "sha256"}], "at"?}`, written by the script that made it. folio
    checks its shape (`script` non-empty, each `sha256` 64 lowercase hex, no
    other keys; a bad block is `FOLIO-TAB-001` naming `source.<path>`),
    prints it in `folio trace` ("Written by <script>"), and never guesses
    one ("No source recorded in the file");
  - changing the file redraws the slide live, and a hooked file table runs
    its hook again, without any edit of the slide.
  - Python: `folio_hook.write_table(path, columns, rows, script=__file__,
    inputs=[...], command=None)` writes the file atomically with its source
    block (each input's sha256, the command line, the time).
- **A table typed into the slide** (inline rows, no table hook) is
  `untraced: inline table` in `folio trace`. If any body cell is numeric, `folio check` gives the note `FOLIO-TAB-002` ("holds
  numbers typed into the slide ...; use a table hook or a .table.json file
  with a source block"), never a warning; a table of words gets nothing.
- **Numeric cell**, precisely: after `**` is removed and `_{x}` / `^{x}`
  become `^x`, the trimmed cell is an optional sign (`+`, `-`, U+2212), then
  digits with an optional `.digits` (thousands written `1,234`), or `.digits`,
  then an optional exponent (`e-3`, `E+5`), then optionally `%` or one to
  three space-separated unit words, each starting with a letter, `°`, `µ` or
  `Å` and going on with letters, digits, `/`, `^`, `-`, U+2212 or `·`.
  Numbers: `0.674`, `-1.2e-3`, `12 %`, `0.68 eV`, `300 K`,
  `1.5 kJ mol^{-1}`, `25 °C`. Not numbers: `CO_{2}`, `end-on`,
  `0.674 to 0.686 eV`, `2026-10-13`, `N/A` (core `isNumericCell`).

### Figures drawn by a script

A one-off figure (a diagram, a chart no hook draws) is traced the way a
`write_table` file is: by what the script that made it says.

- `folio box <deck>/<slide> <slot> [--json]` prints the slot's box as the
  slide lays it out now: the layout's box with the slide's overrides, and a
  flowed slot's last measured height. `fig:a on s004: 439.6 x 360.2 pt
  (6.106 x 5.003 in)`; `--json` gives `{slide, slot, w, h, inches: [w, h],
  flowed}`. An unknown slot is refused, naming the slots that exist.
- `folio py <script.py> [args]` runs a script with the workspace's Python
  runtime (`[runtimes] python` in `folio.local.toml`) and folio's `python/`
  folder on PYTHONPATH, in the working folder, with the environment hooks get
  (`MPLBACKEND=Agg`, `SOURCE_DATE_EPOCH=0`); it exits with the script's code
  and refuses, naming the setting, when no Python runtime is set. The
  coordinator's first use of the Figures prompt failed on
  `ModuleNotFoundError: folio_hook` (2026-10-13): this is how an agent's
  script imports it without installing; `pip install -e <folio>/python`
  into its own Python is the alternative.
- Python: `folio_hook.slot_size("decks/talk", "s004", "fig:a")` runs
  `folio box ... --json` (so overrides and flowed heights count) and returns
  a `SlotSize` with `w_pt`, `h_pt` and `figsize` (inches, for
  `plt.figure(figsize=...)`).
- Python: `folio_hook.save_traced(fig, "decks/talk/fig/loop.png",
  script=__file__, inputs=[...], dpi=200, command=None)` saves the figure at
  its own size (never `bbox_inches="tight"`, a raster sized as
  `save_figure` sizes it, so the pixels are exactly the pt box at the dpi)
  and writes `loop.png.trace.json` beside it, both atomically:
  `{"trace": 1, "kind": "figure-file", "file": "loop.png", "box": {"w", "h"},
  "dpi", "format", "cwd", "source": {"script", "command", "inputs": [{"path",
  "sha256"}], "at"}, "output": {"sha256", "bytes"}}`. The format comes from
  the file's suffix (png, svg, pdf). The recorded command is `folio py
  <script> <args>` as the script was called (the CLI as `folio_hook.call`
  finds it), so it draws again from any shell, with or without an install. The source block has the shape of a
  table file's.
- A figure slot whose image has a valid trace file is **traced by its
  file**: no `FOLIO-FIG-002`; `folio trace` prints the file, its sha256 and
  whether it is still the one `save_traced` wrote, the box it was drawn at
  and the slot's box now, the script, command and inputs with their hashes,
  and `regenerate: cd <cwd> && <command>` ("From <file>", "Written by
  <script>", as for a table file); `/FolioTrace` carries `{file, sha256}`.
- `folio check`:
  - `FOLIO-FIG-002` (note) for an image with no trace file; its message
    names the fix: draw it with a hook (`folio hook list`) or save it with
    `folio_hook.save_traced(fig, path, script=__file__, inputs=[...])`.
  - `FOLIO-FIG-003` (warning) when a traced image was drawn at a box more
    than 0.5 pt off the slot's box now (an override, a layout edit, a
    flowed height), naming both sizes and the line that redraws it.
  - `FOLIO-FIG-004` (note) when the trace file does not describe the image:
    the image changed after it was saved, or the trace file is not the
    shape above (the reason names the path). Saving again with
    `save_traced` clears it.
- A script-drawn image is shown as any plain image is (fitted into the
  slot); `FOLIO-FIG-003` is what says it is the wrong size. folio never
  reruns the script itself.

### Calling a hook without a deck

- `folio hook list` prints every hook of every pack:
  `lectern/line-plot  v1  figure  Line plot of up to four series ...`.
- `folio hook show <pack>/<hook> [--json]` prints the description, kind,
  version, runtime, format and dpi, the inputs JSON Schema and an example
  (the hook's `example` in `hook.json`, else one made from the schema's
  required fields), and the line that runs it.
- `folio hook run <pack>/<hook> --inputs inputs.json|- --size W,H
  [--unit pt|mm|in] [--dpi N] [--format png|svg|pdf] --out FILE [--deck D]
  [--fresh] [--json]`:
  - `--inputs` is the inputs object, or a trace record: then the box, dpi,
    format, slot, role and base come from the trace and `--size` is not
    needed; the output's sha256 is compared with the trace's and the command
    exits 1 when they differ.
  - The size is converted to pt (1 in = 72 pt, 1 mm = 72/25.4 pt) and is the
    box, exactly as a slot's box.
  - The inputs are checked against the hook's schema (`FOLIO-HOOK-001`'s
    paths, exit 2); the key is computed by the same function a slot uses;
    the cache is looked up in the target cache (the deck's with `--deck`,
    else the workspace's `.folio/hooks`) and in every deck's cache; a miss
    runs the hook through the same runner, envelope and output checks as the
    queue, and caches the output with its trace. `--fresh` skips the lookup
    and draws into a scratch folder, so the bytes are made again.
  - A format other than the hook's own adds the format to the key; the
    deck's keys are unchanged.
  - A text or table hook writes its response (`{"text"}` or
    `{"columns","rows"}`) as JSON to `--out`.
  - It prints `wrote FILE (W x H px, hook@v, key K, cached|drawn) sha256 …`,
    and the trace path; `--json` prints `{out, key, cached, sha256, trace,
    matches}`.
- Python: `from folio_hook import call;
  call("lectern/line-plot", inputs, size=(120, 80), unit="mm", out="fig.png")`
  runs `folio hook run` (so it is the same path), from the workspace that
  holds the working folder, and returns the `--json` result. The CLI is
  `$FOLIO_BIN`, else the repository's `packages/cli/bin/folio.mjs` beside
  `python/`, else `folio` on `PATH`.
- A deck slot whose key a direct call already made takes that figure from
  the workspace cache (copied with its trace into the deck's cache) instead
  of drawing it again, and the other way round.

### Redrawn at every size

- The cache key holds the box (and dpi), so every change of a slot's size is
  a new key and a new run. Each path that changes a box reaches the queue:
  - a per-slide override (`overrides.slots.fig:a.box`): a slide change;
  - a layout edit in `pack.json`, or a pack version change: the pack watcher
    reconciles every slide of every deck on that pack;
  - a deck's `deck.json` changing its pack pin: the queue reloads the deck
    and reconciles every slide;
  - another layout chosen for the slide: a slide change;
  - a figure flowing `below` a table or text: its height is the measured
    one. The live view and the print page report a flowed slot's laid-out
    height (`boxPt`, rounded to 1 pt); the queue uses the last height
    reported for the slot (the layout's until one arrives) and reconciles
    when a measurement arrives. `folio pdf` and the editor's export post
    their print measurement, wait for the redraw and print again when a
    flowed figure changed.
- A figure is always drawn at the box it was made for, never scaled: the
  editor and the print page place the last good figure at its own size
  (from its trace) at the slot's top left, clipped to the slot. While a
  redraw runs it is faded with the "drawing" mark; on failure it stays with
  the danger badge.
- **Canonical pixel size** *(2026-10-13)*: a PNG figure is exactly
  `floor(pt x dpi / 72 + 0.5)` pixels each way (halves round up), the size
  core `expectedPixels`, `folio_hook`'s `Request.size_pixels` and every check
  compute. The size check is exact: one pixel off is `FOLIO-HOOK-005`.
  matplotlib truncates a raster figure's pixel size, so
  `folio_hook.save_figure` sizes a raster figure a quarter pixel past that
  size; a vector figure (SVG, PDF) is the box in pt, within 0.5 pt.
- The `lectern` line-plot scales its text with the slot width from the 89 mm
  house sizes, never below them (7 pt labels, 8 pt title), and lays out its
  margins in points from those sizes, so a short or narrow box keeps every
  label inside the figure and apart.

## Never

- A hooked figure that cannot be traced: an output in the cache without its
  record, or a record without the hook's file hashes, the inputs and box.
- A rescaled bitmap shown at a new size: a figure stretched or shrunk to a
  box it was not drawn for.
- A reuse path that differs from deck rendering: its own key, cache, runner,
  request envelope or output check.
- Data files copied into the trace, or a trace that rewrites the inputs.
- Untraced pictures, or typed-in numeric tables, raised as warnings before
  the user decides.
- A script-drawn figure folio redraws by running the script on its own,
  or a trace file folio writes for an image it did not see saved.
- Tracing text hooks: they format text (subscripts, case) and are out of
  this scope; a text slot gets no "Made by" line, no untraced note and no
  `/FolioTrace` entry (their cache record exists only because the cache is
  shared).
- A guessed source block: folio records what the file says made it, or
  says nothing was recorded.
- A trace shown in the Slide tab. It used to: selecting a figure or table
  slot opened a Figure or Table section with "Made by <hook> vN", "Untraced:
  a plain image", "From <file>" and "Written by <script>". Removed
  2026-10-13: "I feel like u love to add more componentto this slide tab.
  dont add stuff without my explicit permission and remove the red boxed
  thig" *(user, 2026-10-13)*. Provenance is read with `folio trace` and the
  `/trace` route, never shown in the editor.

## Status

- The data files a trace names are recorded, not part of the cache key: an
  edited data file under the same name does not redraw the figure; its trace
  then shows the hash of the file the figure was made from.
- A hook's Python packages are not listed in the trace beyond the
  interpreter's version.
- The PDF entry is one document-level info entry, not per-page XMP.

## Where it lives

`packages/core/src/tabletrace.ts` (`readTableFile`, the source block,
`isNumericCell`), `packages/core/src/provenance.ts` (record shape, data candidates, the
regenerate line, units, `/FolioTrace` and the PDF incremental update),
`packages/server/src/hooks/trace.ts` (writing records, file hashes, runtime
version), `hooks/direct.ts` (calling a hook without a deck, the shared
cache lookup), `hooks/slots.ts` (`hookJob`, flowed heights),
`hooks/slottrace.ts` (what a slot shows, `/FolioTrace` pages),
`hooks/tablefiles.ts` (drawn hashes, source),
`packages/core/src/figuretrace.ts` and `hooks/figurefiles.ts` (script-drawn
figures: the trace file, box now, `FOLIO-FIG-003/004`), `slotbox.ts` and
`packages/cli/src/boxcmd.ts` (`folio box`), `pycmd.ts` (`folio py`), `python/folio_hook/figures.py`
(`save_traced`, `slot_size`), `hooks/routes.ts` (`/trace`),
`routes-deck.ts` (files route records a drawn table), `pdf.ts`, `packages/cli/src/hookcmds.ts`
(`hook list|show|run`, `trace`), `python/folio_hook/call.py`, `tables.py`,
`slide/FigureSlot.tsx`, `templates/lectern/hooks/line-plot/style.py`
(the archived Slide tab display is `.archive/web-figure-trace-20261013/editor/FigureTrace.tsx`).

## Checks

`packages/core/test/provenance.test.ts` (units, data candidates, regenerate
line, PDF info update readable and pages untouched),
`packages/core/test/tabletrace.test.ts` (table files with and without a
source, refusals by path, numeric and non-numeric cells),
`packages/server/test/tabletrace.test.ts` (a table hook's record and its
regenerated rows by sha256; a file's drawn hash, source and change; the
note on numbers only; a file edit rerunning the hook),
`e2e/table-trace.mjs` (trace and regenerate a hooked table, a `write_table`
file traced with its source, a live redraw on a file edit, both tables in
`/FolioTrace`, `FOLIO-TAB-002` on numbers only),
`packages/server/test/provenance.test.ts` (the record's contents; a fresh
run from a trace gives the same sha256; `hook run` and a deck slot share one
key and one cache; an override box, a layout change and a flowed height give
new keys and a queued redraw), `python/tests/test_line_plot_sizes.py`
(exact pixel size, no text under 7 pt, labels inside and apart at several
sizes), `packages/core/test/figuretrace.test.ts`, `packages/server/test/figuretrace.test.ts`
(no FIG-002 for a traced file, FIG-003 on an override box, FIG-004 on a
changed image), `python/tests/test_save_traced.py`, `e2e/plot-trace.mjs` (`folio box`,
`save_traced` from a script run by `folio py` and its trace, the redraw
line run in a plain shell, and an override box redraws at the new pixel size;
`folio trace`; the regenerate command matches).
