/**
 * Runtimes: a pack names an interpreter by name ("python"); the workspace
 * config maps the name to a path, so packs carry no machine's paths.
 */
import { existsSync } from "node:fs";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execa } from "execa";
import type { HookDef } from "@folio/core";
import { findPython } from "./findpython.js";

/** folio's own Python folder, put on PYTHONPATH so `import folio_hook` works without installing. */
export const FOLIO_PYTHON = join(dirname(fileURLToPath(import.meta.url)), "../../../../python");

/**
 * The interpreter for a hook.
 *
 * @param hook - the hook definition.
 * @param runtimes - the workspace's runtime table.
 * @returns the interpreter path, null when the hook needs none, or an error
 *   naming the setting to add.
 */
export function resolveRuntime(hook: HookDef, runtimes: Record<string, string>): { ok: true; exe: string | null } | { ok: false; runtime: string } {
  if (!hook.runtime) return { ok: true, exe: null };
  const found = runtimeExe(hook.runtime, runtimes);
  return found ? { ok: true, exe: found.exe } : { ok: false, runtime: hook.runtime };
}

export interface RuntimeExe {
  exe: string;
  /** `configured` from folio.local.toml or folio.toml; else the PATH command that answered. */
  source: "configured" | "path";
  via?: string;
}

/**
 * The interpreter for a runtime name: the configured path when it is set,
 * else, for `python` only, a Python 3 found on PATH.
 *
 * @returns the interpreter and where it came from, or null when the configured
 *   path does not exist or nothing is configured or found.
 */
export function runtimeExe(name: string, runtimes: Record<string, string>): RuntimeExe | null {
  const configured = runtimes[name];
  if (configured) return existsSync(configured) ? { exe: configured, source: "configured" } : null;
  const found = name === "python" ? findPython() : null;
  return found ? { exe: found.exe, source: "path", via: found.via } : null;
}

/**
 * One line saying which interpreter a runtime uses.
 *
 * @returns e.g. `python: /usr/bin/python3 (found on PATH as python3; ...)`.
 */
export function describeRuntime(name: string, runtimes: Record<string, string>): string {
  const found = runtimeExe(name, runtimes);
  if (runtimes[name] && !found) return `${name}: ${runtimes[name]} is configured but does not exist`;
  if (!found) return `${name}: not configured and not found on PATH`;
  if (found.source === "configured") return `${name}: ${found.exe} (configured)`;
  return `${name}: ${found.exe} (found on PATH as ${found.via}; set [runtimes] ${name} in folio.local.toml to choose another)`;
}

/**
 * The environment a hook runs with.
 *
 * @returns the parent environment with folio's Python folder on PYTHONPATH, a
 *   non-interactive matplotlib backend, and `SOURCE_DATE_EPOCH=0` so a figure's
 *   bytes do not depend on when it was drawn.
 */
export function hookEnv(): NodeJS.ProcessEnv {
  const path = [FOLIO_PYTHON, process.env.PYTHONPATH].filter(Boolean).join(delimiter);
  return { ...process.env, PYTHONPATH: path, MPLBACKEND: "Agg", PYTHONDONTWRITEBYTECODE: "1", SOURCE_DATE_EPOCH: "0" };
}

const checked = new Map<string, string | null>();

/**
 * Check a hook's `requires` once per interpreter, by importing each module.
 *
 * @param exe - the interpreter.
 * @param requires - requirement strings such as `matplotlib>=3.8`.
 * @returns the first requirement that cannot be imported, or null.
 */
export async function unmetRequirement(exe: string, requires: string[]): Promise<string | null> {
  for (const req of requires) {
    const module = req.split(/[<>=!~ \[]/)[0]!.replace(/-/g, "_");
    const id = `${exe}\u001f${module}`;
    if (!checked.has(id)) {
      const result = await execa(exe, ["-c", `import ${module}`], { reject: false, timeout: 30_000, env: hookEnv() });
      checked.set(id, result.exitCode === 0 ? null : req);
    }
    if (checked.get(id)) return req;
  }
  return null;
}
