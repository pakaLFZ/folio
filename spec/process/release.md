# Process: the minimal release

## Demand

- "make a release which is a minimal version that does not contain excess
  front end stuff" *(user, 2026-10-14)*.

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
  `python/folio_client`, `skills/folio`, `docs/pack-guide.md`,
  `docs/warnings.md`, `folio.toml`, `LICENSE`, and a release `README.md`
  (`scripts/release-readme.md`). No web sources, tests, e2e, spec or
  TypeScript.
- With no web sources present, the stale-build check is skipped.

## Checks

- Unpacked elsewhere with only `npm install`: `folio doctor` all ok;
  `init-deck`, `new` with a hook figure and a table, `shot --sheet`,
  `check`, `pdf`, `pptx`, `deck export`, `pack guide`, `codes`,
  `quickstart`, `skill install`, and `serve` on a free port answering the
  page and its assets (2026-10-14).

## Where it lives

`scripts/release.mjs`, `scripts/release-readme.md`.
