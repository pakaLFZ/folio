# Slides: deck export and import

## Demand

- "can we also export the folio deck , e.g. as a exported file with all
  templates it used and its page details, in this case build it and then
  export decks/coni-site-ordering to experiment 56" *(user, 2026-10-13)*
- "add a option to the download button so that user can download folio deck
  copies as well" *(user, 2026-10-13)*: the editor's Download menu offers the
  same archive (see `pptx-export.md`).
- One file carries the whole deck: its slides, its own files, the template
  pack it is pinned to, and a description of every page, so it can be
  archived beside an experiment and opened again elsewhere exactly as it was.

## Behaviour

### Export

- `folio deck export <deck> [--out FILE | --dir DIR] [--with-comments]
  [--without-cache] [--pdf]` writes one zip. Without `--out` it is
  `<deck-folder>.folio.zip` in `--dir` (default the current folder); an
  existing file is never replaced: the first free `<name>-1.folio.zip`,
  `<name>-2.folio.zip`, ... is claimed by an exclusive create, as `folio pdf`
  does. `--out FILE` names the file exactly and is refused when it exists.
- The zip is laid out as a workspace, so unzipping it alone already gives
  something `folio serve` opens:
  - `manifest.json`, `README.md`, `folio.toml`;
  - `decks/<deck-folder>/`: the deck folder as it is: `deck.json`, `slides/`,
    and every file of the folder (figures, `.table.json` files, trace files,
    scripts, data). Left out: dot folders and files (`.shots/`, `.git/`,
    editor files), `__pycache__/` and `*.pyc`, `slides/.archive/`, editor
    backups (`*~`, `*.swp`), earlier `*.folio.zip` exports, and `comments/`
    unless `--with-comments` (which carries the whole `comments/` folder:
    threads, screenshots, attachments, archived ones).
  - the hook cache under `decks/<deck-folder>/.folio/`, unless
    `--without-cache`: each slide's slot state (`hooks/slots/`), every cached
    output a slot state names (`hooks/<key>.png|svg|pdf|out.json` and its
    `<key>.json` record), the stored measurements and warnings
    (`warnings/`), acknowledgements (`acks/`) and table-file records
    (`tables/`). The cache key is made of the inputs, the box and the hook's
    files, never a path, so the imported deck finds every figure and every
    hooked text in the cache and shows them without running a hook: no
    Python is needed to open it. Locks, logs, `tmp/`, drafts and staged
    uploads are never carried.
  - `templates/<pack>/`: the pack the deck is pinned to, at that version,
    the whole folder (pack.json, fonts with their licence files, images,
    hooks), minus dot files, `__pycache__/` and `.archive/`.
  - `<deck-folder>.pdf` at the top, only with `--pdf`: the deck printed by
    the same routine as `folio pdf` (it waits for the hook figures first, so
    the cache in the zip is complete too).
- `manifest.json` holds: `format` (1), the folio version, the export time,
  the deck (id, title, folder, pinned template), the pack (name, version, its
  folder in the zip), the options used, the slide list in presentation order
  (number, id, layout, plain-text title, the layout's slot names after the
  slide's overrides, the slots the slide fills, and the deck files it
  refers to), the warnings stored at export time (code, severity, slide,
  slot, message; fresh ones when `--pdf` rendered the deck), the export's own
  notes, and the sha256 of every file in the zip except `manifest.json`.
- Export notes (printed and kept in the manifest): a slide referring to a
  file outside the deck folder (not carried), a referenced file that does
  not exist, and a hooked slot with no cached output (it will be drawn again
  on import, which needs the hook's runtime; `folio pdf <deck>` or `--pdf`
  draws it first).
- `README.md` lists the slides (number, id, layout, title), the pack and the
  two ways to open it: `folio deck import <file>` into a workspace, or
  unzip and `folio serve <folder>`.

- The editor's Download menu item "Folio deck (.folio.zip)" streams the
  archive `folio deck export <deck>` makes with no options from
  `POST /<deck>/export-folio`, as a browser download named
  `<deck-folder>.folio.zip`. Nothing is written into the workspace.

### Import

- `folio deck import <file.folio.zip> [--into WORKSPACE] [--name NAME]
  [--pack-as NAME]` checks every file against its sha256 in the manifest
  first: a missing file, an extra file or a changed one refuses the import,
  names each, and writes nothing.
- The deck lands in the workspace's `decks/<NAME>` (default: the exported
  folder name). An existing folder is refused, naming `--name`.
- The pack is installed into `templates/<pack>/` when no pack of that name
  is there. When one is, it is reused only if it is the same version with
  the same files (the same sha256 for every file the export rule keeps).
  Otherwise the import is refused: a different version is named with the
  decks that use it, and a same-version pack with other files is named file
  by file. *Decision:* never replace or merge an installed pack, since
  other decks of the workspace use it; `--pack-as NAME` installs the
  exported pack under another name (its `pack.json` name rewritten) and pins
  the imported deck to `NAME@<version>`. Hook cache keys do not include the
  pack name, so the cache still matches.
- A deck whose id is already used by a deck of the workspace gets a fresh
  id (two decks may not share a token); the import says so.
- After an import, `folio check` reports the same warnings as at export and
  the editor shows the deck as exported, figures and hooked text included,
  without Python.

## Never

- Overwriting an existing export file.
- An export that needs the reader to have the pack already, or to rerun the
  hooks to see the figures.
- An import that writes anything before every sha256 has been checked.
- Replacing or merging an installed pack on import.

## Status

- Done 2026-10-13.

## Where it lives

Selection rules, the manifest, the README text and the comparisons in
`packages/core/src/deckexport.ts`; building the zip and the editor's route in
`packages/server/src/deckexport.ts`; writing it to a file in
`packages/cli/src/deckexport.ts`, unpacking and installing in
`packages/cli/src/deckimport.ts`; the free file name is `writeFreshFile` in
`packages/server/src/pdf.ts`.

## Checks

`packages/core/test/deckexport.test.ts`: which files are kept, which hook
keys are carried, the manifest's slide details and digests, the README, the
verification and the pack comparison. `e2e/deck-export.mjs`: the fixture
deck with a hook figure and a table file, exported with `--pdf`; a second
export gets a numbered name; imported into an empty workspace with no
templates and no Python; `folio check` there reports no error codes the
source did not; its PDF has the source's page count; a tampered file is
refused by name; a same-named pack with other files is refused by name and
`--pack-as` installs it.
