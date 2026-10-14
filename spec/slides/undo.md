# Undo and redo of every editor operation

## Demand

- In one deck the user archived s001 and s008 by accident from
  the editor (2026-10-13 18:15Z) and nothing could bring them back; another
  session restored them by hand from `slides/.archive/`. The user: "add ctrl z to
  all operation" *(user, 2026-10-14)*. Every
  operation means archive and delete, reorder, text and content edits, box
  moves, override changes and comment actions; Ctrl+Shift+Z or Ctrl+Y redoes.
- Whose operations: "Mine, across tabs and reloads" *(user, 2026-10-14)*. The
  history is the user's own operations on a deck, kept on the server, so it
  survives a reload and is shared by every tab open on that deck. An agent's
  or the CLI's writes are never undone by Ctrl+Z.
- On screen: "Keys only" *(user, 2026-10-14)*: no toast, no button, nothing
  added to the editor.
- A CLI restore for an archived slide *(after the
  incident, 2026-10-14)*.

## Behaviour

- **Keys.** Ctrl+Z (Cmd+Z on macOS) undoes the user's last operation on the
  open deck; Ctrl+Shift+Z or Ctrl+Y (Cmd+Shift+Z) redoes it. They act in Edit
  only. With the caret in a text, a text's own edit history comes first, as
  now (`rich-text.md`); once that text's edits are committed as a write, that
  write is one entry here. In an input bar, a search field or any other input
  the browser's own undo stays.
- **What is one entry.** One user write is one entry: an archive (with the
  order change that comes with it), a delete, a reorder, a new or duplicated
  slide, a paste, a slide patch (a committed text edit, a block or table
  edit, a property change), a box move, resize, nudge or reset, an override
  change, a shape added, changed or removed, and a comment sent, resolved,
  reopened, replied to, re-ranked or deleted. A write that touches several
  files (archive plus order) is one entry and is undone in one step.
- **Where it is kept.** On the server, per deck, in `.folio/undo/`: the undo
  list and the redo list. Each entry records, for every file it changed, the
  bytes before and after (absent when the file did not exist) and the
  revision after. Writes from `worker: "user"` are recorded; any other worker
  is not. The lists keep the last 200 entries; older ones are dropped.
- **Undo.** Undo takes the newest entry and writes every file back to its
  before bytes (an archived slide comes back from `slides/.archive/` to
  `slides/`, and the order is restored), as one revision-checked write, then
  moves the entry onto the redo list. Redo does the reverse. Both are logged
  in `.folio/log/<date>.jsonl` as op `undo` or `redo` with the entry's ops.
  A file created by the user is moved into a dated `.archive/` beside its
  original location on undo; redo writes it back. Live tabs see the change
  through the usual events.
- **Never overwrite someone else's write.** If any file the entry touched no
  longer has the entry's after revision (an agent or the CLI changed it
  since), the undo is refused, nothing is written, the entry is left where it
  is, and the refusal is logged; Ctrl+Z then does nothing visible. Redo is
  refused the same way against the before revision.
- **A new operation clears redo.** A new user write after an undo empties
  the redo list.
- **The box-move history** of `drawing.md` (`boxHistory.ts`, current slide
  only, per tab) is replaced by this one.
- **CLI.** `folio slide restore <deck> <slide>` moves the newest archived
  copy of that slide back into `slides/` and puts it back in the order at its
  old place (after the slide that preceded it when it was archived, else
  first), and refuses by name if the slide already exists or has no archived
  copy. `folio undo <deck>` and `folio redo <deck>` apply the user's history
  from the command line with the same refusals, and print what they undid.

## Never

- A toast, a button, a menu item or anything added to the Slide tab for
  undo *(user, 2026-10-14: "Keys only")*.
- Undoing an agent's write from the user's Ctrl+Z.
- A history kept only in the browser tab.

## Status

- Implemented: server history, revision checked undo and redo, editor keys,
  CLI undo, redo and archived slide restore. History holds the last 200 user
  writes per deck and survives reloads and tabs.

## Where it lives

`packages/server/src/write-recording.ts` holds the request's AsyncLocalStorage
context. `fsutil.ts` captures before bytes when an atomic write or move first
touches a deck file; `server.ts` captures after bytes for those paths on success.
No deck is scanned, and writes outside the context are not attributed to the
user. `.folio/` and `.shots/` are excluded. `undo.ts` stores entries and applies
revision checked undo, redo and restore; `deckstore.ts` stores each archived
slide's former predecessor beside its copy. All editor write
routes, including `routes-deck.ts`, `routes-overrides.ts` and
`comments/routes.ts` (including workspace inbox actions), pass through it.
`comments/service.ts` refreshes entries after derived screenshots arrive.
`packages/web/src/editor/ShapeTools.tsx`
handles deck keys, `deckState.ts` and `packages/web/src/api.ts` call the
server; the former `boxHistory.ts` is removed and box writes use `shapeWrites.ts`.
`packages/cli/src/undocmd.ts` implements the commands, dispatched by
`commands.ts` and `overridecmd.ts`.

## Checks

- Unit: an entry with several files undoes and redoes all of them; a created
  file is archived on undo; concurrent writes outside the recording context
  are excluded; unrelated large files are never read; a file changed by
  another worker since makes the undo refuse with nothing written; a new write
  clears redo; the 200-entry cap.
- e2e: archive a slide in the editor, Ctrl+Z brings it back in its place,
  Ctrl+Y archives it again; a reorder, a text edit, a box move, an override
  change and a comment resolve each undo and redo; a reload keeps the
  history; a second tab undoes the first tab's write; an agent write in
  between makes the undo refuse and leaves the agent's change.
- CLI: `folio slide restore` puts an archived slide back at its old place and
  refuses an existing slide by name.

`packages/server/test/undo.test.ts` covers multi-file entries, stale writes,
redo clearing and the cap. `e2e/undo.mjs` covers browser keys across tabs and
reloads, archive, reorder, text, box and override edits, comment sending,
resolution and inbox moves, agent conflicts and CLI commands; it is in
`e2e/run-all.sh`.
