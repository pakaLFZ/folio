/**
 * Workspace configuration: `folio.toml`, overlaid by the machine-local,
 * git-ignored `folio.local.toml` (interpreter paths live there).
 */
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { parse } from "smol-toml";

export interface WorkspaceConfig {
  root: string;
  decksDir: string;
  templatesDir: string;
  host: string;
  port: number;
  concurrency: number;
  perHook: number;
  memoryMb: number | null;
  runtimes: Record<string, string>;
  user: string;
  showDeckList: boolean;
}

/**
 * Read one TOML file if it exists.
 *
 * @param path - absolute path.
 * @returns the parsed table, or an empty object when the file is missing.
 */
function readToml(path: string): Record<string, any> {
  return existsSync(path) ? (parse(readFileSync(path, "utf8")) as Record<string, any>) : {};
}

/**
 * Load the configuration of a workspace folder.
 *
 * @param root - the workspace folder; defaults apply when it has no folio.toml.
 * @returns absolute directories, server address, queue caps and runtimes.
 */
export function loadConfig(root: string): WorkspaceConfig {
  const abs = resolve(root);
  const base = readToml(join(abs, "folio.toml"));
  const local = readToml(join(abs, "folio.local.toml"));
  const pick = (section: string, key: string, fallback: any) => local[section]?.[key] ?? base[section]?.[key] ?? fallback;
  return {
    root: abs,
    decksDir: resolve(abs, pick("workspace", "decks", "decks")),
    templatesDir: resolve(abs, pick("workspace", "templates", "templates")),
    host: pick("server", "host", "127.0.0.1"),
    port: Number(pick("server", "port", 4310)),
    concurrency: Number(pick("queue", "concurrency", 4)),
    perHook: Number(pick("queue", "per_hook", 2)),
    memoryMb: pick("queue", "memory_mb", null) === null ? null : Number(pick("queue", "memory_mb", null)),
    runtimes: runtimePaths({ ...(base.runtimes ?? {}), ...(local.runtimes ?? {}) }, abs),
    user: pick("workspace", "user", "user"),
    showDeckList: pick("editor", "show_deck_list", false) === true,
  };
}

/**
 * Runtime paths as the filesystem reads them: `~/` is the home folder and a
 * relative path is relative to the workspace root, not to the current folder.
 *
 * @returns the table with every value made absolute.
 */
function runtimePaths(runtimes: Record<string, string>, root: string): Record<string, string> {
  const absolute = (p: string) => (p === "~" || /^~[\\/]/.test(p) ? join(homedir(), p.slice(1)) : isAbsolute(p) ? p : resolve(root, p));
  return Object.fromEntries(Object.entries(runtimes).map(([name, p]) => [name, absolute(String(p))]));
}

/**
 * Find the workspace that contains a path, by walking up to a folio.toml.
 *
 * @param start - a deck folder, a workspace folder, or any path inside one.
 * @returns the nearest ancestor holding folio.toml, or `start` itself.
 */
export function findWorkspace(start: string): string {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, "folio.toml"))) return dir;
    const parent = resolve(dir, "..");
    if (parent === dir) return resolve(start);
    dir = parent;
  }
}
