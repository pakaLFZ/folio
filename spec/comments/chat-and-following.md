# Comments: a tiny chat, followed by the user and by agents

## Demand

- "can u , for each comment, make it like followable so that agent can follow
  it and user can follow it as well, like having a tiny chat inside."
  *(user, 2026-10-12)*
- "red means remove (for simplicity) and input bar should be made a shared
  component and it should be one line unless content is multi line"
  *(user, 2026-10-12)*: struck through on the Comments tab were the hint line,
  the textarea's resize grip, the word "Attach", "or paste, or drop files", a
  thread's slot-list row and each message's author-and-time line. Following
  stays (asked for above), so the bell moves to the thread's header row.
  *(Superseded 2026-10-12: the header row and its bell are gone from the
  Comments tab, see below.)*
- "just make all the issues default show first msg. delete red part that I
  select" *(user, 2026-10-12)*, with the number circles and follow bells of
  the Comments tab struck out in red. Following stays on the board's chat
  panel.
- "can make resolve button an icon button on top left and only show when
  hover on that card and add better card border?" *(user, 2026-10-12)*
- A blue box around the "No comments on this slide." line: "add a input bar
  directly on top for new comment" *(user, 2026-10-12)*
- "right now I have to click the black text bubble to deselect it. make the
  interaction on the whole card. and click image dont trigger open image."
- "also shift + enter = next line, enter = send (for the send button"
  *(user, 2026-10-12)*
- On a screenshot of a closed card showing "dont use fog. no fog pls" with an
  unread reply from the agent (the top-right inbox icon badged 1), a blue
  circle at the card's top-left corner: "add a bell icon here (in the closed
  state) to show that there is a new response" *(user, 2026-10-13)*.
- A marked-up screenshot of the board's chat panel header, its follow bell
  struck through in red: "change the bell here to check icon to make it
  resolve button. then make input bar always at bottom" *(user, 2026-10-13)*
- A screenshot of the board with a comment open and the panel's column of
  space reserved beside it: "when one comment is opened, make it floating on
  top of all column thus dont take space" *(user, 2026-10-13)*
- A screenshot of the floating panel's header, its second line (the mono
  slot list, "label:a, fig:a, label:b, fig:b, label:c, fig:c…", and the
  "followed by …" part sharing that line) struck through in red: "remove red
  lablled part" *(user, 2026-10-13)*. The title line (deck, slide, the
  Resolve/open/Close buttons) stays.
- A screenshot of the floating panel sitting ~16 px from the window's top
  (past the "Inbox / Search" header), with a red box drawn from the board
  columns' top edge downward: "make the floating panel's top align the top
  of other columns" *(user, 2026-10-13)*.
- A screenshot of the Comments tab's right panel, with the new-comment
  composer (paperclip, "New comment on this slide" input, Send) marked at
  the top of the tab: "move this to the button of the tab" *(user,
  2026-10-14)*, meaning the bottom, just above the tab bar (layers /
  Comments / outline), with the issue list scrolling above it.

## Behaviour

- **One input bar** (`ui/InputBar.tsx`, `data-testid="input-bar"`) is where
  every message is typed: the new comment, a thread's reply in the Comments
  tab, and the board's chat panel. It is a single row with 6 px corners (`--radius-control`): a paperclip icon
  button (aria-label "Attach files") on the left, the text field, and Send on
  the right, the one filled button, disabled while the bar is empty. The field
  is one line tall when empty, grows a line at a time as the text wraps or
  breaks, up to six lines, then scrolls; cleared, it is one line again. Enter
  sends, Shift+Enter breaks the line. Attached files sit as small chips above
  the row, each with a remove button; paste and drop of files still attach.
  Send carries a `Tip` tooltip reading "Send (Enter) · Shift+Enter for a new
  line", with "Enter" and "Shift+Enter" in the tooltip's mono style; the
  paperclip's tooltip reads "Attach files".
- A message bubble carries no visible author or time line: the side says who
  wrote it (the user right, agents left) and hovering the bubble shows the
  author and the time as its title.
- An issue in the Comments tab is its first message as a bubble; selected,
  it adds the rest of the chat and the input bar (see
  `region-comments.md`). It has no header row, so no number, status or bell
  *(superseded 2026-10-12: the header row with the bell)*. The board's chat
  panel header no longer carries a bell either *(superseded 2026-10-13, see
  below)*; following a comment from the browser is gone, and `folio comment
  follow|unfollow <cid> --worker W` is now the only way to change it
  (automatic following — the user follows what they create, a worker what it
  claims or replies to — still applies).
- **Each issue is a card** with a hairline border (`--color-line`) and the
  card radius (`--radius-card`), no fill at rest, 10 px padding, and the
  standard 8 px gap between cards. Hover darkens the border to
  `--color-line-strong`; the selected card keeps that stronger border and
  adds the faint `--color-whisper` fill. The region screenshot keeps its own
  hairline and shrinks to stay inside the card's padding, never touching its
  edge. *(user, 2026-10-12)*
- **The whole card toggles the issue's selection**, not just the bubble:
  clicking the bubble, the region screenshot, or any empty space on the card
  selects an unselected card and deselects a selected one, the same toggle
  `model.setFocus` already did for the bubble. The card (and the bubble) stays
  keyboard-focusable; Enter or Space toggles it the same way. Two things on
  the card do their own job instead of toggling: the reply input bar (its
  text field, its buttons, its attachment chips) and the hover Resolve icon,
  both of which stop the click from reaching the card. *(user, 2026-10-12)*
- **Image thumbnails in a Comments tab card never open.** The region
  screenshot and any image attachment inside an issue card only toggle the
  card, like any other click on it; they do not open in a new tab. A
  non-image attachment (a PDF, a CSV, ...) keeps its normal open/download
  link. The board's chat panel (`ChatPanel.tsx`), which shares the same
  `Chat`/`MessageItem`/`AttachmentList` components, keeps opening images on
  click: the shared `AttachmentList` takes an `openOnClick` prop, default
  `true`, and only the Comments tab passes `false`. *(user, 2026-10-12)*
- **Resolve is an icon** (the Check icon, aria-label and tooltip "Resolve")
  at the card's top-left corner, shown only while the pointer is over that
  card or the card holds keyboard focus, on every card, selected or not. The
  first bubble's row keeps a 32 px left inset so the icon never covers it. In
  View mode there is no Resolve. *(user, 2026-10-12)*
- **A new-comment input bar sits at the bottom of the Comments tab**, pinned
  just above the tab bar (layers / Comments / outline), the same width as the
  issue cards (same left and right edges); the issue list scrolls in the
  space above it, the bar itself never scrolling with it *(user, 2026-10-12;
  moved to the bottom 2026-10-14, "move this to the button of the tab")*.
  Its bottom sits no further from the tab bar than every other tab's content:
  the tab's own `pt-2` holds the top gap above the list, and the bottom gap
  is only the panel body's existing `--panel-pad` padding plus the tab bar's
  own `--tabbar-margin`, the same two tokens every tab already carries, never
  an added bottom padding of its own *(user, 2026-10-14: "gap to the bottom
  margin is a bit too big")*.
  Its placeholder is "New comment on this slide" *(user, 2026-10-12)*. Sending creates a comment on
  the current slide with no region: the server already falls back to the
  whole slide's box `[0, 0, canvas.w, canvas.h]` when a comment is created
  with `region: null` and no marks (`CommentService.create` in
  `packages/server/src/comments/service.ts`), so no server or core change was
  needed — the bar only sends `region: null, marks: []`. It goes through the
  same create path as the bubble composer (`POST /:deck/comments`, via
  `CommentsModel.sendSlide`, which mirrors `send`), so drafts, uploads and
  screenshots behave the same; the new comment appears in the list at once,
  in execution order. With no comments the tab shows just the input bar: the
  "No comments on this slide." line is gone. In View mode the bar is not
  shown, same as the rest of the tab's write affordances. A comment just sent
  this way, or from the on-slide bubble, opens closed like every other card
  (see `region-comments.md`'s "Leaving the bar"); the user opens it by
  clicking it, as today.
- **A closed card with an unread reply shows a bell** (lucide `Bell`, filled,
  in `--color-ink` like the inbox badge's fill) at the card's top-left corner
  — the same corner Resolve uses, so hovering the card swaps the bell for
  Resolve — with the tooltip "New reply" *(user, 2026-10-13)*. It reads the
  same unread count the inbox uses (`api/inbox?scope=<token>`, built on
  `inboxIndex`'s `ReadState`), so it is never shown when the newest message is
  the user's own: `unread` counts only messages from someone else. Selecting
  the card clears it at once (`CommentsModel.setFocus` zeroes it locally) and
  the real read mark is written the moment the opened card's `Chat` mounts, as
  it already was. This bell is a notification, not the thread's follow
  toggle; the Comments tab still carries no follow bell (see **Never** below).

- Clicking a card on the board opens the comment as a chat panel **floating
  over the board's right side** (the whole board on a phone): its own glass
  surface and shadow, `w-[380px]`, absolutely positioned (`position: fixed`
  on a phone) within a `relative` wrapper around the board's `<main>`, so its
  **top edge lines up with the board columns' own top edge** (`sm:top-0` in
  that wrapper, not a fixed offset from the window) and its bottom sits
  `--panel-pad`-ish above the columns' bottom the same way `bottom-3` already
  did; the "Inbox" header row (title, unread count, search, filters,
  settings, theme) stays above the panel, uncovered. The board underneath
  keeps its full width and columns, and stays scrollable (nothing reserves
  space for the panel: no spacer column, no header padding). Closed by its
  own X, by Escape, or by clicking anywhere on the board that is not a card
  (a column's empty area, the gap between columns, a column header) — any of
  those three while a comment is open. *(user, 2026-10-13, superseding
  "beside the board": the panel used to push a `w-[380px]` gap into the
  board's `<main>` and the header to `sm:pr-[400px]`, both gone, and then sat
  `sm:top-3` from the window — above the header, not the columns — fixed
  2026-10-13 to `sm:top-0` of the board wrapper instead.)* Inside: bubbles in order, the
  user's on the right in ink, agents' on the left in white with a hairline,
  each with author and time; files and screenshots inline; a composer at the
  foot with attach, paste and drop. New messages appear live and the panel
  scrolls to them. A modified click on a card opens its slide instead. The
  editor's Comments tab draws a thread with the same chat.
- **The panel's header is one line**: the deck, slide, a Resolve button (the
  Check icon, tooltip and aria-label "Resolve"), a link to open the comment on
  its slide, and Close. *(Supersedes: a follow bell in that spot, replaced
  2026-10-13; and a second mono line below the title naming the comment's
  slots and "followed by …", removed 2026-10-13 — neither the slot list nor
  the follower names show anywhere in the panel now.)* Resolve does exactly what dragging a card
  to Done, the board's card-level Resolve icon and the Comments tab's hover
  Resolve icon all do: it moves the comment to the Done column and sets its
  status to `resolved` (`CommentService.move` to `"done"`, which calls
  `setStatus(..., "resolved", ...)`), through the same `POST
  api/inbox/move {deck, id, column: "done"}` the board's drag-to-Done and
  card button use. It is hidden once the comment is resolved, matching the
  board card (no Resolve icon in the Done column) and the Comments tab (no
  Resolve icon in View mode, and the chat's own foot already reads "Resolved.
  Reopen it to write again." in place of the input bar).
- **The input bar sits pinned to the panel's bottom at all times**: the chat's
  column (`Chat`, non-`compact`) stretches to the panel's full height, so its
  message list (not the bar) is what grows and scrolls, newest message
  visible, with auto-scroll on a new message as before. A short thread no
  longer leaves the bar floating mid-pane under the last message; a long
  thread scrolls behind a bar that never moves. *(user, 2026-10-13)*
- A comment keeps `followers`. The user follows what they create; a worker
  follows what it claims or replies to. `folio comment follow|unfollow <cid>
  --worker W` changes it; there is no browser control for following any
  longer; the only one that existed, the board's chat panel bell, is gone as
  of 2026-10-13, replaced there by Resolve.
- Unread counts (the board's header, the editor's inbox button, the landing
  page) and unread dots come only from followed comments. Opening a chat marks
  it read. With the browser's permission, a new message from someone else in
  a followed chat raises a notification while the page is in the background.
- An agent listens with `folio comment watch <cid> --worker W` (or
  `--following` for every comment it follows): one JSON line per new message
  (comment, deck, slide, status, author, time, text, attachment paths).
  `--until-reply` exits after the first message from someone else, so an agent
  can ask the user and wait; `--timeout S` ends the wait (exit 4). It follows
  the server's stream, or polls the files when no server runs.
- A message that carries a questionnaire (`question: {id, status}`, posted
  with `folio ask`) is drawn in the chat as its form, in its place in time
  order on the agent's side, and counts as unread like any agent reply
  *(user, 2026-10-13: "its part of the comment converastion")*; see
  `questions.md`.

## Never

- A hint line in the composer ("No region yet: drag on the slide, or click a
  slot"), the word "Attach" beside the paperclip, or "or paste, or drop files".
- A visible author-and-time line over each message; the time is a tooltip.
- A resize grip on the input, or an input taller than its text when it is
  short.
- A second composer: every place a message is typed uses `InputBar`; no
  component keeps its own textarea and send row.
- The slot list ("title, subtitle, note, ...") as a row in a thread card.
- A follow bell, a number or a status text in a Comments tab issue.
  *(user, 2026-10-12)*
- A full-width Resolve button under the thread; a Comments tab card with a
  grey fill and no border at rest. *(user, 2026-10-12)*
- "No comments on this slide." once the tab has a new-comment input bar; a
  copy of `InputBar` for the new-comment bar instead of reusing the shared
  component. *(user, 2026-10-12)*
- A Comments tab card whose only way to deselect is the bubble; a click on
  the region screenshot or an image attachment that opens it instead of
  toggling the card. *(user, 2026-10-12)*
- A sent comment opening selected/expanded instead of closed, on the slide
  side or the slide tab. *(user, 2026-10-13)*
- An unread bell shown when the newest message is the user's own, or one that
  survives the card being opened. *(user, 2026-10-13)*
- A follow bell in the board's chat panel header (removed 2026-10-13,
  replaced by Resolve); `FollowBell` and `setFollowing` as browser components
  — following is CLI-only now (`folio comment follow|unfollow`).
- An input bar that sits wherever the thread happens to end, floating under a
  short thread's last message instead of pinned to the panel's bottom
  (fixed 2026-10-13: the chat column fills the panel's height).
- A board panel that reserves layout space for itself: no spacer column in
  the board's `<main>`, no `sm:pr-[400px]` on the header. It floats
  (`position: fixed`) over the board instead (fixed 2026-10-13).
- A panel with no keyboard or click-away way to close: Escape and a click on
  the board outside a card both close it now, alongside its own X
  (added 2026-10-13).
- A second header line in the floating panel naming the comment's slots or
  "followed by …" (removed 2026-10-13; the header is the title line alone).
- A floating panel anchored to the window's top (`sm:top-3` of the viewport),
  which sat above the "Inbox" header instead of level with the columns
  (fixed 2026-10-13: it is positioned within the board's own wrapper, top
  flush with the columns' top).

- An effect whose body returns a value: Chromium's `scrollIntoView` now
  returns a promise, and React called it as a cleanup ("destroy is not a
  function"). Effects that scroll or post have block bodies.

## Where it lives

`packages/web/src/ui/InputBar.tsx`, `packages/web/src/comments/Chat.tsx`,
`Composer.tsx` (the new comment's bar), `CommentsTab.tsx` (the issue list,
the unread bell), `useComments.ts` (`send`, `useUnread`),
`packages/web/src/inbox/ChatPanel.tsx` (the Resolve button, the floating
overlay), `packages/web/src/inbox/InboxPage.tsx` (the Escape listener and the
board's click-outside-closes handler), `packages/web/src/inbox/BoardCard.tsx`
(`stopPropagation` on a
card's own click, so opening one does not also close it), `inboxData.ts`
(`moveCard`, shared with the board's drag and card-level Resolve), `notify.ts`,
`packages/server/src/comments/service.ts` (`follow`, `move`),
`packages/server/src/comments/routes.ts` (`GET /api/inbox`, `POST
/api/inbox/read`), `packages/cli/src/watchcmd.ts`,
`packages/core/src/comments.ts` (`withFollower`), `inbox.ts` (`following`,
`inboxIndex`'s `unread`).

## Checks

`e2e/chat.mjs`: an agent follows; `watch --until-reply` prints the user's
message typed in the board's panel and exits 0; the agent's reply appears live
on the agent's side; after unfollowing (via `folio comment unfollow --worker
user`), a new message leaves the unread total and the dot unchanged. The
input bar: empty, its field is one line high (within 2 px); three lines make
it about three lines high; cleared, one line again; it is the thread reply in
the Comments tab and the board's chat; Enter sends and Shift+Enter does not;
the panel's header carries a Resolve button, not a bell, and clicking it
moves the card to Done (`comment.status === "resolved"`) and hides the
button; with a short thread (one message) the input bar's bottom edge sits
against the panel's own bottom edge, and it still does with a long thread
(enough messages to scroll), where the list, not the bar, holds the scroll;
opening the panel does not change any column's width (it floats); pressing
Escape and clicking the board outside a card both close it, each reopened
and reverified before the next; a modified click or clicking a card still
opens it (closing it first does not swallow the next open); the panel's
header holds exactly one line of text (the title) and names neither the
comment's slots nor its followers anywhere in the header.
`e2e/comments.mjs`: a Comments tab issue has no bell or status
text; the tab's bottom input bar sends a whole-slide comment (no region) that
appears in the list at once, lines up with the issue cards' left and right
edges, and is absent in View mode; with no comments the tab shows only the
input bar, no "No comments on this slide." text; clicking empty card space
toggles the issue's region exactly like the bubble does; clicking the region
screenshot opens no popup and only toggles the card; sending a comment from
the bottom bar leaves it closed (no "Message the agent" bar) rather than
selecting it; a reply posted with `folio comment reply` shows the unread bell
on the closed card, and opening the card removes it.
