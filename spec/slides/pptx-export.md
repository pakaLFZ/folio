# Slides: editable PowerPoint export

## Demand

- "implement a pptx export mode, so that download default show a popover asking pdf or pptx" *(user, 2026-10-13)*.
- "make special blocks export as image in ppt" *(user, 2026-10-13)*.
- "add a option to the download button so that user can download folio deck copies as well" *(user, 2026-10-13)*.

## Behaviour

- The editor's Download control opens a popover of three choices, in this order: PDF, PowerPoint (.pptx) and Folio deck (.folio.zip) (lucide `FileArchive`, the same row style). Choosing any starts a browser download; Escape and clicking away close it. ~~two-choice popover: PDF and PowerPoint (.pptx)~~ (superseded by the folio deck item, 2026-10-13).
- Folio deck (.folio.zip) downloads the same archive `folio deck export <deck>` writes with its defaults (hook cache in, comments and PDF out; see `deck-export.md`), named `<deck-folder>.folio.zip`, streamed from `POST /<deck>/export-folio` and never written into the deck folder or the workspace. It waits for no hook: a hooked slot not yet drawn is a note in the manifest, as on the CLI.
- `folio pptx <deck> [--out FILE] [--slides ids]` writes a PowerPoint deck in slide order and reports approximations.
- The export contains the pack's master, layouts, backgrounds and decorations, plus one slide for each selected deck slide. Plain text slots, pictures, tables and shapes remain editable objects. Text retains its declared font size; it never shrinks to fit.
- Code blocks are captured from the print page as high-resolution pictures with source in PowerPoint alt text. Text, card and callout blocks export as editable text runs with run properties (`rich-text.md`). *Superseded 2026-10-13: every block used to be a picture.*
- The server sends PPTX bytes as an attachment from `POST /<deck>/export-pptx`, without creating a deck file.
- Any object represented by a rendered picture instead of a native object is named in the export report.
- A draft (`spec/slides/drafts.md`) is left out of the pptx export, like the print page and `folio shot`: never a slide object, never an approximation. `folio pptx` reports each as `left out: <slide>/<slot> (draft)`.

## Never

- A Download choice that writes to the workspace's `decks/` folder.
- A slide or slot silently omitted because its native PowerPoint representation is unavailable.
- PowerPoint text autofit or reducing a declared font size to avoid overflow.
- Blocks as native text boxes.

## Status

- Implemented and browser-checked (`e2e/pptx-export.mjs`). The editor and CLI use the same writer. A hooked text slot (title, note, caption) is read back through `innerHTML()` and converted to markup in Node (`htmlToMarkup`, unit-tested), never through a Playwright `evaluate` callback with an inner named helper: tsx transpiles with `keepNames`, and a callback's serialized source then calls an `__name` helper that does not exist in the page. The Download menu's `DropdownMenu.Root` needs `modal={false}`, as `RailMenu` already uses, or Radix's modal focus guard blocks pointer events on the rest of the page and the next click (e.g. clicking away to close the menu) hangs. LibreOffice and python-pptx are not installed here, so conversion was checked by hand: unzipped, `[Content_Types].xml`, `presentation.xml`'s slide list, every slide's rels and referenced media checked to resolve, and the exported runs read back to confirm `CO_{2}`-style markup became real subscript runs, not flattened text.
- Slide-specific decoration overrides are not yet baked into a separate PowerPoint layout. A layout's pack decorations are retained.
- Block-picture export has unit and XML checks; its browser e2e check is written but was not run in this sandbox.

## Where it lives

`packages/server/src/pptx/` (shared OOXML writer), `packages/server/src/pptx.ts` (rendering and route), `packages/server/src/deckexport.ts` (the folio deck archive and its route), `packages/cli/src/pptx.ts`, `packages/web/src/editor/ExportPdf.tsx`, `packages/web/src/api.ts`.

## Checks

PPTX unit and structural tests (including a draft shape left out of the slide XML while a final one is present); `packages/cli/test/deck-download.test.ts` (the folio deck route's zip writes nothing into the workspace and `folio deck import` accepts it); `e2e/pptx-export.mjs` (also clicks Folio deck and reads `deck.json`, the pack and the manifest from the download); `pnpm -s typecheck`, `pnpm test`, `pnpm build:web`, and `bash e2e/run-all.sh pptx-export export-pdf chrome-toggles`.
