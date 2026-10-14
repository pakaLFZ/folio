# Live: the event stream

## Demand

- See edits in real time; optimise opening, syncing and streaming many decks
  at once. *(user, 2026-10-12)*
- "refresh of the viewpoint is a bit laggy and deserves improvement. sometimes
  I refresh the page to see updates." *(user, Windows, 2026-10-14)* While
  agents write slides with the CLI, a script re-renders a figure under the
  same file name and a pack file is edited by hand, each change is to appear
  in the open editor within about a second, without a reload and without the
  view jumping (current slide, zoom, scroll, selection and the text being
  typed stay).

## Behaviour

- One browser holds **one** Server-Sent Events stream whatever the number of
  tabs and decks: a SharedWorker owns it; where there is none, one tab elected
  with Web Locks owns it and relays over a BroadcastChannel; a stream per tab
  is the last fallback. Tabs subscribe and unsubscribe to deck tokens.
- An edit travels as `{deck, slide, rev, baseRev, patch}`, not the whole slide;
  a tab whose revision does not match fetches that one slide.
- **Events** (edits, comments, warnings, hook results) are never dropped or
  merged. **Readings** (drawing states, draft saves, presence) keep only the
  last per key. A subscriber's backlog is 64; if events alone overflow it, the
  deck gets one `resync` and the tab refetches the manifest and the changed
  slides.
- Every event carries a per-deck sequence number in the SSE id, with the
  server's epoch. A reconnect resumes from `Last-Event-ID` out of a 512-event
  ring per deck; a gap or a restarted server gives `resync`. Heartbeat every
  15 s.
- The first connection resumes too. A deck page's bootstrap carries the
  stream cursor taken before its slides were read (`cursor`), and the stream
  starts from it, so a slide written between the page load and the stream's
  connection (a second or more with the SharedWorker starting) is replayed,
  not lost.
- A page drawn in place (the board opening a deck, no reload) keeps the tab's
  stream; the tab keeps its last 512 messages, and the deck replays those
  after its bootstrap's cursor, or takes a `resync` when they no longer reach
  back or the stream dropped since *(2026-10-13)*.
- A deck's browser-facing file watcher starts with its first subscriber and
  stops after a minute without one. A browser whose one stream carries every
  deck (any tab with the board or the follow bell, which the editor always
  has) names its open decks (`/inbox/events?watch=<deck8>,...`), and those
  decks' watchers run as for a deck subscriber *(2026-10-14)*: without it the
  editor never had its deck's watcher, so figures, table files, `deck.json`
  order changes and comments written to disk never reached it. Slide files of every deck are also watched
  by the hook service, so a worker's edit is drawn and checked with nobody
  looking.
- Figures are served by content hash with `immutable` caching.
- **Every file change reaches the open editor, settled** *(2026-10-14)*. The
  deck watcher, the hook service's slide watcher, the workspace watcher and
  the pack watcher read every path with forward slashes, so a write on
  Windows (where the watcher reports `C:\...\slides\s001.json`) is a slide
  change, not an unknown file. Before a change is published its file is read
  whole: a PNG ends with its `IEND` chunk, a JPEG with its end marker, a JSON
  file parses; a file still being written is read again every 25 ms (up to
  2 s), so a half-written file is never published. A file that has gone is
  published as gone only after it stays missing for 250 ms: an atomic replace
  that NTFS reports as unlink then add is one change, and a slide never
  leaves the rail for it. A file that has not been written is published at
  once, with no fixed debounce.
- **A replaced figure redraws** *(2026-10-14)*. A `file` event carries the
  file's content version (`v`, the first 16 hex of its sha1). The editor
  keeps the last version of each deck file and every figure, table file and
  thumbnail built from a deck path asks for `files/<path>?v=<version>`, so an
  image overwritten under the same name gets a new address and the old copy
  in the browser's cache can never answer for it. The server sends a
  versioned file `immutable` only when its bytes still have that version,
  otherwise `no-cache`, as is every unversioned file.
- chokidar drops a `change` that follows another on the same path within
  50 ms and never sends it later, so every event's file is read once more
  60 ms after it: the last of two quick writes is never lost.
- A pack file edited by hand reloads the pack 150 ms after its last settled
  write and tells each deck that uses it; the editor fetches the pack and
  redraws in place.

## Never

- One EventSource per tab first: browsers allow 6 HTTP/1.1 connections per
  origin and an SSH forward cannot carry HTTP/2, so the seventh tab hangs.
- Polling for edits.
- A figure address that does not change when the file does: the browser kept
  the old picture until a reload (found 2026-10-14). A per-tab change counter
  in the address was worse, since `?v=1` of the next session met the
  `immutable` copy of the last one.
- Separator-bound path tests (`/slides/`, `split("/")`) on what a watcher
  reports: on Windows every CLI write went unseen until the next `folio new`
  forced a resync (found 2026-10-14).
- A stream whose first connection starts from "now": every write in the gap
  after the page read its slides was lost until a reload (found 2026-10-13
  by `e2e/tables.mjs`, failing about one run in three).

## Where it lives

`packages/server/src/hub.ts`, `watcher.ts`, `settle.ts` (settled changes and
content versions), `manifest.ts`, `routes-deck.ts` (versioned files),
`packages/web/src/stream/` (`core.ts`, `worker.ts`, `client.ts`),
`packages/core/src/stream.ts`.

## Checks

`e2e/multitab.mjs` (10 tabs, 2 decks, 1 stream; a CLI edit reaches every tab
in about 40 ms), `e2e/resume.mjs` (forward cut for 5 s while a worker edits;
the edit arrives, no reload), `e2e/flood.mjs` (1000 readings on one deck;
another deck's edits arrive in 4 to 10 ms), unit tests for `coalesce`,
`replayFrom` and cursors. `e2e/live-refresh.mjs` (a `folio patch` of the slide in view shows
within 1.5 s; a figure overwritten in place with another picture shows within
1.5 s; the current slide and the scroll are unchanged after both);
`packages/server/test/settle.test.ts` (whole-file checks, the unlink-then-add
replace is one change, a real removal is published, Windows paths).
