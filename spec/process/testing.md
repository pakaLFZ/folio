# Process: how a change is checked

## Behaviour

### What every change runs

- `pnpm build:web`, `pnpm test` and `tsc -b`, always.
- Browser checks run on their own isolated server: a temporary copy of the
  decks they need, on a free port. Nothing queues behind a shared lock, and
  no check touches the workspace's `decks/`.
- The full suite, `bash e2e/run-all.sh`, runs once on the merged result.

### How the suite runs fast

- `bash e2e/run-all.sh` first bundles the CLI and the server it starts into
  one JavaScript file with esbuild (`e2e/lib/build.mjs`, under 0.2 s, into
  the ignored `scratch/build/`), every run, so it is never stale; each check
  gets its path in `FOLIO_E2E_BIN` and starts `folio` with plain `node`
  (about 0.3 s a command against 0.7 s through `tsx`). npm packages stay
  outside the bundle, and each source keeps its own `import.meta.url`, so
  packs, docs, skills and `python/` resolve as from `src/`.
  `node packages/cli/bin/folio.mjs` is unchanged.
- It then starts one headless Chromium (`e2e/lib/browser.mjs`) and passes its
  endpoint in `FOLIO_E2E_BROWSER`; a browser check is started with
  `--import ./e2e/lib/browser.mjs`, which turns its `chromium.launch()` into
  a connection to that browser. Every `newPage`/`newContext` is a context of
  its own (viewport, scale, permissions are per context), closed with the
  check's `browser.close()`. A download is read with `downloadBytes`
  (`e2e/lib/page.mjs`), since `download.path()` throws on a connected
  browser. The browser stops when the run ends, or within a second of the
  run being killed.
- `node e2e/<name>.mjs` alone still uses `tsx` and launches its own browser.
- The summary repeats every check's line sorted slowest first, after the
  per-check lines as they end.
- Vitest runs with `isolate: false` and at most 8 workers: each worker
  imports a module once for all its files.
- A wait in a check is for a condition (a stream open, a page still), except
  where the check asserts that something does not happen, or the spec fixes
  the count (warm against spawn over 20 runs).
- The CLI's own Chromium (`folio shot`, `check`, `pdf`) is not shared: its
  launch is 65 to 80 ms of a command that takes 1.5 to 6 s.


## Where it lives

`e2e/run-all.sh`, `e2e/lib/build.mjs`, `e2e/lib/browser.mjs`,
`e2e/lib/server.mjs` (`bin`), `e2e/lib/page.mjs`, `vitest.config.ts`.
