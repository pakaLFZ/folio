# folio

- **The spec decides.** `spec/` records every feature as it was asked for
  (see `spec/README.md`). For a change, update the spec file first, then the
  code. A file in `spec/` holds at most 500 lines and covers one topic.
- pnpm only; TypeScript; Python only for hooks and `python/`. Core
  (`packages/core`) takes values and returns values: no paths, files, DOM, CLI
  or printing. Files stay under 500 lines (split at 400), functions under 40.
- folio runs on Linux, Windows and macOS alike. A file path comes from
  `fileURLToPath`, never `new URL(...).pathname`; a path that is stored,
  compared or printed is written with `/` (`relative` and `toPosix` from
  `packages/server/src/posixpath.ts`), never split on a literal `/` while it
  is still OS-native; `.gitattributes` keeps every file's bytes as committed.
- The editor chrome follows `theme/cavitas/`; slide content follows its pack.
- Read `folio pack guide` before converting, merging or editing a pack
  (`spec/slides/pack-tools.md`). `templates/lectern` is the bundled example
  pack.
- Checks: `bash e2e/run-all.sh` runs every check in parallel (cap
  `FOLIO_E2E_JOBS`), one line each with passes and seconds, logs under
  `scratch/e2e/`. Each check copies `e2e/fixtures/decks` into its own
  workspace under `scratch/e2e/` and serves it on a free port (`e2e/lib/`),
  so runs never share a port or touch `decks/`. One check alone:
  `node e2e/<name>.mjs` or `bash e2e/run-all.sh <name> ...`. How the suite is
  kept fast is `spec/process/testing.md`. No check uses a fixed port. Stop a
  server by its PID and confirm with `ps -p`.
- The web app must be rebuilt (`pnpm build:web`) before browser checks see a
  change.
