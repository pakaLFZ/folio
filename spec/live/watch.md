# Live: the agent's watch on the user, and the folio skill

## Demand

- "u see, in some cases I sent comments and u are not aware of it, consider
  ask agents to set monitor (ie, make folio have default skill so that agents
  can follow" *(user, 2026-10-13)*. Two comments (one on a slide region, one a
  follow-up in an existing thread) sat unseen that day: the agent was working
  on something else and noticed only when it happened to run `folio comments`
  or `folio inbox`.
- "I am about to build a real deck in folio and do not know how ... improve
  docs/helpers so these are answered in place: e.g. a `folio quickstart` (or a
  section at the top of `folio skill show`) with an end-to-end worked example
  (init deck, add an image slide, add a table, shot, check, pptx)" *(an agent
  about to build its first real deck for the user, on Windows, 2026-10-13)*.
  Its questions: how to start a deck on a pack; which layouts to use; how a
  slide gets an existing PNG from outside the workspace; which Python hooks
  need and what happens when it is unset; the table slot's JSON; how to write
  a slide in one call; which watch command and worker name; how to export a
  pptx and what is lost.

## Behaviour

### `folio watch`

- `folio watch [path] [--deck D] [--for comments,answers,viewing] [--since TIME]
  [--once] [--timeout S] [--json]` runs until killed and prints **one line per
  thing the user did that an agent should act on**, across every deck of the
  workspace or only `--deck D`:
  - `comment`: the user made a new comment;
  - `message`: the user wrote in an existing thread, whatever its status
    (an answered one goes back to the Queue on the user's message; a held one
    stays held; a resolved one must first be reopened in the browser, which
    the user's message then follows);
  - `reopened`: the user moved an answered, held or resolved comment back to
    the Queue without writing;
  - `held`: the user put a comment on hold (stop working on it);
  - `answers`: the user submitted a questionnaire (each round is one line);
  - `viewing` (only with `--for viewing`): the user's most recently active
    visible tab moved to another deck or slide. Selection and focus changes
    are not reported.
- `--for` defaults to `comments,answers`. `comments` covers `comment`,
  `message`, `reopened` and `held`.
- Each line names the time, the kind, the id, the deck as `decks/x`, the
  slide, the slots (or `whole slide`), the author, the text cut at 200
  characters with `...`, and the exact command that reads it in full:
  `2026-10-13T09:12:03.120Z message c7f3a2 decks/talk s004 [title, fig:a] user: "make the arrow red" -> folio comment show c7f3a2`.
  With `--json` the same fields are one JSON object per line:
  `{at, kind, id, deck, slide, slots, author, text, read}`.
- Only the user's own actions print: never an agent's comment, reply,
  `--answered`, assignment or questionnaire, and never the screenshots a
  server attaches after a message. The user is the workspace's
  `[workspace] user` (default `user`).
- With a server running it follows the workspace stream (`/inbox/events`),
  so a line appears within a fraction of a second; on a `resync` or a server
  restart it re-reads the files once and goes on. Without a server it reads
  the files every 3 seconds, and picks up the stream as soon as a server
  starts. Viewing needs a server; without one it is silent.
- It prints nothing else on stdout: no heartbeat, no banner, no "still
  watching". Problems go to stderr.
- `--once` exits 0 after the first line, for a background waiter that is
  re-armed after each event. `--since TIME` (the time at the start of a line,
  or any ISO time) first prints everything the user did after it that the
  files still show (new comments, messages, submitted answers), so a waiter
  re-armed with the last line's time loses nothing in between.
- Exit codes: 0 after `--once` printed its line, or when the stream is
  stopped by a signal; 2 for a usage error (an unknown deck, an unknown
  `--for` kind, a bad `--since`); 4 at `--timeout` with nothing printed.

### The folio skill

- folio ships an agent skill in the Agent Skills layout, `skills/folio-deck/`:
  `SKILL.md` (`name: folio-deck`, the name skills.sh lists, "change the name
  on skills.sh to folio-deck" *(user, 2026-10-14)*; a description that triggers on any folio or
  slide-deck task) and `references/` (`install.md`, `quickstart.md`,
  `comments.md`, `figures.md`, `packs.md`, `cli.md`), read only when a step
  needs them. It is the one thing an agent needs: with only the skill it can
  install folio from its repository, make a workspace, write slides, draw
  figures, make or convert a template and answer the user's comments
  *(user, 2026-10-14: "ideally they only need this skill")*. It is published on skills.sh as
  `https://www.skills.sh/pakalfz/folio`; `skills.sh.json` at the repository
  root sets that page's grouping *(user, 2026-10-14)*. Every agent
  working on a folio deck follows it: arm the watch first
  (`folio watch --deck <deck>` under the Monitor tool, or `folio watch --once`
  in the background, re-armed with `--since`; without background tools,
  `folio inbox --status queue` before and after every step), and on each line
  read the comment, assign it, act, reply with `--answered`, and say in one
  chat line what was done. It also carries the working loop (`folio prompt`,
  `folio viewing`, `folio shot --sheet`, `folio check`, `folio ask`).
- `folio skill install [--project | --user] [--force]` copies the whole
  folder, `references/` included, to
  `<workspace>/.claude/skills/folio-deck/` (the default) or
  `~/.claude/skills/folio-deck/`. An installed copy that differs from the shipped
  one is not overwritten without `--force`; the refusal prints the lines that
  differ (`-` installed, `+` shipped) and the command that replaces it. An
  identical copy is reported as already installed. `folio skill show` prints
  the shipped skill.
- `folio init-deck` and `folio serve` print one line when neither the
  workspace nor the user's home holds the skill:
  `agents: install the folio skill so they keep a watch on your comments: folio skill install`.
- The skill opens with a short **Starting a deck** section: run `folio
  quickstart` first, and the four things agents get wrong: run folio from the
  workspace root (the folder holding `folio.toml`); a figure is a path
  relative to the deck, so a picture from elsewhere is copied into
  `decks/<deck>/fig/` and written `fig/name.png`; run `folio doctor` and fix
  each FAIL; when `folio` is missing, install it first
  (`references/install.md`) (hooks use `[runtimes] python` in `folio.local.toml`, else python3
  or python on PATH; with neither every hooked text slot reports
  FOLIO-HOOK-006, 2026-10-14); write
  each slide in one call with `folio new ... --props`. `SKILL.md` stays under
  about 120 lines; detail goes in `references/`.
- `folio prompt` ends with: "Keep a watch on the user's comments: `folio
  watch --deck <deck>` (see the folio skill)."

### `folio quickstart`

- `folio quickstart` prints a short (under 80 lines), runnable walk-through
  from nothing to a pptx, each step one command and one line of why, in this
  order: `folio doctor`, fixing each FAIL, with the Python runtime set in
  `folio.local.toml` or found on PATH (3.9 or later, matplotlib for figure
  hooks; with neither, text shows as written and `shot` reports
  FOLIO-HOOK-006; doctor first since 2026-10-14); `folio init-deck decks/<deck> --template
  PACK@V --title T`; arm `folio watch --deck decks/<deck> --for
  comments,answers` with one worker name for every write; `folio layouts
  <deck>`; a title slide with `folio new ... --props -` and a heredoc; a
  note-figure slide whose picture is copied from outside into `fig/`, drawn at
  the size `folio box` gives; a plot-table slide with a table
  (`{"columns": [...], "rows": [[...]]}`, one string per cell, or
  `{"src": "x.table.json"}`); `folio shot --sheet`; `folio check`;
  `folio pptx --out F` (master, backgrounds, text, pictures, tables and shapes
  stay editable; code blocks become pictures, each approximation printed as a
  `picture:` line).
- It names the pack `lectern@1` and its layouts as the example and says to
  take another pack's names from `folio layouts`. On PowerShell, where a
  heredoc does not exist, the JSON goes in a file passed as `--props p.json`.
- Its text is one file shipped with the skill,
  `skills/folio-deck/references/quickstart.md`, so `folio skill install` copies it
  with `SKILL.md` and the two never drift.

## Never

- An agent finding the user's comments only by chance, when it happens to
  list them.
- A watch that prints the agent's own messages, so an agent replying wakes
  itself.
- Heartbeat, banner or "nothing new" lines: a monitor turns every stdout line
  into a notification.
- A watch that reports the user's unsent drafts: drafts live in
  `.folio/drafts/` so that agents never see them (`opening-a-comment.md`).
- A walk-through that lives only in a chat or a report, or a second copy of
  it in the CLI source: an agent starting a deck must find it with one
  command, and it has one source.
- A second event stream or a second poller beside the existing ones: the
  watch reads the same `/inbox/events` stream as `folio comment watch` and the
  same `/api/viewing` long poll as `folio viewing --wait-change`.

## Status

Built 2026-10-13. Whether the user wants the hint on `serve` once per start
or not at all is not yet confirmed.

## Where it lives

`packages/core/src/watchevents.ts` (what counts as an event, and its line),
`packages/cli/src/eventwatch.ts` (`folio watch`), `packages/cli/src/skillcmd.ts`
(`folio skill`, `folio quickstart`, the hint), `skills/folio-deck/SKILL.md`,
`skills/folio-deck/references/`,
`packages/core/src/catalog.ts` (the prompt line).

## Checks

`packages/core/test/watchevents.test.ts` (a user's comment and follow-up
print, an agent's reply and a screenshot update do not, reopen and hold,
answers, `--since` backlog, truncation, the line format, `--for` parsing);
`packages/cli/test/skillcmd.test.ts` (install to a temp HOME and workspace,
refusal naming the diff, `--force`; the Starting a deck section; `folio
quickstart` prints and names each command in order); `e2e/watch.mjs` (against a test server:
a user's comment posted over HTTP prints one line within 2 s, an agent's
reply prints nothing, the user's follow-up prints one line, `--once` exits 0
after one event, an answered questionnaire prints one line, and with no
server the polling watch still reports a comment written to the files).
