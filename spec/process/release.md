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

### Chromium: downloaded on first use, not on install

- "can u make the code first run auto install this, and show progress bar if
  possible" *(user, 2026-10-15)*: neither channel's install step downloads
  Chromium; the first command that needs a browser does, once, printing
  Playwright's own installer output (its own progress bar in a terminal; its
  plain progress lines otherwise) rather than a second one of ours.
- `ensureChromium(pw)`, beside `loadPlaywright()` in
  `packages/server/src/playwright.ts`, is the one check: `existsSync` on
  `chromium.executablePath()` (cheap once Chromium is present). On a miss it
  prints one line — what is downloading, its approximate size, and the
  browsers directory it goes into (`PLAYWRIGHT_BROWSERS_PATH`, else
  Playwright's own per-OS default) — then runs Playwright's own installer
  (`<resolved package dir>/cli.js install chromium`, `process.execPath`,
  stdio inherited) from the same package `loadPlaywright()` resolved
  (`FOLIO_PLAYWRIGHT`'s directory under the pip wheel, else the `playwright`
  package an npm install put in `node_modules`). It checks again afterwards;
  a still-missing Chromium or a nonzero exit throws, naming the manual
  command for the channel in hand (`python -m playwright install chromium`
  when `FOLIO_PLAYWRIGHT` is set, else `npx playwright install chromium`),
  with the Linux `--with-deps` variant alongside it.
- `FOLIO_NO_BROWSER_DOWNLOAD=1` refuses instead of downloading, naming the
  same manual command, and is checked before anything is printed or run.
- Every call site that used to call `loadPlaywright()` straight into a
  `chromium.launch()` calls `ensureChromium()` first: `folio doctor`'s
  chromium check (so doctor downloads instead of failing, unless the env
  var is set), `PdfBrowser` (`folio pdf`, PPTX export), `startHeadless`'s
  `chromium()` (`folio check`, `folio shot`, hook figure rendering), and
  `PlaywrightShots` (a served comment's screenshots). `folio` alone (home)
  calls it once more, explicitly, before starting the background server, so
  the user's first run downloads in their own terminal rather than inside a
  server they cannot see; there a refusal only warns, since opening the deck
  list needs no browser.
- Playwright's own installer (`playwright-core/lib/coreBundle.js`,
  `downloadBrowserWithProgressBar`) checks its own `INSTALLATION_COMPLETE`
  marker before it starts, downloads into a fresh temp directory, then
  extracts straight into the shared browsers directory — it carries no lock
  of its own around that extraction, so two folio processes starting at once
  could both begin it. `ensureChromium` adds one: a `mkdir`-based directory
  lock (no `recursive`, so a second taker gets `EEXIST`) around the
  installer call, in the browsers directory itself, waited out with a
  generous timeout rather than looped on forever.

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
- The same wheel with `PLAYWRIGHT_BROWSERS_PATH` pointed at an empty
  folder, so Chromium is genuinely missing: `folio doctor` downloads it
  (confirmed under a pseudo-terminal: Playwright's own `191.1 MiB [] NN%`
  progress bar, then "ok chromium"), then `folio pdf` on a scratch deck
  writes its PDF without a second download (2026-10-15). `install chromium`
  fetches Chromium, headless shell and ffmpeg together, ~680 MB on disk.
- `unzip -l` the wheel and grep its contents for the machine's own paths and
  the user's identifiers: none may appear (2026-10-15).

## Where it lives

`scripts/release.mjs`, `scripts/release-readme.md`, `scripts/wheel.mjs`,
`python/pyproject.toml`, `python/folio_deck/`,
`packages/server/src/playwright.ts`, `.github/workflows/publish-pypi.yml`.
