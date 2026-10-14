/**
 * Loads Playwright from an explicit location when one is given, so a packaged
 * CLI (the pip wheel, whose Node resolves no `node_modules`) can point at the
 * `playwright`/`playwright-core` the Python wrapper found, without changing
 * what an npm install does.
 *
 * When `FOLIO_PLAYWRIGHT` names a directory holding `playwright` or
 * `playwright-core`, that package's entry point is imported directly;
 * otherwise this is `await import("playwright")`, exactly as before.
 *
 * `ensureChromium()` downloads Chromium on first use (`spec/live/home.md`,
 * `spec/process/release.md`): a `pip install` / `npm install` never fetches
 * it, so the first command that needs a browser does, printing Playwright's
 * own installer output (its progress bar) rather than a second one of ours.
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmdirSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
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
function packageInfo(dir: string): { pkgDir: string; manifest: Record<string, unknown> } | null {
  for (const pkgDir of [dir, ...PACKAGE_NAMES.map((name) => join(dir, name))]) {
    const manifestPath = join(pkgDir, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (!PACKAGE_NAMES.includes(manifest.name)) continue;
    return { pkgDir, manifest };
  }
  return null;
}

function packageEntry(dir: string): string | null {
  const info = packageInfo(dir);
  return info ? entryOf(info.pkgDir, info.manifest) : null;
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

/** The directory Playwright itself downloads browsers into, same rule it uses. */
function browsersCacheDir(env: NodeJS.ProcessEnv, platform: NodeJS.Platform): string {
  if (env.PLAYWRIGHT_BROWSERS_PATH) return env.PLAYWRIGHT_BROWSERS_PATH;
  const home = homedir();
  if (platform === "darwin") return join(home, "Library", "Caches", "ms-playwright");
  if (platform === "win32") return join(env.LOCALAPPDATA ?? join(home, "AppData", "Local"), "ms-playwright");
  return join(home, ".cache", "ms-playwright");
}

/** The package directory `FOLIO_PLAYWRIGHT` names, or the one plain `import("playwright")` resolves. */
function resolvePackageDir(dir: string | undefined): string {
  if (dir) {
    const info = packageInfo(dir);
    if (!info) throw new Error(`FOLIO_PLAYWRIGHT=${dir} has no playwright or playwright-core package`);
    return info.pkgDir;
  }
  return dirname(createRequire(import.meta.url).resolve("playwright/package.json"));
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * A lock of our own around the install step: Playwright's own installer
 * (`playwright-core/lib/coreBundle.js`, `downloadBrowserWithProgressBar`)
 * only checks for a finished install (its `INSTALLATION_COMPLETE` marker)
 * before it starts, downloads into a fresh temp directory, then extracts
 * straight into the shared browsers directory; it carries no lock of its
 * own, so two folio processes starting at the same moment would both begin
 * that extraction into the same path. This directory lock (`mkdir`, no
 * `recursive`, so a second taker gets `EEXIST`) serialises folio's own calls
 * to the installer; a stale lock from a killed process still waits out the
 * timeout rather than looping forever.
 */
async function withInstallLock<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  mkdirSync(dir, { recursive: true });
  const lockDir = join(dir, ".folio-chromium-install.lock");
  const deadline = Date.now() + 10 * 60_000;
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      if (Date.now() > deadline) throw new Error(`timed out waiting for another folio process's Chromium install (${lockDir})`);
      await sleep(500);
    }
  }
  try {
    return await fn();
  } finally {
    rmdirSync(lockDir, { recursive: true });
  }
}

export interface EnsureChromiumOptions {
  /** Where the one status line goes; defaults to stderr. */
  log?: (line: string) => void;
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  /** Overrides the real `chromium.executablePath()` existence check, for tests. */
  exists?: (pw: PlaywrightModule) => boolean;
  /** Overrides running Playwright's own installer, for tests; returns whether it exited 0. */
  install?: (pw: PlaywrightModule) => boolean | Promise<boolean>;
}

/**
 * Downloads Playwright's Chromium on first use, so neither `pip install`
 * nor `npm install` has to (`spec/process/release.md`). Cheap once Chromium
 * is present: one `existsSync` stat.
 *
 * On a miss, it prints one line (what, the approximate size, where it
 * goes), then runs Playwright's own installer from the resolved package
 * with inherited stdio, so Playwright's own progress bar is what the user
 * sees. `FOLIO_NO_BROWSER_DOWNLOAD` refuses instead, naming the manual
 * command for this install channel (`python -m playwright install chromium`
 * under the pip wheel's `FOLIO_PLAYWRIGHT`, else `npx playwright install
 * chromium`); a failed install throws the same way.
 */
export async function ensureChromium(pw: PlaywrightModule, opts: EnsureChromiumOptions = {}): Promise<void> {
  const env = opts.env ?? process.env;
  const platform = opts.platform ?? process.platform;
  const log = opts.log ?? ((line: string) => process.stderr.write(`${line}\n`));
  const exists = opts.exists ?? ((p: PlaywrightModule) => existsSync(p.chromium.executablePath()));
  if (exists(pw)) return;
  const manual = env.FOLIO_PLAYWRIGHT ? "python -m playwright install chromium" : "npx playwright install chromium";
  if (env.FOLIO_NO_BROWSER_DOWNLOAD) {
    throw new Error(`Chromium is not installed and FOLIO_NO_BROWSER_DOWNLOAD is set; install it by hand: ${manual}`);
  }
  const dir = browsersCacheDir(env, platform);
  log(`folio: downloading Chromium once for PDF, PPTX and shot exports (~700 MB on disk) into ${dir}`);
  const install =
    opts.install ??
    ((p: PlaywrightModule) =>
      withInstallLock(dir, async () => {
        if (exists(p)) return true;
        const pkgDir = resolvePackageDir(env.FOLIO_PLAYWRIGHT);
        const result = spawnSync(process.execPath, [join(pkgDir, "cli.js"), "install", "chromium"], { stdio: "inherit" });
        return result.status === 0;
      }));
  const ok = await install(pw);
  if (!ok || !exists(pw)) {
    const deps = platform === "linux" ? ` (if it launches but fails on missing system libraries: ${manual.replace("install chromium", "install --with-deps chromium")})` : "";
    throw new Error(`Chromium did not install; run it by hand: ${manual}${deps}`);
  }
}
