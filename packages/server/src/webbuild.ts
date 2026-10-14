/**
 * Which web build the server serves, and whether it is older than the sources
 * it was built from. In a dev checkout a merge that is not followed by
 * `pnpm build:web` serves the old renderer, which can draw blank slides; an
 * installed package ships no sources, and the check is skipped.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { relative } from "./posixpath.js";
import { fileURLToPath } from "node:url";

const PACKAGES = join(dirname(fileURLToPath(import.meta.url)), "../..");

/** The built web app: `FOLIO_WEB_DIST` when set, else `packages/web/dist`. */
export const WEB_DIST = process.env.FOLIO_WEB_DIST ? resolve(process.env.FOLIO_WEB_DIST) : join(PACKAGES, "web/dist");

/** What the web build is made from: the web app and the core it bundles. */
const WEB_SOURCES = ["web/src", "web/index.html", "web/vite.config.ts", "core/src"].map((p) => join(PACKAGES, p));

/**
 * The newest file under the sources.
 *
 * @returns its path and modification time, or null when there are no sources.
 */
function newestSource(paths: string[]): { path: string; mtimeMs: number } | null {
  let newest: { path: string; mtimeMs: number } | null = null;
  const visit = (path: string) => {
    const stat = statSync(path);
    if (stat.isDirectory()) for (const name of readdirSync(path)) visit(join(path, name));
    else if (!newest || stat.mtimeMs > newest.mtimeMs) newest = { path, mtimeMs: stat.mtimeMs };
  };
  for (const path of paths.filter((p) => existsSync(p))) visit(path);
  return newest;
}

/**
 * A one-line notice when the web build is missing or older than its sources.
 *
 * @param dist - the build folder.
 * @param sources - the files and folders it is built from.
 * @returns the notice, or null when the build is current or no sources are present.
 */
export function staleWebBuild(dist = WEB_DIST, sources = WEB_SOURCES): string | null {
  const source = newestSource(sources);
  if (!source) return null;
  const index = join(dist, "index.html");
  if (!existsSync(index)) return `folio: the web app is not built (${dist}); run pnpm build:web`;
  if (statSync(index).mtimeMs >= source.mtimeMs) return null;
  return `folio: the web app in ${dist} is older than its sources (${relative(PACKAGES, source.path)} changed since); run pnpm build:web`;
}
