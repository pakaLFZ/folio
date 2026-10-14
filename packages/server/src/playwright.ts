/**
 * Loads Playwright from an explicit location when one is given, so a packaged
 * CLI (the pip wheel, whose Node resolves no `node_modules`) can point at the
 * `playwright`/`playwright-core` the Python wrapper found, without changing
 * what an npm install does.
 *
 * When `FOLIO_PLAYWRIGHT` names a directory holding `playwright` or
 * `playwright-core`, that package's entry point is imported directly;
 * otherwise this is `await import("playwright")`, exactly as before.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

/** The shape of `import("playwright")`: a type-only import, never bundled. */
export type PlaywrightModule = typeof import("playwright");

const PACKAGE_NAMES = ["playwright", "playwright-core"];

/** The ESM entry a package.json names, by `exports["."].import`, else `module`, else `main`, else `index.mjs`. */
function entryOf(pkgDir: string, manifest: Record<string, unknown>): string {
  const exports = manifest.exports as { "."?: { import?: string } } | undefined;
  const rel = exports?.["."]?.import ?? (manifest.module as string | undefined) ?? (manifest.main as string | undefined) ?? "index.mjs";
  return join(pkgDir, rel);
}

/** `dir` itself, or a child of `dir`, whose package.json names playwright or playwright-core. */
function packageEntry(dir: string): string | null {
  for (const pkgDir of [dir, ...PACKAGE_NAMES.map((name) => join(dir, name))]) {
    const manifestPath = join(pkgDir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!PACKAGE_NAMES.includes(manifest.name)) continue;
    return entryOf(pkgDir, manifest);
  }
  return null;
}

/**
 * Import Playwright, from `FOLIO_PLAYWRIGHT` when set, else the ordinary
 * module resolution.
 */
export async function loadPlaywright(): Promise<PlaywrightModule> {
  const dir = process.env.FOLIO_PLAYWRIGHT;
  if (dir) {
    const entry = packageEntry(dir);
    if (!entry) throw new Error(`FOLIO_PLAYWRIGHT=${dir} has no playwright or playwright-core package`);
    return (await import(pathToFileURL(entry).href)) as PlaywrightModule;
  }
  return (await import("playwright")) as PlaywrightModule;
}
