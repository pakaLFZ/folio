# Live: `folio` alone opens home

## Demand

- "consider after install making folio the command to open home"
  *(user, 2026-10-14)*; "design, then publish" *(user, 2026-10-14)*.
- "make it automatic" *(user, 2026-10-14)*, after `folio` opened a page in
  VS Code that loaded forever: the home server had taken 4310, where VS Code
  still held a stale forward from an earlier server.
- Design choices *(2026-10-14)*: the default workspace is
  `~/Documents/folio`, or `~/folio-decks` where there is no `Documents`
  folder; installing never downloads Chromium (`folio doctor` names the
  command).

## Behaviour

- `folio` with no arguments, in a terminal:
  1. takes the workspace holding the current folder (the nearest
     `folio.toml` upwards); outside any, the default workspace,
     `$FOLIO_HOME` when set. A default workspace that does not exist yet is
     made with a `folio.toml` and the shipped `lectern` pack, and says so.
     Its `folio.toml` sets `[server] port = 4320`, so the home server's band
     (4320 to 4323) never takes a port that a `folio serve` elsewhere expects;
  2. reuses the server already running for that workspace, or starts
     `folio serve <workspace>` in the background, its output in
     `<workspace>/.folio/serve.log`, and waits until it answers (at most
     20 s; on failure it prints the log's last lines);
  3. opens the deck list, `/`: on a local machine in the system browser
     (`open`, `xdg-open` with a display, `start` on Windows); in an SSH
     session through VS Code's port forward (`vscode-open.md`), always on a
     fresh loopback port the holder binds for this open
     (`POST /api/forward-port`, as `folio restart` does), because VS Code
     reuses a stale forward it holds for the server's own port; a server
     without that route is opened on its own port; otherwise it prints the
     address;
  4. returns to the prompt with the server left running, and says
     `folio stop` stops it.
- When standard output is not a terminal (an agent's shell, a pipe), `folio`
  alone prints the usage as before and starts nothing. `folio help` and
  `folio --help` print the usage everywhere.
- `folio stop [workspace]` stops the workspace's server (SIGTERM to the
  port holder recorded in `.folio/server.json`, which retires its app),
  waits until the process is gone and says so; exit 1 when none runs.

## Never

- Starting a server or a browser from a non-interactive shell.
- Downloading Chromium during install.

## Where it lives

`packages/cli/src/homecmd.ts`, `packages/cli/src/main.ts`.

## Checks

`packages/cli/test/homecmd.test.ts`: the default workspace is made once with
`lectern` and port 4320; a non-terminal `folio` prints the usage; the fresh
forward port differs from the server's and answers the page.
