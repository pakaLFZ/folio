# Live: one server, one address per deck

## Demand

- The slides sit on a remote server; the user views them in a local
  browser through ssh or VS Code port forwarding, and wants to see edits in
  real time. *(user)*
- "learn from cavitas that each deck uses its own 8 digit hash after the server
  node so that multi deck can be opened at same time and optimize multi deck
  opening sync / stream." The user said 8 digits; follow the user.
  *(user, 2026-10-12)*
- "folio should get its pages through VS Code's tunnel by itself, the way
  cavitas does." After the live server on 4310 was restarted, the user's
  browser could not reach it: VS Code's Ports panel still showed 4310 as
  "User Forwarded", tied to a process that no longer existed, and the user had
  to remove the forward and add it again by hand. So the port is kept across
  restarts and only the app behind it reloads. *(user, 2026-10-14)*
- `localhost` on the cluster resolves to `::1` first, and `http://[::1]:4310/`
  got no reply; the server answers on `::1` as well. *(user, 2026-10-14)*

## Behaviour

- `folio serve <workspace>` serves every deck of the workspace from one
  process, bound to `127.0.0.1` on the first free port of 4310 to 4313, so one
  `ssh -L 4310:localhost:4310` (or VS Code's own forward) reaches everything.
  The port taken is recorded in `.folio/server.json` with the process id.
  `--port N` starts the band at N instead; `--port 0` takes any free port the
  system picks (the checks use it, so any number of servers run side by side).
- **The port is held across restarts.** `folio serve` is two processes: a
  small *port holder* that binds the port and never closes it while it runs,
  and the *app* (every route, the hook queue, the watchers) behind it on a
  private loopback port the system picks. The holder passes each HTTP
  request through to the app and its answer back (event streams included);
  the browser's own connection is to the holder and is never closed by a
  swap. While no app is ready (at start, or between apps) a request waits in
  the holder instead of being refused.
  `.folio/server.json` records `pid` (the holder, the process to stop),
  `app` (the app's pid), `port` and `hosts`.
- `folio restart [workspace]` reloads the app behind the port: the holder
  starts a new app from the code on disk now, points new requests at it
  once it is listening, and only then retires the old one (its hook queue
  stops first, open event streams end and the browsers resume them on the new
  app). The listening socket is never closed, so a forward set up once,
  VS Code's or `ssh -L`, keeps working. It prints
  `folio: restarted the app behind port N (pid A -> B); the port stayed open`.
  A new app that fails to start leaves the old one serving and the command
  says so (exit 1).
- An app that exits on its own stops the holder too (the exit is printed); a
  holder that dies takes its app with it (the app stops when its link to the
  holder closes). Stopping the holder (SIGTERM, Ctrl-C) stops the app first.
- **Loopback means both families.** On the default host `127.0.0.1` the holder
  also listens on `::1` at the same port, so `http://localhost:N/` answers
  whichever address `localhost` resolves to. Where the machine has no IPv6
  loopback the `::1` listener is skipped without a word; where `::1:N` is
  taken by another program the band moves to the next port. `--host` and
  `--expose` bind only the address asked for.
- Each deck is at `/<deck8>/`: 8 lowercase hex digits, the blake2s of a random
  id created once in `deck.json`. A restart, a rename or a move keeps the
  address; two decks with one token are refused, naming both folders.
- `/` lists every deck (slides, open comments, warnings); `/inbox` is the board
  across decks; `/<deck8>` without a slash redirects.
- The page carries a bootstrap with the base address, the manifest, the pack
  and the first slides, so the first paint is already right; every client
  address is built from the base, never from `location`. The same bootstrap
  is served as JSON at `/inbox/boot` and `/<deck8>/boot` for the board and
  editor moving between each other in place; a deck's carries the slide named
  by `?slide=` beside the first slides.
- A deck created while the server runs is mounted at once.
- Writes from a browser are accepted from a loopback Origin on any port (a
  forward) or the server's own host; a request without an Origin (CLI) is
  accepted.
- `--expose` binds every interface and mounts the whole app behind a random
  path printed once; the deck token is a name, never a password.

## Never

- An ephemeral port: a forward set up once would stop working at restart.
- Restarting by stopping the server and serving again: the port is closed in
  between, and VS Code keeps a forward whose process is gone (the 4310
  "User Forwarded" entry of 2026-10-14).
- Passing the listening handle to a forked app (`child.send("server", ...)`)
  instead of passing connections through: the parent keeps accepting on the
  handle it sent, so connections split between holder and app, and it cannot
  stop accepting without closing the socket the restart is meant to keep.
  `SO_REUSEPORT` hand-over is Linux-only. The pass-through costs one local
  hop and works the same on Linux, macOS and Windows.
- Passing TCP connections through instead of requests: a kept-alive browser
  connection stays tied to the app it first reached, and the swap closes it
  under a request in flight (measured: 2 of 2,696 kept-alive requests dropped
  in one restart; 0 of 3,002 with the request pass-through).
- Starting the new app only after the old one has stopped: requests would
  wait several seconds for the load, and a new app that fails to start would
  leave nothing serving. The two overlap for the moment of the swap; the old
  app's hook queue is the first thing it stops, and the queue is derived from
  the slides, so the new one picks up anything left.
- A token that changes at restart (cavitas's per-session token): a bookmark or
  a link in a comment must keep working.
- An Origin check that refuses a forwarded `localhost` (open-slide's guard
  does, and refuses proxied saves).

## Where it lives

`packages/server/src/server.ts`, `httpkit.ts`, `workspace.ts`, `app.ts`,
`porthold.ts` (the held port, both loopback families, the pass-through),
`packages/core/src/ids.ts`, `packages/cli/src/serve.ts` (the holder and
`folio restart`), `packages/cli/src/serveapp.ts` (the app behind it).

## Checks

`e2e/flood.mjs` (tokens unchanged across a restart is checked beside it in
`run-all`), `e2e/multitab.mjs`, `e2e/held-port.mjs` (requests looping on
fresh and kept-alive connections while `folio restart` swaps the app: none
refused or dropped, the port and holder unchanged, the app pid changed;
`http://[::1]:N/` answers 200, skipped with a message only where the machine
has no IPv6 loopback).
