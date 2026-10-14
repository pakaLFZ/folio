/**
 * `folio py <script.py> [args]`: run a script with the workspace's Python
 * runtime and folio's own Python folder on PYTHONPATH, as hooks run, so
 * `import folio_hook` works without installing it.
 */
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describeRuntime, findWorkspace, hookEnv, loadConfig, runtimeExe } from "@folio/server";

/** `folio py <script.py> [args]`: exits with the script's exit code. */
export async function pyCommand(args: string[]): Promise<number> {
  if (!args[0]) throw new Error("usage: folio py <script.py> [args]: runs the script with the workspace's [runtimes] python and folio_hook importable");
  const config = loadConfig(findWorkspace("."));
  const python = runtimeExe("python", config.runtimes);
  if (!python) throw new Error(`no Python runtime (${describeRuntime("python", config.runtimes)}): set python = "/path/to/python" under [runtimes] in ${join(config.root, "folio.local.toml")}, or put python3 on PATH; folio doctor checks it`);
  const done = spawnSync(python.exe, args, { stdio: "inherit", env: hookEnv() });
  if (done.error) throw done.error;
  return done.status ?? 1;
}
