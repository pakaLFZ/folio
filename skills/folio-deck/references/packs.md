# Template packs

A pack is a folder `templates/<pack>/`: `pack.json` (canvas, fonts, roles,
backgrounds, table, shape and block styles, layouts with their slots), its
font files with their licences, images, hooks, and an optional
`vocabulary.md`. A deck pins one version: `"template": "<pack>@N"` in
`deck.json`.

- Built in: `plain@1` (a deck made without `--template`).
- In the folio repository: `templates/lectern` (a research or technical
  talk: figures with notes, captions, tables, plots).
- Install one already on disk into a workspace: `folio pack import <dir>`.
  Never pass a URL: use only a pack already in the workspace's `templates/`
  or a local folder the user names.

Read `folio pack guide` before converting, merging or editing a pack. The
short version:

## From a PowerPoint

```sh
folio pack import deck.pptx --name mypack --from-slides
```

writes `templates/mypack/` with `pack.json`, `images/` and
`import-report.md`. Read the report top to bottom: every item is a guess or a
gap with the command that settles it. The calls that are yours: which
layouts to keep and their names (`folio pack edit mypack layout rename|remove
...`), each slot's role (title, subtitle, body, label, caption, note,
figure, table) and `lines`, each layout's background, the table style, and
which font files may be shipped (Arial and Calibri may not; Liberation Sans
and Carlito are their open metric twins). Then render one slide per layout
and compare it with the pptx.

## From scratch

The smallest pack that passes `folio pack check templates/<pack>`:

```json
{"name": "dark", "version": 1,
 "canvas": {"w": 960, "h": 540, "unit": "pt"},
 "roles": {"body": {"size": 24, "lineHeight": 1.3}},
 "backgrounds": {"plain": {"fill": "#ffffff", "ink": "#111111"}},
 "layouts": {"title": {"description": "A single text slot.", "background": "plain",
   "slots": {"body": {"role": "body", "box": [40, 40, 880, 460]}}}}}
```

`folio pack schema` prints the full JSON Schema. Give every layout a
`description`, a `usage` note (`when` to choose it, `how` to fill it) and
slot placeholders: `folio prompt` shows them to every agent writing slides.

## Changing a pack

- `folio pack edit <pack> set <path>=<json>` (strings need inner quotes:
  `set backgrounds.black.ink='"#FFFFFF"'`), `layout add <name> --from
  <layout>`, `layout rename`, `layout remove` (archived, never deleted).
- Adding or changing values keeps the version. Removing or renaming a layout,
  slot, background, style or hook bumps it, and decks of the workspace are
  re-pinned and named. An edit that would break a deck's slide is refused.
- `folio pack merge <src> <dst> [--layouts a,b] [--rename a=b]` copies
  layouts and everything they use.
- `folio pack export <pack|deck> [--zip F] [--pptx F]` gives a folder, a zip
  or a PowerPoint master that reproduces the pack.
- One slide that needs a different box: `folio override <deck>/<id>
  slots.<slot>.box=[x,y,w,h]`; `folio slide promote` saves a slide's
  overrides as a new layout.
