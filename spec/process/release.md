# Process: the minimal release

## Demand

- "make a release which is a minimal version that does not contain excess
  front end stuff" *(user, 2026-10-14)*.
- "check if we can make it a pip" *(user, 2026-10-15)*, followed by setting up
  PyPI Trusted Publishing for it the same day: owner `pakaLFZ`, repository
  `folio`, workflow `publish-pypi.yml`, environment `pypi`. folio is not
  `pip install folio`: that name is taken on PyPI, so the project is
  `folio-deck`.

## Behaviour

- `node scripts/release.mjs` (after `pnpm build:web`, or with
  `--build-web`) writes `release/folio-<version>/` and
  `release/folio-<version>.zip`, and `release/folio-<version>.tgz` (`npm
  pack` of the same folder). Each release carries both, and `folio.zip` and
  `folio.tgz` as copies, so `releases/latest/download/folio.tgz` is a stable
  link: `npm install -g <that link>` puts `folio` on PATH (`home.md`).
- The release needs Node 20 and Playwright only: `npm install`, then
  `npx playwright install chromium`. No pnpm, TypeScript, Vite or React.
- `packages/cli/bin/folio.mjs` is one esbuild bundle of the CLI, the server,
  core and every npm package except Playwright. Each source's
  `import.meta.url` becomes its old repository path under the release root,
  so what it reads beside itself resolves as in a clone.
- What ships, at its repository path: the built editor (`packages/web/dist`),
  the built-in packs, `templates/lectern`, `python/folio_hook` and
  `python/folio_client`, `skills/folio-deck`, `docs/pack-guide.md`,
  `docs/warnings.md`, `folio.toml`, `LICENSE`, and a release `README.md`
  (`scripts/release-readme.md`). No web sources, tests, e2e, spec or
  TypeScript.
- With no web sources present, the stale-build check is skipped.

### The pip channel: `folio-deck`

- `node scripts/wheel.mjs` builds the minimal release (unless `--no-release`
  reuses an existing one) and stages it into `python/folio_deck/_dist`, at
  the same repository-relative paths the release folder uses, so the
  bundle's `import.meta.url`-relative reads resolve unchanged. It copies the
  version from `packages/cli/package.json` into `python/pyproject.toml`
  (restored after the build, so the source tree keeps its own value), then
  runs `python -m build` for a `py3-none-any` sdist and wheel in a scratch
  venv it creates and discards — never a developer's own Python environment.
  `--build-web` forwards to the release build when the caller has not
  already run `pnpm build:web`.
- The wheel carries three top-level packages: `folio_deck` (the `_dist`
  payload plus the console-script launcher), and `folio_hook` and
  `folio_client` a second time, as their own importable packages (the same
  sources the release ships inside `_dist/python/`, for a hook's own script
  or a client import without reaching into `_dist`).
- `playwright>=1.62` is the only runtime dependency; matplotlib (hooks need
  it to draw figures) is the `plots` extra: `pip install "folio-deck[plots]"`.
- The `folio` console script (`python/folio_deck/cli.py`) asks
  `playwright._impl._driver.compute_driver_executable()` for Playwright's own
  bundled Node and the `playwright-core` directory beside it, sets
  `FOLIO_PLAYWRIGHT` to that directory, and execs the bundled CLI
  (`folio_deck/_dist/packages/cli/bin/folio.mjs`) on that Node, passing
  stdin, stdout and the exit code straight through. Missing playwright, a
  missing Node, or a driver layout that is not what is expected each refuse
  by name with the fix (`pip install "playwright>=1.62"`), never a
  traceback.
- `FOLIO_PLAYWRIGHT`, read by `loadPlaywright()` in `@folio/server`
  (`packages/server/src/playwright.ts`), is what makes this possible without
  a `node_modules/playwright` beside the bundle: every runtime
  `await import("playwright")` in the CLI and the server (`doctorchecks.ts`,
  `headless.ts`, `pdf.ts`, `comments/shots.ts`) goes through it. Unset, it is
  exactly `await import("playwright")`, so an npm install is unchanged.
- `.github/workflows/publish-pypi.yml` runs on a published GitHub release
  (and by hand): pnpm install, `pnpm build:web`, `node scripts/wheel.mjs`,
  then `pypa/gh-action-pypi-publish` in a `pypi` environment job with
  `id-token: write` and no token — PyPI Trusted Publishing, set up for owner
  `pakaLFZ`, repository `folio`, workflow `publish-pypi.yml`, environment
  `pypi`.

## Checks

- Unpacked elsewhere with only `npm install`: `folio doctor` all ok;
  `init-deck`, `new` with a hook figure and a table, `shot --sheet`,
  `check`, `pdf`, `pptx`, `deck export`, `pack guide`, `codes`,
  `quickstart`, `skill install`, and `serve` on a free port answering the
  page and its assets (2026-10-14).
- The wheel, installed into a fresh venv with none of this repository's
  `node_modules`: `folio doctor` all ok (Chromium already cached, or found
  by `python -m playwright install chromium`), `init-deck`, `pdf`, `pptx`,
  `serve` answering on a free port and stopped by PID, and
  `python -c "import folio_hook, folio_client"` (2026-10-15).
- `unzip -l` the wheel and grep its contents for the machine's own paths and
  the user's identifiers: none may appear (2026-10-15).

## Where it lives

`scripts/release.mjs`, `scripts/release-readme.md`, `scripts/wheel.mjs`,
`python/pyproject.toml`, `python/folio_deck/`,
`packages/server/src/playwright.ts`, `.github/workflows/publish-pypi.yml`.
