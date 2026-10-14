# Slides: PDF

## Demand

- Output is **PDF only** for now; the existing PowerPoint pipeline stays as it
  is. *(user)*
- "add an export button which by default export to pdf with same filename at
  same folder with overwrite protection (e.g. use filename-[number].pdf). with
  toast of notification. add this button next to the circled position"
  *(user, 2026-10-12)*, the circle on the empty spot in the panel header just
  left of the inbox icon.
- "change the doc icon to download icon from lucid, and since browser always
  open just make it download as a file rather than save in the same folder"
  *(user, 2026-10-13)*. Superseded below: the button writes nothing into the
  workspace any more; the browser downloads the PDF instead. The CLI's own
  file (`folio pdf`, no `--out`) keeps the same-folder, overwrite-protected
  name.

## Behaviour

- `folio pdf <deck> [--out FILE] [--wait S] [--slides s001,s002]` prints the
  print page (every slide at 1:1, one per page) with headless Chromium, the same
  renderer and webfonts as the live view, at the pack's canvas size (960 x 540
  pt for `lectern`).
- Before printing it waits, up to `--wait` seconds (default 120), for the
  deck's hook figures: on the running server's queue when a server runs, or by
  drawing them itself when none does. Figures still drawing when the wait ends
  are printed from their last good version and listed.
- It prints the open-comment table, the warnings (measured by the same page)
  and the output path, and exits 0 unless the report flags ask otherwise.
- Without `--out` the CLI's file is named after the deck's folder and written
  beside it: `decks/<name>/` becomes `decks/<name>.pdf`. If that file exists it
  is never overwritten: the first free one of `<name>-1.pdf`, `<name>-2.pdf`,
  ... is written instead. The free name is claimed by an exclusive create
  (`wx`), retried on the next number when it already exists, so two exports at
  once never write the same file. ~~Without a path the file is
  `decks/<deck>/<title>.pdf`.~~ *Superseded (user, 2026-10-12: "same filename
  at same folder with overwrite protection").* `--out FILE` still writes
  exactly that file. ~~The button writes the same way, so it and `folio pdf`
  agree.~~ *Superseded (user, 2026-10-13: "since browser always open just make
  it download as a file rather than save in the same folder"); the button no
  longer writes into the workspace at all, see Export button below.*

### A slide that does not render is an error, never a blank page

- "It must be easy to learn and use for agents" and "Agent should being able
  to view page directly as image" *(user, 2026-10-13)*. A dogfood run after a
  merge, with the web app not rebuilt, gave blank pages from `folio shot`,
  `folio pdf` and `folio check` and reported "0 errors, 0 warnings, 0 notes":
  a rendering failure looked exactly like success, and an agent would trust it.
- Every slide on the print page renders inside its own error boundary (one
  inside json-render's, which otherwise draws nothing and only logs). A slide
  whose layout throws, or which the renderer leaves without a drawn layout,
  or whose layout's text slots did not all report a measurement, gets
  **FOLIO-RND-001** (error): "Slide s003 did not render: <reason>."
  `check`, `pdf` and `shot` report it (the live view posts the failure with
  its measurement; the panel's Warnings tab that once showed it was removed,
  *user, 2026-10-13*, see `spec/warnings/warning-model.md`).
- The slide area shows a visible error box (red, the reason, and the hint to
  run `pnpm build:web` when the web app may be stale) instead of white, so a
  screenshot or a PDF page shows the failure too.
- A slide whose file cannot be read stays FOLIO-SPEC-003, and an unknown layout
  FOLIO-SPEC-002; neither is also called a render failure.
- **Stale web build.** When the CLI (`check`, `pdf`, `shot`, `serve`) serves a
  web build older than the sources it was built from (`packages/web/src`,
  `index.html`, `vite.config.ts`, `packages/core/src`), it prints one line to
  stderr: "folio: the web app in <dist> is older than its sources (<file>);
  run pnpm build:web". The check compares file times only; it is skipped
  silently when the sources are absent (an installed package). A missing
  build is named the same way. `FOLIO_WEB_DIST` points the server at another
  build (the checks use it to serve a copy).

### A whole deck prints in seconds, and a stuck print says what it waits for

- `folio shot decks/<talk> --sheet` and `folio check` of
  that deck (12 slides, about 20 pictures) both failed with a bare
  "page.waitForFunction: Timeout 60000ms exceeded", while one slide shot in
  about a second *(found 2026-10-13)*. The print page stacks every slide in
  one column (12 slides is about 8,600 px), and its pictures were
  `loading="lazy"`: headless Chromium never scrolls, so the 12 pictures more
  than about 3,700 px down never started loading, and the page waited on them
  forever. Measured on a copy of the deck: before, timeout at 60 s; after,
  `shot --sheet` 2.3 s, `check` 1.8 s, `pdf` 2.8 s, `pptx` 5.4 s.
- On the print page (`mode: "print"`) every picture (figure slots, the
  layout's background and its decoration images) loads eagerly; the editor,
  View and thumbnails keep lazy loading (`imageLoading` in
  `packages/web/src/slide/env.tsx`).
- Until it is ready the print page publishes `window.__FOLIO_PENDING__()`:
  its own loads not yet in (the slide files, the pack fonts, the hook states,
  the comment), then every picture not loaded and every table still reading
  its file, each as `<slide>/<slot>`. When the ready wait times out,
  `openPrintPage` (the one wait `shot`, `check`, `pdf`, `pptx` and the export
  routes share) fails with "the print page was not ready after 60 s; still
  waiting for s006/fig:a image <url>; ..." (eight items, then "and N more"),
  or says the page never started drawing and names `pnpm build:web`.

### Export button

- The newer PowerPoint export demand makes Download open a two-choice popover, PDF and PowerPoint (.pptx), with tooltip "Download". Choosing PDF still uses this section's PDF route and downloads through the browser. See `pptx-export.md`. *(user, 2026-10-13)* A third choice, Folio deck (.folio.zip), was added the same day (`pptx-export.md`, `deck-export.md`).

- An icon button (lucide `Download`, the inbox button's size and hover, the
  shared tooltip "Download PDF") stands in the panel header immediately left
  of the inbox. ~~lucide `FileDown`, tooltip "Export PDF".~~ *Superseded (user,
  2026-10-13: "change the doc icon to download icon from lucid").* It
  downloads the open deck by `POST /<deck>/export-pdf` on the running server.
- The server prints the deck the same way `folio pdf` does, through
  `exportDeckPdf` in `packages/server/src/pdf.ts`: it waits for the deck's
  hook figures on its own queue (up to 120 s), prints the print page with the
  same renderer, and streams the PDF bytes straight back as the response body
  (`Content-Disposition: attachment; filename="<name>.pdf"`), with the file
  name, the number of active warnings and the number of figures still drawing
  in response headers (`x-folio-file`, `x-folio-warnings`, `x-folio-stale`).
  Nothing is written into the workspace by this route; see Never. The page
  turns the response into a download with a blob URL and a click on a
  hidden link, so the button keeps control of busy state and errors across
  the render (`fetch` first, not a bare `<a href>` navigation, which Chrome
  would otherwise just open or silently download with no feedback).
- Feedback is a toast at the top of the scene (the editor's notice, placed
  as `spec/chrome/style.md` says,
  `aria-live="polite"`): "Exporting PDF…" while it runs, kept until the
  answer; then "Saved <name>.pdf" (with ", N warnings" and ", N figures still
  drawing" when there are any), gone after about 4 s; or "PDF export failed:
  <reason>".
- The button is disabled while its export runs.

## Never

- Overwriting an existing PDF when no `--out` was given (CLI). *(user,
  2026-10-12)*
- Exporting without visible feedback. *(user, 2026-10-12)*
- A second copy of the print routine for the button: the CLI and the server
  route call one function in `packages/server/src/pdf.ts`.
- A slide that failed to render reported as clean, or printed as a white page.
  *(user, 2026-10-13)*
- A stale web build served without a word.
- A lazy picture on the print page, or a print wait that times out without
  naming the slide, slot and file it was still waiting for.
- A second renderer for print (react-pdf, a template engine): line breaks would
  differ from the live view.
- The export button writing `decks/<name>.pdf` (or a numbered copy) into the
  workspace: the browser always opens a PDF it is handed instead of saving it,
  so the button downloads the bytes directly. *(user, 2026-10-13: "since
  browser always open just make it download as a file rather than save in the
  same folder")* The CLI (`folio pdf`) is unaffected and still writes its file.

## Where it lives

`packages/server/src/pdf.ts` (printing, the free name, the route),
`packages/cli/src/pdf.ts`, `figures.ts` (the figure wait `folio shot` shares),
`headless.ts`, `packages/web/src/print/PrintView.tsx`,
the render check in `packages/core/src/rendercheck.ts`, the error box in
`packages/web/src/slide/RenderBoundary.tsx`, the stale-build line in
`packages/server/src/webbuild.ts`,
the button in `packages/web/src/editor/ExportPdf.tsx`.

## Checks

`e2e/pdf-lines.mjs`: the PDF breaks the note on the same words as the live
view (18 lines compared); the MediaBox is 960 x 540.
`packages/server/test/pdf.test.ts`: the free name (`<name>.pdf`, then `-1`,
then `-2`; concurrent writers get distinct files; nothing is overwritten) and
the export route against a temporary deck with a fake printer.
`e2e/render-errors.mjs`: a slot component made to throw (an injected script
in a copy of the build) gives FOLIO-RND-001 from `check`, `pdf` and `shot`
and a red error box in the picture; an old build prints the `pnpm build:web`
line and a fresh one does not. `packages/core/test/rendercheck.test.ts`,
`packages/server/test/webbuild.test.ts`, the RND case in
`packages/server/test/checks.test.ts`.
`e2e/print-tall.mjs`: twelve figure slides added to a copy of
`decks/example`; `shot --sheet`, `check` and `pdf` of the whole deck finish
in under 30 s, every picture has loaded when the page is ready, and a picture
whose request never answers makes the print page fail naming `t07/fig:a` and
its file (without the fix all three time out at 60 s). The `notReady`
messages in `packages/server/test/pdf.test.ts`.
`e2e/export-pdf.mjs`: the button, the toast text and its place (below the
top row, centred between the panes), a Playwright download event with a
`.pdf` filename and valid PDF bytes, and that no file lands in the
workspace's decks folder.
