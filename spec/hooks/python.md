# Hooks: Python inside a TypeScript package

## Demand

- "if the package is a typescript based one, then I still wish it to enable
  executing python." *(user, 2026-10-12)*
- A product for agents "carries its target shape as documentation and as a
  refusal ... every refusal names what was missing and the command that fixes
  it" (user's standing rule, applied 2026-10-13): `FOLIO-HOOK-006` must say
  what an unconfigured runtime costs and the exact line that fixes it, not
  just where to look.

## Behaviour

- **Named runtimes.** A hook names a runtime (`"runtime": "python"`); the
  workspace maps the name to an interpreter in the git-ignored
  `folio.local.toml` (`[runtimes] python = "..."`). A missing runtime is
  `FOLIO-HOOK-006`: "Runtime {runtime} is not configured: until it is, each
  hooked slot falls back to what it was given as written (a text slot shows
  its raw text). Add it to folio.local.toml beside folio.toml: [runtimes]
  {runtime} = \"<path to a Python 3 with matplotlib>\". For python, a
  python3 or python on PATH is used when nothing is set; folio doctor says
  which it finds." `requires`
  (`matplotlib>=3.8`) is checked once per interpreter by importing; an unmet
  one is `FOLIO-HOOK-009`. folio never installs anything.
- **Found on PATH** *(2026-10-14, "make sure it can run on mac easily")*:
  when `python` is not configured, folio uses the first of `python3`,
  `python` and (Windows) `py -3` on PATH that reports Python 3.9 or later, and says
  which in `folio queue`, `folio doctor` and `FOLIO-HOOK-009`. A configured
  path may be relative to the workspace root or start with `~/`. Details in
  `spec/process/platforms.md`.
- **`folio_hook`** (`python/`, no dependencies, on `PYTHONPATH` automatically):
  `run(draw)`, `read_request()`, `save_figure(fig, request)` at exactly the box
  size, `warn(message, field)`, `fail(message)`. One `draw(request)` function
  serves both modes.
- One entry point for every kind *(2026-10-13, "hook works for everything")*:
  `run(fn)` reads the request and dispatches on its `kind`. A figure hook's
  `fn` saves the figure; a text hook's `fn` returns the new text
  (`request.text`, `request.slot`, `request.role`); a table hook's `fn`
  returns `{"columns", "rows"}` (`request.table`). `run` prints the response
  line; warm mode returns it in the protocol reply. A text hook is:
  `def transform(request): return request.text.upper()` and
  `run(transform)`.
- **Modes.** `spawn` (default): a fresh process per figure. `warm`: a few
  long-lived workers per hook version import once and draw one figure per
  request; a timeout or crash kills the worker's group and the next job gets a
  fresh one; a worker is retired after 50 jobs.
- **`folio_client`**: Python workers build decks over the HTTP API:
  `Deck.open`, `new_slide`, `Slide.set` / `patch` (a stale revision raises
  `RevisionConflict`), `warnings`, `prompt`, `comments`, `reply` with files,
  `follow`, `claim_next`.
- `folio_hook.call("pack/hook", inputs, size=(w, h), unit=..., out=...)`
  calls a hook without a deck through `folio hook run`, the deck's own key,
  cache and runner (`provenance.md`).
- `folio run-hook <deck>/<slide>/<slot>` runs one hook in the foreground with
  its whole output, for debugging a plot script.

## Never

- A Python-in-Node bridge (pythonia, node-calls-python): one process for both
  runtimes breaks the isolation rule.
- Interpreter paths in a pack.

## Status

- The memory cap (`prlimit`) is Linux only; macOS and Windows run hooks
  without it.
- Measured 2026-10-12: a matplotlib hook takes 0.435 s per figure in spawn
  mode and 0.031 s in warm mode after a 0.38 s first run (20 runs each).
- `folio_client` has no automated check yet; it was exercised by hand
  (create, set, a stale revision raising `RevisionConflict`, claim, reply with
  a file).

## Where it lives

`python/folio_hook/`, `python/folio_client/`,
`packages/server/src/hooks/runtime.ts`, `warm.ts`.

## Checks

`e2e/hooks-queue.mjs` (unconfigured runtime; warm crash replaced; warm against
spawn over 20 runs).
