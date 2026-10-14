# Live: what the user is looking at

## Demand

- "add a copy button next to the home button so that that button allows user
  to copy deck id, and allow agents to know which deck is currently at view"
  *(user, 2026-10-13)*. The copy button is `spec/chrome/`'s; this file is the
  second half: an agent told "fix this slide" finds the deck and the slide
  without being given an id.

## Behaviour

- Every open editor tab reports what it shows: the deck, the current slide,
  the mode (edit or view), the selected slot (a shape is a `shape:<x>` slot),
  the slides selected in the rail when there are several, and whether the tab
  is visible and focused. It sends a small `POST /api/viewing` when any of
  these change (at most one every 150 ms), on `visibilitychange`, focus and
  blur, every 20 s as a heartbeat, and a `closed` beacon on `pagehide`; it reports again whenever its stream
  (re)connects. After `closed` the tab sends nothing more until a `pageshow`
  brings the page back: the `visibilitychange` a closing page fires after
  `pagehide` used to list the closed tab again for 75 s (found 2026-10-14;
  the check had passed only while the second tab's stream was still opening).
- The server keeps the reports in memory, one per tab; nothing is written to
  disk. A report goes when its tab says `closed`, when no open stream
  carries its deck any more (the editor's stream carries every deck, so this
  is when the browser's last folio page goes), or when no report has
  come for 75 s.
- A tab's **activity** time moves when it reports a change or reports while
  focused; a heartbeat from a hidden tab does not move it. Tabs are ranked
  visible first, then focused, then most recently active.
- `GET /api/viewing` returns `{version, tabs}`; each tab gives `deck` (the
  workspace-relative folder, e.g. `decks/example`, the form the copy button
  gives, which every command takes), `token`, `title`, `slide` (`id`,
  `position`, `of`, `layout`, `title`) or null, `mode`, `selection`
  (`slot`, `slides`), `visible`, `focused` and `activeSecondsAgo`.
  `?since=V&wait=S` holds the reply until the version moves past `V` or `S`
  seconds pass. The version moves when a tab appears, goes, or changes any
  reported field other than its times.
- `folio viewing [path] [--json] [--wait-change [--since V]] [--timeout S]` prints the top
  tab: deck path, title, slide id and position, layout, mode, selection and
  how long ago it was active; the other tabs follow, one line each. With no
  tab open it says so; with no server running it says no editor is open.
  Both exit 0. `--wait-change` waits for the next change and prints the new
  state; `--since V` waits past the version an earlier `--json` gave, so a
  change between the two calls is not missed; at `--timeout` it exits 4 (the code `folio answers --wait` uses).
- `folio status` gives one line: the deck and slide in view, or that no
  editor is open. `folio prompt` tells agents: "To act on what the user is
  looking at, run `folio viewing`." `folio_client.viewing(base)` returns the
  same JSON.

## Never

- A request held open per tab: browsers allow six HTTP/1.1 connections per
  origin (see `streams.md`).
- Writing what the user looks at to disk.
- Giving the deck as a token alone: a token does not paste into a command.

## Where it lives

`packages/core/src/viewing.ts` (report shape, ranking, text),
`packages/server/src/viewing.ts` (the registry), `routes-viewing.ts`,
`packages/web/src/editor/viewingReport.ts`, `packages/cli/src/viewingcmd.ts`,
`python/folio_client/client.py` (`viewing`).

## Checks

Unit tests for the ranking, the parsing of a report, the registry's expiry
and its version. `e2e/viewing.mjs`: a browser on slide 2 is named by
`folio viewing --json`; a slide switch ends `--wait-change`; a closed page
leaves nothing open.
