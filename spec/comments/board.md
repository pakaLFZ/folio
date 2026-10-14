# Comments: the inbox as a task board

## Demand

- "consider also add centralized comment management system for user."
  *(user, 2026-10-12)*
- "can u design it so that its like an industry task trackpad, with held,
  done, queue, and queue can adjust priority with dragging. so its like
  multiple column." *(user, 2026-10-12)*
- The slot-list line on every board card ("note", "fig:a", "title, subtitle,
  note, label:a, fig:a, caption") struck through in red, which marks a
  removal: a card shows no slot list. *(user, 2026-10-12)*
- "add a setting button here, and in there we can hide the done column"
- "when I drag it should be real drag" (said of the faded browser ghost that
  drifted beside the cursor while the card stayed behind, greyed).
- The five column subtitles ("Waiting for an agent; top first", "Claimed by
  a worker", "The agent answered; your turn", "Parked; agents leave these",
  "Resolved and archived") struck through in red: remove them.
  *(user, 2026-10-12)*
- On a marked-up screenshot of the board's top bar: remove the Author input
  and the Following toggle; the "Every deck" and "Any slot" selects are
  native-looking and out of place, redesign them as chrome filter controls in
  cavitas's style: pill triggers that open a small glass menu, keyboard
  friendly, showing the active value with a clear way back to "all".
  *(user, 2026-10-12)*
- On opening the deck filter's native dropdown: "this is pure ugly. properly
  design and implement this" *(user, 2026-10-12)*
- On the "Any slot" filter, struck out: "remove this" *(user, 2026-10-12)*
- The grid icon in the board's top-left corner circled in red: "replace this
  with return button" *(user, 2026-10-12)*. The user works on one deck per
  session.
- The deck filter ("Every deck 75 / Example deck 54 / Second deck 21") struck
  out in red: "in single deck mode remove this." *(user, 2026-10-12)*
- "just make draft a new column" *(user, 2026-10-12)*
- "in setting we can select which column to show" *(user, 2026-10-12)*
- "consider make hover to be right at top right with no extra margin to the
  card. use proper tooltip, and on top right of each column add clear all and
  when clear all is clicked show popover asking r u sure" *(user, 2026-10-12)*
- On a screenshot of the confirm popover, its title struck through in red
  ("Clear 10 cards from Drafts?"), the explanation paragraph struck through in
  red, and the "Cancel" and "Discard drafts" text buttons circled: "make it
  one line with x and check icon only" *(user, 2026-10-12)*
- "remove the tooltip for clearall as well since it already have the popover"
  *(user, 2026-10-12)*
- A screenshot of the board marked in blue around the Queue column's single
  card: "margin not match". The card's left gap to the column edge (~12 px)
  was narrower than its right gap (~26 px, where the scroll gutter sits); the
  same asymmetry showed in Drafts and Done. *(user, 2026-10-12)*
- A screenshot of all seven columns squeezed to fit the full width: "this
  page consider give each column a min width and then allow horizontal
  scroll. and when one comment is opened, make it floating on top of all
  column thus dont take space" *(user, 2026-10-13)*

## Behaviour

- **Single deck mode** is folio.toml leaving `[editor] show_deck_list` off,
  the default. The server writes the setting into the inbox page's bootstrap
  as it does for the deck page (`window.__FOLIO__.editor.showDeckList`), with
  the workspace's deck when it has exactly one (`inbox.onlyDeck`).
  - In single deck mode the board shows one deck: the one named by `from`,
    else the workspace's only deck. Without `from` in a workspace of several
    decks it shows every deck. The page asks `/api/inbox?scope=<token>`, which
    narrows the rows, the column counts (Drafts included) and the unread
    count to that deck.
  - The deck filter is not rendered, and a `deck` key in the URL is ignored.
  - A card (and a draft) drops the deck name: its line reads slide id, then
    age; the slide id takes the muted ink the deck name had, so the line
    keeps one stronger and one fainter value. When the fallback shows every
    deck, cards keep their deck names.
  - With `show_deck_list = true` the board is as below: every deck, the deck
    filter and deck names on cards.
  - `folio inbox`, `folio comment next` and agents are unaffected: they see
    every deck unless they filter.

- `/inbox` shows the user's drafts and every comment of every deck as cards
  in six columns, left to right. ~~Seven columns, a **Questions** column
  first~~ *(superseded 2026-10-13: "the question component lives within the
  tiny conversation within the comment conversation list"; a questionnaire
  is a message in its comment's chat, `questions.md`)*:
  - **Drafts**: the user's unsent comments (`.folio/drafts/`), newest saved
    first. Agents never see them; they are not tasks yet.
  - **Queue**: open, the agent's turn, unclaimed; in priority order, top first.
  - **In progress**: claimed by a worker (`assignee`), the agent's turn.
  - **Review**: a worker replied last or marked it answered; the user's turn.
  - **Held**: parked by the user; agents must not work on it, and it raises no
    "awaits a reply" note.
  - **Done**: resolved and archived (the newest 30 shown, the rest on request).
- A column header holds its title and its count, and at its right end a
  quiet "Clear all" text button while the column has cards; the empty-state line
  inside a column ("No drafts", "No task waits for an agent.", "Nothing
  needs you.", "Empty") stays.
- **A card's gap matches the header's inset.** Every column's cards sit
  `--panel-pad` from the column's left and right edges, in every column
  (Drafts, Queue, Done, all of them) and whether that column's list scrolls or
  not, the same inset the header's title and "Clear all" sit at. The list
  reserves its scroll gutter on the right only (`scroll-stable`, as the
  editor's panel body does) and narrows its own right padding by
  `--scrollbar-w`, so the reserved space and the padding always add back to
  `--panel-pad`; the left side carries plain `--panel-pad` with nothing
  reserved. A scrollbar, present or not, never makes one side's gap wider
  than the other. *(user, 2026-10-12: "margin not match")*
- **A draft card** is the same card as a comment's: the region preview, the
  slide id (after the deck name in deck list mode), the age, and the draft's
  text ("(sketch only)" when it has none). A draft has no screenshot until it
  is sent, so its preview is an empty dashed frame. Clicking it opens the
  editor on its slide with `?draft=<id>` to finish it; it opens no chat. Its
  one hover action, "Discard draft", moves it to the drafts archive
  (`.folio/drafts/<user>/.archive/<day>/`); nothing is deleted.
- A card shows, top to bottom, the region's screenshot; deck, slide and age
  on one line, with an unread dot (followed comments only); the last message
  and its author; the assignee, and "orphaned" when its slot or slide is
  gone. The message sits directly under the deck line. The comment's slots
  stay in its record, for the slot filter, the search and agents.
- **Dragging** a card within Queue sets its priority; the moved comment takes
  the midpoint of its new neighbours' ranks, so only its own file is written.
  Dragging between columns: to Held parks it, to Queue releases it (and clears
  the assignee), to Done resolves it, out of Done reopens it. In progress and
  Review are entered by agents' actions. Drafts are neither a source nor a
  target: a draft cannot be dragged, and no card can be dropped on Drafts.
  A draft becomes a Queue card only by being sent from the editor.
- **A drag is real.** The card itself lifts and follows the pointer at full
  opacity, held at the point the pointer took it, slightly larger (1.02), with
  the glass shadow and a tilt under 1 degree. Where it came from a gap of its
  height stays until it leaves that column, then closes. The column under it
  opens a gap where it will land: in the Queue at the index under the
  pointer, in Held and Done at the top (they are newest first). A column that
  takes the card is outlined, the one under it shaded; an empty one reads
  "Drop here". The drop slides the card into its gap, then the same move is
  sent to the server (a queue drop takes the midpoint rank of its new
  neighbours). A refused move slides the card back and a note under it says
  why.
- Dragging near a column's top or bottom scrolls it; near the board's sides
  scrolls the board (column by column on a phone).
- The mouse lifts a card after 5 px of movement and touch after a 180 ms press,
  so a click or tap still opens it. From the keyboard: focus a card, Space
  lifts it, the arrows move it within and across columns, Space drops it and
  Escape cancels; each step is announced to screen readers.
- Every drag animation takes under 200 ms on the chrome's ease, and none run
  under prefers-reduced-motion.
- Every move has buttons on the card (up, down, hold or release, resolve) that
  appear on hover or keyboard focus and always on touch screens.
- **The action strip** sits flush in the card's top-right corner, its top and
  right hairlines on the card's own edge, with no margin. Its top-right and
  bottom-left corners take the card's radius (6 px) and the other two are
  square, so it reads as a tab attached to the corner. It keeps its own glass
  surface and hairline over the preview.
- **Tooltips** on the board are the chrome's `Tip` (the editor's tooltip): an
  opaque card in the chrome's type after a short delay. Each names the action
  ("Move up the queue", "Hold", "Resolve", "Back to the queue", "Discard
  draft", "Open on its slide", "Back to the deck", "Board settings", "Theme"),
  followed by its shortcut where one exists (the card buttons have none). No
  board button carries a native `title`. The "Clear all" button itself carries
  no tooltip: the popover it opens is the explanation. (Supersedes: a tooltip
  on "Clear all" naming what it does in that column, removed 2026-10-12 as
  redundant with the popover.)
- **Clear all**, per column: a click opens a small glass popover anchored to
  the button, sized `--radius-menu`, holding one compact row of two icon
  buttons sized like a card's hover actions (`size-6`, `rounded-chip`): an X
  (ghost, quiet) that cancels, and a check (filled ink, the primary action)
  that confirms. No title, no explanation paragraph, no text buttons. Each
  icon carries the chrome's `Tip` and a matching `aria-label`: the X says
  "Cancel"; the check names the action with the count and, where the column
  name does not already say it, the column ("Discard 10 drafts", "Resolve 21
  cards from Queue", "Clear 21 cards from Done"). Esc, a click outside, and
  the X all cancel; the X takes the focus first. Nothing is deleted and every
  clear can be undone:
  - **Drafts**: the check discards every draft to the drafts archive, as
    "Discard draft" does.
  - **Queue, In progress, Review, Held**: the check resolves each card, so it
    moves to Done.
  - **Done**: the check takes the cards off the board. Each comment keeps its
    status `resolved` and its archive folder and gains `clearedAt` (the
    time); the inbox (the board and `folio inbox`) leaves out a resolved
    comment with `clearedAt`, while `folio comment search` (also with
    `--status resolved`) still finds it. Reopening a comment removes
    `clearedAt`, so a reopened and resolved-again card shows in Done again.
  - The board sends one request, `POST /api/inbox/clear {column, cards:
    [{deck, id}]}`, naming only the cards the column shows (under the search,
    and only that deck's in single deck mode), so a card that arrives
    meanwhile is not cleared. The server runs the whole batch in one
    synchronous pass, the way every comment write is serialized, and skips a
    card that has since left the column (an agent claimed it, say). Only the
    user clears; a worker is refused.
  - (Supersedes: a popover with a struck-through title "Clear N cards from
    <Column>?", an explanation paragraph, and "Cancel" / a named text confirm
    button ("Discard drafts", "Resolve all", "Clear"), replaced 2026-10-12 by
    the one-line icon-only popover above.)
- **Return button**: the board's top-left corner holds a back arrow ("Back
  to the deck"), the same size and style as the corner icon it replaced. The
  editor's inbox link carries where it came from, `/inbox?from=<token>&slide=<id>`,
  and those keys stay in the URL through every filter change. With them the
  button is a link to `/<token>/?slide=<id>`; without them it goes Back when
  the previous page is this site, else to the only deck when the workspace
  has one, else to `/`. It is always an `<a href>`, so a middle-click opens a
  new tab. The landing page at `/` still exists when visited directly.
- The top bar holds, after the title: Search, the deck filter (deck list
  mode only), board settings and the theme switch, all 32 px high with one
  8 px gap. The filter lives in the URL.
- The deck filter is the chrome's `Select`: a 6 px button naming the current deck
  (or "Every deck") with a small chevron, its hairline darker while a deck is
  set. It opens a glass menu (10 px radius, `--radius-menu`, hairline edge, soft lift) with a
  120 ms fade and scale, none under reduced motion, at least as wide as the
  pill. Rows are 13 px, 32 px high; the chosen row has a check, the
  highlighted row a faint ink fill. "Every deck" sits apart at the top and
  returns the board to every deck. Each row carries a mono count of the
  board's cards (under the current search) in that deck. Arrows, Home, End,
  typeahead and Enter work; Esc closes and returns focus to the pill.
  Picking filters exactly as the `deck` query key does.
- **Each column has a 280 px minimum width** (`sm:min-w-[280px]`, the same
  280 px the phone layout already used as its fixed column width). On a
  desktop a column is otherwise `flex-1`, so the seven columns still share
  any extra width equally when the window is wide enough to give each one
  more than 280 px; below that the columns stop shrinking at 280 px each and
  the board scrolls horizontally (`overflow-x-auto` on the board's `<main>`,
  already there for the phone's one-column-at-a-time swipe) instead of
  squeezing a column's cards illegibly thin. A phone keeps scrolling one
  column at a time by its existing snap points; a desktop's scroll has no
  snap. *(user, 2026-10-13, superseding "Columns are equal on a desktop":
  they no longer squeeze past 280 px, they scroll)*
- **Board settings**: an icon button ("Board settings") at the far right of
  the top bar opens a small glass popover, operable by keyboard and closed by
  Esc or a click outside. It holds a list of rows, each a label and a control;
  a later setting is one more row. It holds one switch per column, in board
  order: ~~"Show Questions column"~~ *(added and removed 2026-10-13 with the
  column)*, "Show Drafts column", "Show Queue column", "Show In progress
  column", "Show Review column", "Show Held column", "Show Done column", all
  on by default. (Supersedes the single "Show Done column" row.)
- A hidden column leaves the layout and the remaining columns share the
  width; counts, drags between the shown columns and the card buttons work as
  before. At least one column stays shown: the switch of the last shown
  column is disabled.
- Drag and drop ignores hidden columns: they are neither sources nor targets.
- Hidden cards still exist and still match a search: while a search is
  typed, a line above the board says how many matches sit in each hidden
  column that holds any ("2 matches are in the hidden Done column"), with a
  "Show Done" (or "Show Held", ...) button that turns that column back on.
- The choice is kept per browser in one `localStorage` key,
  `folio.board.hiddenColumns`, a JSON list of the hidden columns (all shown
  if it cannot be read), and in the URL as `hide=<view>,<view>` (e.g.
  `hide=drafts,done`), which travels with the rest of the filter; an address
  that says `hide=` wins over the browser's choice. Earlier choices carry
  over: the old `folio.board.showDone = "0"` key reads as Done hidden while
  the new key is unset, and an old `done=hidden` address reads as
  `hide=done`.
- **Agents**: `folio comment next --worker W` claims the top Queue card and
  prints it (parallel workers take different cards); `folio inbox [--status
  queue|progress|review|held|done|open] [--json]` lists the board; `folio
  comments` lists a deck in queue order. Agents never see the user's drafts.

## Never

- A single list sorted by date as the inbox (the first design, replaced the
  same day by the board).
- A shared order file: the order is a rank on each comment.
- The slot list on a board card.
- A hidden Done column that silently swallows search matches; a hidden column
  left as an empty gap; board settings in a modal dialog.
- Native HTML5 drag ghost images: a translucent copy beside the cursor while
  the card stays greyed in place (replaced 2026-10-12 by the lifted card,
  @dnd-kit).
- Column subtitles: a one-line description under each column title (removed
  2026-10-12; the column names say it).
- An Author filter on the board (removed 2026-10-12; `folio inbox` and the
  API keep their own query).
- A Following filter on the board (removed 2026-10-12); following is CLI-only
  now (`folio comment follow|unfollow`) since the board's chat panel bell was
  itself replaced by Resolve on 2026-10-13, see `chat-and-following.md`.
- A slot filter ("Any slot") on the board (removed 2026-10-12); agents
  filter by slot with `folio comment search --slot`.
- An Every deck grid link on the board (replaced 2026-10-12 by the return
  button).
- A deck filter in single deck mode (removed 2026-10-12; the board shows the
  deck the user came from).
- A native `<select>` anywhere in the chrome: its OS list, blue highlight and
  system font are not the chrome.
- A Drafts toggle button and a strip above the board (replaced 2026-10-12 by
  the Drafts column).
- Dragging a draft into a task column, or a card into Drafts: a draft turns
  into a task only when it is sent.
- Hiding every column: the last shown column's switch is disabled.
- Native `title` tooltips on the board (replaced 2026-10-12 by `Tip`).
- A clear without confirmation; a clear that deletes a file; a clear sent as
  one request per card.
- A titled confirm popover with an explanation paragraph and "Cancel" / a
  named text confirm button (replaced 2026-10-12 by the one-line X/check icon
  popover).
- A tooltip on the "Clear all" button (removed 2026-10-12; the popover it
  opens already explains the action).
- A column's right-side card gap wider than its left because a scrollbar
  gutter is reserved only there, or either gap differing from the header's
  own inset (fixed 2026-10-12; both read `--panel-pad`, the right padding
  narrowed by `--scrollbar-w` to match).
- An action strip inset from the card's corner with a margin (moved flush
  2026-10-12).
- A single "Show Done column" setting with its own `folio.board.showDone`
  key and `done=hidden` address (replaced 2026-10-12 by one switch per
  column; both are still read once, as migration).
- A column squeezed thinner than 280 px to fit seven columns in a narrow
  window (fixed 2026-10-13: a column's floor is 280 px, the board scrolls
  horizontally past it instead).
- A `ChatPanel` that reserves board width or header padding
  for itself (a spacer column, `sm:pr-[400px]` on the header): it is a fixed
  overlay, so it never changes a column's width or the header's layout
  (fixed 2026-10-13; see `chat-and-following.md`).

## Where it lives

`packages/core/src/inbox.ts` (`viewOf`, `onBoard`, `clearable`, `boardOrder`, `filterInbox`),
`comments.ts` (`rankBetween`), `packages/server/src/comments/service.ts`
(`move`, `claimNext`, `clear`), `routes.ts` (`/api/inbox/*`),
`packages/web/src/inbox/` (`InboxPage.tsx`, `BoardColumns.tsx`, `BoardCard.tsx`, `ClearColumn.tsx`, `inboxData.ts`,
`BoardSettings.tsx`, `ReturnButton.tsx`; the dragging in `boardDnd.tsx` and `boardDndParts.tsx`),
`packages/web/src/ui/settings.tsx` (`SettingsList`, `Toggle`),
`packages/web/src/ui/select.tsx`.

## Checks

`e2e/board.mjs`, driving the mouse in steps: the lifted card stays under the
pointer at opacity 1; the Queue shows a gap at the hovered index; the drop
lands at that index with the server's status and rank to match; dragging
reorders the queue; each column header holds only its title and count, and
no former subtitle appears on the page; `folio comment next` claims the
top card and it moves to In progress; a held card raises no note and agents
skip it; dragging back releases it; dragging to Done archives it; no card
renders its comment's slot list; the settings button opens its popover
with one switch per column; turning "Show Done column" off removes Done
while the other five stay and the URL says `hide=done`, the choice survives
a reload, and turning it on brings Done back with its count; hiding all but
Queue disables Queue's switch; an old `folio.board.showDone = "0"` key
alone still hides Done; Drafts comes first and is not draggable, and there
is no Questions column or "Show Questions column" switch;
Space, ArrowRight, Space moves a card one column; a refused move returns with
a note; a plain click still opens the card; no Author input, Following
toggle, slot filter or native `<select>` on the bar; picking a deck from the
keyboard shows only its cards; "Every deck" restores the full count; the
editor's inbox link carries `from` and `slide`, the board has no Every deck
link, and the return button links to and opens that deck at that slide.
The action strip's top-right corner lies on the card's; hovering a card
button shows a `Tip` and no board button has a `title`; "Clear all" on
Queue opens a popover whose check icon's `aria-label`/`Tip` names the count
("Resolve N cards from Queue"), Esc leaves every card, the X (Cancel) leaves
every card, the check resolves exactly the cards shown while a card created
after the popover opened stays; the check on Done ("Clear N cards from
Done") empties Done while `folio comment search --status resolved` still
finds those comments; the check on Drafts ("Discard N drafts") moves every
draft to the drafts archive.
In single deck mode, opened with `from`, only that deck's cards show,
with no deck filter and no deck name on a card, and the Queue, unread and
Drafts column counts equal `/api/inbox?scope=`; without `from` both decks show and
still no filter; the deck menu checks run with `showDeckList` patched on in
the page bootstrap, where cards name their deck.
`e2e/inbox.mjs`: two decks on one board, unread dot, `folio inbox --json`
matches the page, a draft in the Drafts column reopens on its slide with its
text and region, no Drafts toggle on the bar, "Discard draft" retires a
draft to the archive, bulk resolve.
`e2e/board.mjs` also checks the layout at a narrow window (1024 px, all seven
columns shown): every column's width is at least 280 px and the board's
`scrollWidth` exceeds its `clientWidth` (it scrolls rather than squeezing);
opening a comment overlays the right side of the board (the `ChatPanel`
`aside` is `position: fixed` on a phone, `position: absolute` at the board's
own width) and no column's width changes from before it opened; the panel's
top edge sits within 1 px of the first shown column's own top edge (not the
window's), so the "Inbox" header row stays visible above it.
