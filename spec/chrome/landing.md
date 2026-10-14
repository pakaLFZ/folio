# The landing page

## Demand

- The page at `/` lists every deck the server holds, links to the inbox and
  carries the theme control *(from code)*.
- Marked-up screenshot, red strokes over each row's "N slides", "N open" and
  "N warnings": remove them; keep the title and the `/token/` address
  *(user, 2026-10-13)*.
- A "New deck" button next to the Inbox button that asks for a title and a
  template pack and makes the deck the way `folio init-deck` does, then opens
  it *(user, 2026-10-13)*.
- "add search, rank by name or edited time" *(user, 2026-10-13)*.
- Screenshot circling the empty space just left of a row's `/token/`: "when
  hover, add a archive button here, which then makes it invisible" *(user,
  2026-10-13)*.
- "make the deck home page auto update to show new deck" *(user, 2026-10-13)*.

## Behaviour

- **Header**: the name `folio` on the left; on the right, in this order, New
  deck (outline, small, lucide `Plus`), Inbox (outline, small, lucide
  `Inbox`, with the unread count) and the theme control.
- **Deck rows**: one per deck, its title and its address `/<deck8>/` in mono,
  nothing else. The row links to the deck's editor.
- **Archive**: on hover of a row, or keyboard focus inside it, a small ghost
  icon button (lucide `Archive`, 14 px icon in a 28 px target, tooltip
  "Archive", accessible name "Archive <title>") appears just left of the
  token. Clicking it archives the deck and its row leaves the list at once;
  the click never follows the row's link. Archiving never deletes or moves
  anything: `deck.json` gains `"archived": true` and `"archivedAt"` (ISO
  8601), and the deck's write log records `archive-deck`.
  - Why a flag and not a move to `decks/.archive/`: the deck keeps its folder,
    its token, its comments and hook state, so links, agents' paths and the
    inbox keep working, and bringing it back is flipping one field.
  - An archived deck stays mounted: its address `/<deck8>/` still opens the
    editor, and its comments stay on the board. Only the landing list hides
    it.
- **Archived (N)**: a quiet ghost button at the end of the search and sort
  row, shown while any deck is archived, toggles (`aria-pressed`) the list to
  the archived decks only, titles in the muted ink. Their rows carry
  **Unarchive** (lucide `ArchiveRestore`, accessible name "Unarchive
  <title>") in the same place; it takes `archived` and `archivedAt` out of
  `deck.json`. When the last archived deck is brought back the toggle turns
  off and disappears. Search and sort apply to either list. With every deck
  archived, the main list reads "Every deck is archived."
- **Routes and CLI**: `POST /api/decks/<deck8>/archive` and
  `/unarchive` (404 for an unknown token). `GET /api/decks` omits archived
  decks unless `?archived=1`, and each row carries `archived`. It re-reads
  every `deck.json` per request, so a deck archived from the CLI drops out of
  the running server's list without a restart. `folio deck archive <deck>`
  and `folio deck unarchive <deck>` call the same `DeckStore.setArchived` the
  route does.
- **Search and sort**: one row between the header and the list, shown when
  the workspace has any deck:
  - a search field (lucide `Search` inside it, placeholder "Search by title
    or token", accessible name "Search decks") narrows the rows as it is
    typed to the decks whose title or token contains the text, ignoring
    case; slashes around a pasted `/<deck8>/` are ignored. With no match the
    list is replaced by "No deck matches <text>.";
  - a two-choice segmented control, "Sort decks": **Edited** (newest edit
    first, the default) and **Name** (A to Z, ignoring case, numbers in
    numeric order). The choice is kept in `localStorage` under
    `folio-landing-sort`, read and written inside try/catch; with storage
    blocked the default holds.
  - A deck's edited time is `editedAt` in `GET /api/decks`, ISO 8601,
    computed by the server as the newest modification time of the deck's
    `deck.json` and `slides/*.json` (`DeckStore.editedAt`).
- **New deck** opens a popover under the button (not a modal), holding:
  - **Title**, a one-line field, focused on open;
  - **Template**, one radio row per pack the server can give a deck: every
    pack loaded from the workspace's `templates/`, then every built-in pack
    the workspace has not installed, each as `name@version`. The default is
    `plain@1`, the pack `folio init-deck` uses without `--template`;
  - Cancel and Create. Create is disabled until the title has text.
- **Create** posts `POST /api/decks` with `{ title, template }`. The server
  calls the same function as `folio init-deck` (`createDeck` in
  `packages/server/src/newdeck.ts`): a built-in pack the workspace lacks is
  copied into `templates/` first, then `decks/<slug>/deck.json` is written,
  where the slug is the title in lower case with every run of characters
  other than letters and digits made one hyphen (`Group meeting` gives
  `decks/group-meeting`). The deck is mounted on the running server at once,
  without a restart, and the page goes to its editor at `/<deck8>/`.
- **Refusals** are shown in the popover in the danger colour and nothing is
  written:
  - 409 when `decks/<slug>` already exists, naming it: `decks/group-meeting
    already exists; choose another title.`;
  - 400 when the title has no letter or digit;
  - 422 when the pack is neither installed nor built in, naming the installed
    and built-in packs (the same refusal `folio init-deck` gives).
- `GET /api/deck-templates` returns `{ templates, default }` for the popover.
  `GET /api/decks` still carries each deck's slide count, open comments and
  warnings for agents and scripts; the page no longer shows them.
- **Live list**: the page updates itself, with no reload and no polling,
  when a deck appears (made by `folio init-deck`, the New deck button in any
  tab, or a folder an agent writes into `decks/`), disappears (its
  `deck.json` gone), is archived or unarchived, is retitled, or is edited
  (its place in the Edited order moves). The search text, the sort, the
  Archived toggle and the scroll position stay; rows change in place.
  - The server keeps one watcher over `decks/` (folders, each `deck.json`,
    and `slides/*.json`; hidden folders such as `.archive/` and `.folio/`
    are ignored). Changes to one folder settle for 100 ms, then the folder is
    rescanned: a new `deck.json` is mounted on the running server (no
    restart), a vanished one unmounted, a known one re-read.
  - Each rescan publishes one event on the existing event stream, under the
    workspace channel (stream key `workspace`, subscribed as
    `/events?decks=workspace`, beside any deck tokens the same browser
    follows): `deck.added` and `deck.changed` carry the deck's light row
    (`token`, `title`, `template`, `dir`, `archived`, `editedAt`), and
    `deck.removed` carries `token` and `dir`. The inbox's every-deck stream
    receives them too and ignores them.
  - The page reads `GET /api/decks?archived=1` once, then applies each event
    to its list: added or changed replaces the deck's row or adds it, removed
    takes it out. Every (re)connection of the stream, and a `resync`, reads
    the list again, so nothing made while the stream was down is missed.

## Never

- Slide, comment or warning counts on the landing rows (removed 2026-10-13).
- A second copy of the deck-making logic in the server: the CLI and the route
  share `createDeck`.
- Overwriting or reusing an existing deck folder from the New deck form.
- Deleting a deck, from the page or the CLI; archive is the only way out of
  the list.
- Polling `/api/decks` for changes, or a second event channel beside the
  stream the editor and the inbox already use.

## Where it lives

`packages/web/src/landing/Landing.tsx`, `packages/web/src/landing/DeckRows.tsx`,
`packages/web/src/landing/liveDecks.ts`, `packages/web/src/landing/deckEvents.ts`,
`packages/server/src/deckwatch.ts` (the `decks/` watcher and the workspace
channel), `packages/server/src/workspace.ts` (`unmount`),
`packages/web/src/landing/NewDeck.tsx`,
`packages/server/src/newdeck.ts`, `packages/server/src/deckstore.ts`
(`editedAt`), `packages/server/src/server.ts` (`/api/decks`),
`packages/cli/src/deckcmds.ts` (`initDeckCommand`, `archiveDeckCommand`),
`packages/core/src/deck.ts` (`archived`, `archivedAt` in the deck schema).

## Checks

- `packages/server/test/newdeck.test.ts`: create under the slug with the pack
  installed and the deck mounted; a duplicate title refused by name; an empty
  title and an unknown pack refused; `editedAt` is the newest of `deck.json`
  and the slide files, other files ignored; `setArchived` writes and removes
  the two fields and leaves the rest of `deck.json` byte for byte; the
  archive and unarchive routes, `/api/decks` with and without `?archived=1`,
  a 404 for an unknown token, and a deck archived by another writer dropping
  out of the list.
- `e2e/new-deck.mjs`: rows without counts; the template list with plain@1
  chosen; Create lands in the new deck's editor; a duplicate refused in the
  popover; Edited order by default, Name order, the sort kept across a
  reload; search by title in any case, by token, and the no-match line;
  Archive shown on hover, the row hidden without leaving `/`, hidden after a
  reload and counted in Archived (1), Unarchive restoring it; `folio deck
  archive` and `unarchive` against the running server; with the page open
  and searched, a deck made by `folio init-deck` appearing at the top, a
  slide added by `folio new` moving its deck to the top of Edited, and a deck
  archived by the CLI leaving the list, with the search text kept and no
  reload.
- `packages/server/test/deckwatch.test.ts`: over a real
  `/events?decks=workspace` stream, a deck folder written by another process
  is mounted and announced (`deck.added`), its archive and a slide edit come
  as `deck.changed`, moving the folder away unmounts it (`deck.removed`);
  hidden folders and other files announce nothing.
- `packages/web/test/deckEvents.test.ts`: how each event changes the list.
