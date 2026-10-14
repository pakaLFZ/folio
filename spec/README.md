# Feature specifications

Each file records a feature as the user described it. Code follows the spec.
When a description changes, the new demand is first restated to the user and
confirmed, then this folder is updated, and only then is the code changed. A
file holds at most 500 lines and covers one topic.

Every file has the same parts:

- **Demand**: what the user asked for. A line marked *(user, date)* is the
  user's own description, quoted where the words matter. A line marked
  *(from code)* was written down from what folio does and has not yet been
  confirmed by the user. Where the two disagree, the user's line decides.
- **Behaviour**: what a person or an agent sees, stated so that it can be
  checked.
- **Never**: the designs that were tried or proposed and rejected, so they are
  not built again.
- **Status**: where the code does not yet meet the demand.
- **Where it lives** and **Checks**: the code and the tests that hold it.

The standing priorities are that **text never shrinks to fit** (a slot that
holds too much is a warning, never a smaller font), that **a warning never
fails a build**, and that **parallel writers never share a file** (one file per
slide, per comment, per slot state). The warning model is `WARNINGS.md`; the editor's visual system is `packages/web/src/styles.css` and
`packages/web/PRODUCT.md`.

| Folder | File | Topic |
|--------|------|-------|
| `slides/` | `packs.md` | Portable template packs: theme, layouts, slots, roles, aliases, export and import; the Slide tab's template manager |
| | `rich-text.md` | Per-character formatting in slide text and editable PPTX runs |
| | `lists.md` | Bullet and numbered lists in text slots, editing keys and PPTX bullets |
| | `overflow.md` | Line limits per slot, measured in the rendered page; never shrink; warnings only |
| | `tables.md` | Table slots, named table styles, the `below` flow of any slot |
| | `shapes.md` | Shape slots: rectangles, ellipses and circles, arrows and lines; named shape styles and colours; text inside a shape; `folio shape add` |
| | `drawing.md` | Drawing on the slide: the Shape and Text box tools and popovers, alignment help, and every element's copy, cut, paste and delete |
| | `undo.md` | Ctrl+Z and Ctrl+Y over every editor operation, a per-deck history of the user's writes on the server, `folio undo`, `folio redo`, `folio slide restore` |
| | `drafts.md` | Drafts: what the user draws in the editor is a sketch for agents, shown in Edit only; FOLIO-DRF-001 tells agents to draw the real thing |
| | `blocks.md` | Block slots: text boxes and code blocks styled by the pack's named block styles; columns, grow, highlighted code in popular languages; `folio block add` |
| | `overrides.md` | A slide overriding any value its template gives it, validated by the template's own types |
| | `pack-tools.md` | Import a pptx as a draft pack, merge, scripted edits, export as a zip or a pptx, the version rule, `folio pack guide` |
| | `editing.md` | What the user may change in the browser, and how a save meets a worker's edit |
| | `pdf.md` | `folio pdf`: same renderer, canvas size, waiting for figures |
| | `pptx-export.md` | Editable PowerPoint deck export and the Download format menu (PDF, PowerPoint, folio deck) |
| | `shots.md` | `folio shot`: one PNG per slide by id, range, page, change or warning; paginated contact sheets; a slot-box overlay |
| | `deck-export.md` | `folio deck export`: one zip with the deck, its pack, its hook cache and a manifest of every page; `folio deck import` with sha256 checks |
| | `vocabulary.md` | The vocabulary bank: the user's words for slide text, one bank per deck inheriting the pack's; FOLIO-VOC-001; user edits recorded; `folio vocab` |
| `live/` | `server-and-addresses.md` | One server per workspace, the port band held across restarts (`folio restart`), `127.0.0.1` and `::1`, `/<deck8>/`, the bootstrap |
| | `vscode-open.md` | `folio open` and `serve --open`: VS Code's tunnel asked for through its CLI socket, stale sockets walked past |
| | `streams.md` | One event stream per browser, resume, events against readings |
| | `workers.md` | Agents writing slides in parallel through the CLI and the HTTP API |
| | `viewing.md` | Which deck, slide and selection the user has open now: `folio viewing`, `GET /api/viewing` |
| | `watch.md` | `folio watch`: one line per comment, follow-up or answer the user makes; the folio agent skill, `folio skill install` and `folio quickstart` |
| `hooks/` | `hooks.md` | A template's script that fills any slot (text, figure, table) from what the slot receives |
| | `queue.md` | The hook queue: derived, isolated, fair, paused, rolled out |
| | `python.md` | Python in a TypeScript package: runtimes, `folio_hook`, warm workers, `folio_client` |
| | `provenance.md` | Every hook figure traced (`folio trace`, the PDF entry, "Made by"), called without a deck (`folio hook run`, `folio_hook.call`), redrawn at every box size |
| `comments/` | `region-comments.md` | A region, a sketch and a message on a slide; screenshots and components |
| | `attachments.md` | Files uploaded with any message |
| | `board.md` | The inbox as a task board: Queue, In progress, Review, Held, Done |
| | `chat-and-following.md` | Every comment a tiny chat; following by the user and by agents |
| | `opening-a-comment.md` | From the board to the slide: region and sketch restored, then and now, drafts |
| | `search.md` | Searching every comment, any status, the whole chat and file names |
| | `questions.md` | Questionnaires an agent asks the user as a message in a comment's chat: single, multi, text and long answers; `folio ask --comment` and `folio answers` |
| `warnings/` | `warning-model.md` | One record per warning, codes, baseline, acknowledgement, output formats |
| `chrome/` | `style.md` | The editor chrome in the cavitas material; contrast; the slide is the scene |
| | `landing.md` | The page at `/`: the deck list with search, sort and archive, the inbox link and the New deck button |
| | `zoom.md` | Wheel and pinch zoom about the pointer, pan, back to fit; overlays follow, measurement does not |
| `process/` | `testing.md` | How a change is checked: build, unit tests, typecheck, isolated browser checks, one full parallel run |
| | `release.md` | The minimal release: one bundled CLI, the built editor, Node and Playwright only |
| | `platforms.md` | Linux, macOS and Windows: the setup commands, the Python found on PATH, `folio doctor`, portable scripts, CI on all three |
