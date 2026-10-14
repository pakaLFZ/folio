/**
 * The Python a workspace uses when `[runtimes] python` is not set: the first
 * of `python3`, `python` and, on Windows, `py -3` on PATH that answers with a
 * Python 3.9 or later. Each candidate is asked for `sys.executable`, so a stub that only
 * offers to install Python (macOS without the command-line tools, the Windows
 * Store alias) fails the question and is skipped.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

export interface FoundPython {
  exe: string;
  /** The command that answered, such as `python3` or `py -3`. */
  via: string;
}

/** The oldest Python `folio_hook` runs on (`python/pyproject.toml`). */
export const MIN_PYTHON = [3, 9] as const;

const PROBE = `import sys; print(sys.executable if sys.version_info[:2] >= (${MIN_PYTHON.join(", ")}) else '')`;

/** The commands tried, in order, on a platform. */
export function pythonCandidates(platform: NodeJS.Platform = process.platform): string[][] {
  return platform === "win32" ? [["python3"], ["python"], ["py", "-3"]] : [["python3"], ["python"]];
}

/**
 * Ask one command for its interpreter.
 *
 * @returns the absolute interpreter path, or null when the command is missing or older than MIN_PYTHON.
 */
function probe(command: string[], env: NodeJS.ProcessEnv): string | null {
  const [program, ...args] = command;
  const done = spawnSync(program!, [...args, "-c", PROBE], { env, encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"], windowsHide: true });
  const exe = done.status === 0 ? done.stdout.trim() : "";
  return exe && existsSync(exe) ? exe : null;
}

const found = new Map<string, FoundPython | null>();

/**
 * Find a Python 3 on PATH, once per PATH.
 *
 * @param env - the environment whose PATH is searched.
 * @returns the interpreter and the command that found it, or null.
 */
export function findPython(env: NodeJS.ProcessEnv = process.env): FoundPython | null {
  const key = env.PATH ?? env.Path ?? "";
  if (!found.has(key)) {
    let hit: FoundPython | null = null;
    for (const command of pythonCandidates()) {
      const exe = probe(command, env);
      if (exe) {
        hit = { exe, via: command.join(" ") };
        break;
      }
    }
    found.set(key, hit);
  }
  return found.get(key)!;
}
