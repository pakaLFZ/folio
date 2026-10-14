/**
 * `folio` alone: open the deck list of this workspace, or of the default one,
 * starting its server in the background when none runs; `folio stop` stops it
 * (`spec/live/home.md`).
 */
import { spawn, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { findWorkspace, loadConfig, readJson } from "@folio/server";
import { openAndSay } from "./opencmd.js";
import { findServer } from "./queuecmds.js";

const SHIPPED_PACK = fileURLToPath(new URL("../../../templates/lectern/", import.meta.url));
const START_MS = 20_000;
const STOP_MS = 15_000;
const WORKSPACE_TOML = '[workspace]\ndecks = "decks"\ntemplates = "templates"\n';

/** Where `folio` alone works outside any workspace. */
export function defaultWorkspace(home = homedir(), env = process.env): string {
  if (env.FOLIO_HOME) return env.FOLIO_HOME;
  return existsSync(join(home, "Documents")) ? join(home, "Documents", "folio") : join(home, "folio-decks");
}

/**
 * Make a workspace with `folio.toml` and the shipped `lectern` pack, unless it has a `folio.toml` already.
 *
 * @returns true when it was made now.
 */
export function ensureWorkspace(dir: string, pack = SHIPPED_PACK): boolean {
  if (existsSync(join(dir, "folio.toml"))) return false;
  mkdirSync(join(dir, "decks"), { recursive: true });
  writeFileSync(join(dir, "folio.toml"), WORKSPACE_TOML);
  if (existsSync(pack)) cpSync(pack, join(dir, "templates", "lectern"), { recursive: true });
  return true;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Start `folio serve <root>` detached, its output in `.folio/serve.log`; resolves with the base URL once it answers. */
async function startServer(config: { root: string; port: number }): Promise<string> {
  mkdirSync(join(config.root, ".folio"), { recursive: true });
  const log = join(config.root, ".folio", "serve.log");
  const out = openSync(log, "w");
  spawn(process.execPath, [process.argv[1]!, "serve", config.root], { detached: true, stdio: ["ignore", out, out], windowsHide: true }).unref();
  for (const deadline = Date.now() + START_MS; Date.now() < deadline; await sleep(300)) {
    const base = await findServer({ config });
    if (base) return base;
  }
  const tail = readFileSync(log, "utf8").trim().split("\n").slice(-8).join("\n");
  throw new Error(`the server did not answer within ${START_MS / 1000} s; ${log} ends with:\n${tail}`);
}

/** The command that opens a URL in this machine's browser, or null when there is none to open here. */
export function browserCommand(platform = process.platform, env = process.env): string[] | null {
  if (env.SSH_CONNECTION || env.SSH_TTY) return null;
  if (platform === "darwin") return ["open"];
  if (platform === "win32") return ["rundll32", "url.dll,FileProtocolHandler"];
  if (!env.DISPLAY && !env.WAYLAND_DISPLAY) return null;
  return spawnSync("xdg-open", ["--version"], { stdio: "ignore" }).error ? null : ["xdg-open"];
}

/** Open the URL in the local browser, else through VS Code's forward, else print it. */
async function openHome(url: string): Promise<void> {
  const browser = browserCommand();
  if (browser) {
    spawn(browser[0]!, [...browser.slice(1), url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    process.stdout.write(`opened ${url}\n`);
  } else if (process.env.SSH_CONNECTION || process.env.SSH_TTY) await openAndSay(url);
  else process.stdout.write(`open ${url} in a browser\n`);
}

/** `folio` alone, in a terminal. */
export async function homeCommand(): Promise<number> {
  const here = findWorkspace(".");
  const root = existsSync(join(here, "folio.toml")) ? here : defaultWorkspace();
  if (ensureWorkspace(root)) process.stdout.write(`made the folio workspace ${root} with the lectern pack\n`);
  const config = loadConfig(root);
  const running = await findServer({ config });
  const base = running ?? (await startServer(config));
  process.stdout.write(`${running ? "folio is serving" : "started folio for"} ${root} at ${base}/\n`);
  await openHome(`${base}/`);
  process.stdout.write("the server keeps running; folio stop stops it\n");
  return 0;
}

/** `folio stop [workspace]`: exit 0 once the server's process is gone, 1 when none runs. */
export async function stopCommand(args: string[]): Promise<number> {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const found = findWorkspace(positionals[0] ?? ".");
  const root = existsSync(join(found, "folio.toml")) || positionals[0] ? found : defaultWorkspace();
  const record = readJson<{ pid: number } | null>(join(root, ".folio", "server.json"), null);
  const alive = (pid: number) => {
    try {
      return process.kill(pid, 0);
    } catch {
      return false;
    }
  };
  if (!record || !alive(record.pid)) {
    process.stderr.write(`no folio server is running for ${root}\n`);
    return 1;
  }
  process.kill(record.pid, "SIGTERM");
  for (const deadline = Date.now() + STOP_MS; Date.now() < deadline; await sleep(200)) {
    if (!alive(record.pid)) return (process.stdout.write(`stopped the folio server for ${root} (pid ${record.pid})\n`), 0);
  }
  process.stderr.write(`the folio server (pid ${record.pid}) is still running after ${STOP_MS / 1000} s\n`);
  return 1;
}
