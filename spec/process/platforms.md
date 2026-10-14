# Process: folio on Linux, macOS and Windows

## Demand

- "make sure it can run on mac easily" *(user, 2026-10-14)*. folio was
  written on Linux; it was made to run on Windows the same day
  (branch `windows-compat`). There is no Mac at hand, so "make sure" means:
  an audit of everything that assumes Linux or GNU, fixed so one code path
  serves all three systems; a short documented setup from clone to a running
  editor; and proof on a real macOS machine through continuous integration.
- When `[runtimes] python` is not set, find a Python on PATH and use it,
  saying which interpreter was found *(user, 2026-10-14)*.
- `folio doctor`: one line per check, ok or fail, with the exact command that
  fixes a failure; exit 1 if any fails *(user, 2026-10-14)*.
- CI runs on pull requests and by hand only, never on every push: "macOS
  runner minutes are billed at 10x on a private repo" *(user, 2026-10-14)*.

## Behaviour

### Setup

- README's **Run it** gives the commands for macOS (Homebrew), Linux and
  Windows side by side: Node 20, pnpm through corepack (the version is pinned
  by `packageManager` in `package.json`), a Python 3 with matplotlib,
  `pnpm install`, `pnpm exec playwright install chromium`, `pnpm build:web`,
  `folio doctor`, `folio serve .`.

### The Python runtime

- A hook's runtime is looked up in `[runtimes]` of `folio.local.toml` (then
  `folio.toml`). A configured path may start with `~/` (the home folder) or
  be relative (to the workspace root, the folder holding `folio.toml`), so
  `python = ".venv/bin/python"` works from any folder.
- When `python` is not configured, folio asks `python3`, then `python`, then
  (on Windows) `py -3` on PATH for `sys.executable`, and takes the first that
  answers with Python 3.9 or later (the oldest `folio_hook` supports, so a
  Python 2 `python` or an old system `python3` is passed over). A stub that only offers to install Python (the
  macOS `/usr/bin/python3` without the command-line tools, the Windows Store
  alias) fails that question and is skipped. The search runs once per process
  and only when a hook needs Python.
- Which interpreter is used is said where it matters: `folio queue` prints
  `python: <exe> (found on PATH as python3; set [runtimes] python in
  folio.local.toml to choose another)` first; `folio doctor` prints it with
  its version; `FOLIO-HOOK-009` (an unmet `requires`) names the interpreter
  that cannot import it.
- A configured path that does not exist is not replaced by a found one: it is
  `FOLIO-HOOK-006`, as is a runtime other than `python` that is not set, or
  `python` when nothing is found.

### `folio doctor [path]`

- One line per check, `ok` or `FAIL`, the check's name and what it saw; a
  failing line ends with `fix: <command>`. Exit 0 when every check passes,
  1 when any fails. The checks:
  - **node**: version 20 or later (fix: install Node 20).
  - **web build**: `packages/web/dist` exists and is not older than its
    sources (fix: `pnpm build:web`).
  - **chromium**: Playwright's Chromium launches headless (fix:
    `pnpm exec playwright install chromium`, with `--with-deps` on Linux).
  - **python**: configured or found, its version (3.9 or later), and whether
    `matplotlib` imports (fix: the install line for the system, or `<exe> -m pip install
    matplotlib`).
  - **workspace**: the folder holding `folio.toml`, its decks and templates
    folders, and the packs that load (fix: `folio init-deck decks/<name>`).
  - **port**: whether a port of the band 4310 to 4313 is free on the server
    host, or the workspace's own server already holds one (fix: stop the
    process on the port, or `folio serve --port N`).
- `--json` prints the same as one array of `{check, ok, detail, fix}`.

### Scripts and checks

- `e2e/run-all.sh` runs on bash 3.2 (macOS's `/bin/bash`) and uses no GNU
  tool: the core count comes from Node, the per-check time limit is
  `e2e/lib/timeout.mjs` (a process group killed at the limit, exit 124), and
  times come from Node, not `date +%N`.
- Checks that press a platform shortcut press `ControlOrMeta`, so the same
  check presses Cmd on macOS and Ctrl elsewhere; a caret move to the end of
  the text is Cmd+ArrowDown on macOS.
- Checks and unit tests that need Python take `FOLIO_PYTHON`, else the
  interpreter found on PATH, never a path of one machine.
- A Finder `.DS_Store` in a deck's comment archive or in a hook folder is
  ignored, not read as a day folder or hashed into a hook's identity.
- `findServer` compares the workspace root by its real path, so a workspace
  reached through a symlink (`/tmp` is `/private/tmp` on macOS) still finds
  its server.

### Continuous integration

- `.github/workflows/ci.yml`: on `pull_request` and `workflow_dispatch` only.
  A matrix of ubuntu-latest, macos-latest and windows-latest: pnpm, Node 20,
  Python 3.12 with matplotlib, `pnpm install --frozen-lockfile`, typecheck,
  unit tests, the web build, Playwright's Chromium (`--with-deps` on Ubuntu;
  also on Windows, since `folio doctor` fails without it), `folio doctor`;
  on Ubuntu and macOS also `bash e2e/run-all.sh` with two checks at a time,
  its logs kept as an artifact when it fails. A newer push to the same pull
  request cancels the run before it.

## Never

- A second code path per system where one portable one does the job.
- GNU-only tools in scripts: `timeout`, `nproc`, `date +%N`, `sed -i`,
  `readlink -f`, `stat -c`, `setsid`, `/proc`.
- A machine's interpreter path in a test or a check.
- CI on every push.

## Status

- macOS has not been run by hand: the workflow is the proof, and the user
  triggers it. Not yet confirmed there: the e2e checks' pixel measurements
  with macOS Chromium's font rendering of the editor chrome, and chokidar's
  watching on macOS's FSEvents.
- The hook memory cap (`[queue] memory_mb`) uses `prlimit`, which macOS and
  Windows lack; there the cap is not applied.

## Where it lives

`README.md` (Run it), `packages/cli/src/doctor.ts`, `doctorchecks.ts`,
`packages/server/src/hooks/findpython.ts`, `runtime.ts`,
`packages/cli/src/queuecmds.ts` (`findServer`), `e2e/run-all.sh`,
`e2e/lib/timeout.mjs`, `e2e/lib/server.mjs` (`python`),
`.github/workflows/ci.yml`.

## Checks

`packages/server/test/findpython.test.ts`, `packages/cli/test/doctor.test.ts`,
the CI workflow on all three systems.
