# Live: opening a deck through VS Code's tunnel

## Demand

- "folio should get its pages through VS Code's tunnel by itself, the way
  cavitas does." *(user, 2026-10-14)* The user's VS Code reaches the cluster
  over Remote-SSH; the browser is on the laptop, the server on the cluster.
- After `folio restart` the user could not open 4310: the server answered on
  both addresses, but VS Code's Ports panel still listed an "Auto Forwarded"
  4310 owned by a process long gone, and since the port never closes VS Code
  never re-forwarded. "fixed so it is automatic, never a manual step"
  *(user, 2026-10-14)*.
- If no VS Code answers, folio says so, prints the address and names the one
  manual step. *(user, 2026-10-14)*
- folio runs on Linux, Windows and macOS alike; where there is no VS Code
  socket the open is a quiet no-op that never fails or blocks the server.
  *(user, 2026-10-13, 2026-10-14)*

## Behaviour

- **Why folio has to ask.** VS Code builds a port forward only for an open
  request that carries `allowTunneling`. An address that is printed, copied or
  clicked reaches the laptop's browser exactly as written and is never
  tunnelled. The flag comes only from VS Code's command-line socket: folio
  sends `POST /` with the JSON body `{"type":"openExternal","uris":[URL]}`
  over that unix socket, and VS Code runs `_remoteCLI.openExternal`, which
  asks the laptop to forward the port and open the page. A `200 OK` status line
  is the only answer that counts as accepted (the same protocol as
  `cavitas/viewer/editor.py`).
- **Which socket.** The path a process inherits in `VSCODE_IPC_HOOK_CLI` goes
  stale: VS Code makes a new socket for every window and every SSH reconnect
  and never deletes the old files (136 once, 4 of them live). folio asks the
  inherited socket first, then every `vscode-ipc-*.sock` in the runtime
  folders, newest first: the inherited socket's own folder and
  `$XDG_RUNTIME_DIR` (else `/run/user/<uid>`). A socket nobody listens on is
  passed over at once; the first socket that answers decides, so a refusal is
  not retried on four other windows. Each answer is waited on for at most
  5 s. Folders that do not exist (macOS, Windows, a laptop) give no sockets,
  and the open reports that no VS Code answered.
- `folio open [deck]` opens the running server's page:
  `http://127.0.0.1:<port>/<deck8>/` for a deck, `/` of the current folder's
  workspace without one. It needs the
  server of that workspace to be running (else: `no folio server is running
  for <root>; start one with folio serve`, exit 1).
  - Accepted: `VS Code accepted the forward and open request for
    http://127.0.0.1:N/<deck8>/; browser reachability was not checked`
    (exit 0). The socket returns no laptop-side result.
  - Not opened: `no VS Code window answered; open http://127.0.0.1:N/<deck8>/
    in a browser. If VS Code's Ports panel lists port N but the page does not
    load, remove that forward and forward port N again.` (exit 1).
- **A restart re-requests the forward.** `folio restart` makes the same
  checked open (below) for `/` once the new app answers, every time, without
  a flag. A restart is only ever asked for on a server the user is looking
  at, so this is one automatic open; plain `folio serve` still opens nothing.
  *(design choice, 2026-10-14)*
- **Every open is held to its word** *(user, 2026-10-14: "learn cavitas'
  open in browser logic, as there is a detect and respond logic that can save
  a constantly loading page")*. VS Code's 200 means it forwarded the port and
  handed the address over, not that a browser loaded anything; a forward left
  from an earlier server accepts and relays nothing, and the tab loads
  forever. So `folio open`, `folio restart`, `serve --open` and `folio` alone:
  1. ask the server for a fresh loopback port, one no VS Code forward has
     seen, that passes to the same app (`POST /api/open-port`). Every open
     takes a new one, never the held port: the forward VS Code holds for a
     port it opened before is usually dead *(user, 2026-10-14: "always retry
     on a fresh port ... as usually the old one is dead")*;
  2. ask VS Code to open the page there and print `asked VS Code to open
     URL; waiting for the page to load`. No VS Code answers: the
     not-opened line names the held port, the one to forward by hand;
  3. wait up to 6 s for a browser page load on that port (a GET with
     `Sec-Fetch-Dest: document` or `iframe`, or without that header one that
     accepts `text/html`; the CLI's own API calls never count). Loaded: `the
     page loaded in your browser`;
  4. otherwise take a second fresh port, ask VS Code again and wait 4 s:
     `port N reached nothing, so the page moved to URL, where it loaded`;
  5. otherwise: `VS Code said it opened the page on ports N and M, and no
     browser loaded it. Forward it yourself:` followed by the `ssh -L` line
     and the `localhost` address (exit 1 for `folio open`).
  The earlier ports stay live for tabs already open on them. A server too
  old to answer `/api/open-port` gets the unchecked open on its held port
  and its line.
  The waits follow cavitas (`cavitas/viewer/reach.py`): generous, because
  calling a live forward dead moves the page from under a browser still
  starting.
- `folio serve --open` makes the same request once the app is listening, for
  `/`, and prints the same line. It runs after the address lines are printed
  and is never awaited by the start: no VS Code means one printed line, not a
  failure. Without `--open` the server opens nothing.
- The address sent uses `127.0.0.1`, not `localhost`, so the forward VS Code
  builds on the cluster side reaches the IPv4 listener directly; the server
  answers on `::1` too (`server-and-addresses.md`).
- A 200 from the CLI socket only says VS Code accepted the forward and open
  request. It does not report the laptop-side address or test the browser's
  connection. The success line says exactly that and says reachability was
  not checked.
- Page HTML uses `Cache-Control: no-cache`, so a fresh load revalidates and
  receives the new hashed asset names after `pnpm build:web`. Vite retains old
  hashed assets across builds, so an already-open tab can still load its old
  worker or another asset after a restart.

## Never

- Opening automatically on every `folio serve`: servers are started by
  agents, tmux and every e2e check (dozens per run), and each would pop a page
  on the user's laptop. Opening is asked for: `folio open`, `serve --open`,
  or a `folio restart`.
- Assuming a held port keeps the forward alive: VS Code's forward is its own
  state and went stale on 4310 while the port stayed open.
- Trusting only `VSCODE_IPC_HOOK_CLI`: a server in tmux or started by an agent
  carries a dead or no socket path.
- Asking further windows after one answered with a refusal: a later success
  would open pages on several desktops.
- Printing the URL and calling it done: the browser gets the literal loopback
  address and lands on nothing.
- A test that sends to the user's real sockets: tests point
  `VSCODE_IPC_HOOK_CLI` and `XDG_RUNTIME_DIR` at a temp folder with fake
  sockets.

## Status

Built and investigated 2026-10-14. The installed VS Code server's
`server-main.js` `openExternal` dispatches only `_remoteCLI.openExternal`; its
socket switch accepts `open`, `openExternal`, `status`, and
`extensionManagement`, with no tunnel-close request. In the matching VS Code
client source, `mainThreadCLICommands.ts` registers `_remoteCLI.openExternal`
with `allowTunneling: true`; `NativeWindow.resolveExternalUri` calls
`NativeWindow.openTunnel`, which returns `tunnelService.getExistingTunnel`
before attempting `openTunnel`. `AbstractTunnelService.getExistingTunnel`
increments the existing tunnel's reference count and returns it. That path
cannot repair a stale entry for the same remote port. Its laptop-side
`localAddress` is consumed by `resolveExternalUri` but is never sent back in
the CLI socket response, so cluster-side end-to-end verification is unavailable.
Source: [VS Code client at installed commit, window.ts](https://github.com/microsoft/vscode/blob/7baac39ec3ca969dab74ac12c097f6a486e46593/src/vs/workbench/electron-browser/window.ts),
[tunnel.ts](https://github.com/microsoft/vscode/blob/7baac39ec3ca969dab74ac12c097f6a486e46593/src/vs/platform/tunnel/common/tunnel.ts),
[mainThreadCLICommands.ts](https://github.com/microsoft/vscode/blob/7baac39ec3ca969dab74ac12c097f6a486e46593/src/vs/workbench/api/browser/mainThreadCLICommands.ts).

## Where it lives

`packages/core/src/editorcli.ts` (the request bytes, the answer test, the
socket order), `packages/server/src/editoropen.ts` (the folder walk and the
socket I/O), `packages/cli/src/opencmd.ts` (`folio open`, `folio restart`,
the printed lines), `packages/cli/src/serve.ts` (`--open`).

## Checks

`packages/server/test/editoropen.test.ts`: a fake VS Code socket that answers
gets the exact JSON body; a dead socket file gives no open; an inherited dead
socket with a live one in the runtime folder reaches the live one; a refusal
stops the walk. `e2e/held-port.mjs` runs `folio open` against a fake socket
with a dead inherited one. `packages/cli/test/opencheck.test.ts`: each open goes to a new fresh port,
never the held one; a first port that loads nothing moves to a second; no
load on either gets the `ssh -L` line.
