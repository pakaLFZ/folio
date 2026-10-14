# Comments: opening a comment where it was made

## Demand

- "in comment manager, when user clicks a comment, auto go to that page with
  the draft the user made, e.g. the drawing. design the whole thing pls"
  *(user, 2026-10-12)*
- On the floating "Inbox n / m" pill that stepped through the board's
  comments: "get rid of this mode." On the chat panel's open-in-page button:
  "when I click the button just bring me to that page." *(user, 2026-10-12)*
- "can u make swap from review panels to main viewer thing mroe smooth?
  currently there is even a reloading moment" *(user, 2026-10-13)*

## Behaviour

- Every comment has one address, `/<deck8>/?slide=<id>&comment=<cid>`, printed
  by `folio comments` and the status table and used by the board.
- Opening it puts the editor on that slide in Edit (*superseded 2026-10-12:
  in comment mode; "merge comment and edit to edit"*), with the Cursor tool,
  draws the
  comment's region and sketch exactly as drawn, selects it in the Comments
  tab with its thread open, and marks it read. No other comment of the slide
  is drawn *(superseded 2026-10-12: it dimmed the other pins; there are no
  pins)*.
- **Then and now.** The slide always shows its current, live state; a selected
  comment still draws its region and marks on it, as ever. The screenshots
  taken with the comment and each reply stay stored and still show as
  thumbnails in the chat *(superseded 2026-10-12: a control above the toolbar
  used to step the slide itself from "Then" through each reply's screenshot to
  "Now"; "no need always show most recent form" (user, 2026-10-12))*.
- **Drafts.** A comment being written is saved about a second after each
  change to `.folio/drafts/<user>/`, never to `comments/`, so agents never see
  it. The board's Drafts column lists them, first on the left; opening one
  restores its slide, region, sketch, text and uploads. Send files it as a
  comment; Discard, here or on the draft's board card, moves it to the drafts
  archive.
- **From the board and back.** The chat panel's open-in-page button, and a
  card opened in a new tab, are plain links to the comment's address and
  carry no inbox parameters. The editor opens that comment as above and shows
  no inbox controls; the browser's Back returns to the board with its filter.
- **In place, without a reload** *(2026-10-13)*. The board and the editor are
  one page: following a link between them changes the address with
  `history.pushState` and draws the other page in the same document, so the
  event stream, the loaded code and the board stay alive. Hovering a link to
  a deck fetches its bootstrap (`<deck8>/boot?slide=`, with the pack fonts)
  ahead of the click. The board stays on screen until the deck is ready, then
  the deck fades in over 120 ms (none under reduced motion). The board is
  kept, hidden, while a deck is open; the editor's inbox button, the board's
  back arrow and the browser's Back and Forward return to it scrolled,
  filtered and with its chat panel as it was left. A link whose page is the
  previous history entry goes Back rather than adding an entry. A deep link to
  either address still loads the page whole. The deck catches up from its
  bootstrap's cursor with the messages the tab already received, so an edit
  made between the hover and the click is on the slide.
- **Orphans.** A comment whose slot is gone still draws at its pt position and
  says which slot went; one whose slide was archived says so.

## Never

- A full page load between the board and the editor: a blank moment, then the
  editor booting again (bootstrap, stream, render) *(user, 2026-10-13)*.
- The inbox walk mode: a pill over the editor with Back to the inbox, a
  position "n / m" and Previous and Next through the board's comments, or any
  `inbox.*` parameter in a slide address.
- A Then/Now history control on the slide.

## Status

- The design asked that an archived slide open read-only from the archive; the
  editor says the slide was archived but does not open the archived copy.

## Where it lives

`packages/web/src/comments/useComments.ts` (focus, drafts), `Sketch.tsx`,
`CommentToolbar.tsx`, `packages/web/src/inbox/ChatPanel.tsx`, `inboxData.ts`
(`rowLink`), `packages/core/src/comments.ts` (`commentLink`, `marksBounds`);
in place: `packages/web/src/nav.ts`, `PageShell.tsx`, `stream/client.ts`
(`catchUp`).

## Checks

`e2e/inbox.mjs`: the chat panel's open button goes to the slide address with
no inbox parameters, in Edit with the thread and no walk pill, and
Back returns to the board; opening marks it read; a changed slide shows no
Then/Now control; a draft reopens with its text and region.
`e2e/smooth-nav.mjs`: the open button shows the slide with the same `window`
and the same EventSource; an edit made after the hover is on the slide; the
inbox button, Back and Forward return to the board with its column scroll; a
deep link to a comment and to the inbox still loads. Click to slide painted,
loopback, five runs: 167 to 197 ms with a reload, 127 to 176 ms in place
(2026-10-13).
