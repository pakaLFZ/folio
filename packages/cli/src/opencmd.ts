/**
 * `folio open`: ask VS Code to forward the server's port and open a deck on the
 * user's machine (`spec/live/vscode-open.md`); `folio restart`: reload the app
 * behind the held port (`spec/live/server-and-addresses.md`).
 */
import { hostname } from "node:os";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { findWorkspace, loadConfig, openInEditor, Workspace } from "@folio/server";
import { findServer } from "./queuecmds.js";

const RESTART_MS = 180_000;

export const restartedLine = (port: number | string, from?: number, to?: number) => `folio: restarted the app behind port ${port} (pid ${from} -> ${to}); the port stayed open\n`;

const FIRST_LOAD_MS = 6000;
const SECOND_LOAD_MS = 4000;

const notOpened = (url: string) => {
  const port = new URL(url).port;
  return `no VS Code window answered; open ${url} in a browser. If VS Code's Ports panel lists port ${port} but the page does not load, remove that forward and forward port ${port} again.\n`;
};

/**
 * Ask VS Code to open an address and print what happened, for a server that cannot report page loads.
 *
 * @returns whether a VS Code window accepted the request.
 */
export async function openAndSay(url: string): Promise<boolean> {
  const opened = await openInEditor(url).catch(() => null);
  process.stdout.write(opened ? `VS Code accepted the forward and open request for ${url}; browser reachability was not checked\n` : notOpened(url));
  return opened !== null;
}

interface OpenPort {
  port: number;
  loads: number;
}

const ASK_MS = 15_000;

/** One question to the server; null when it does not answer in time (a holder older than `/api/open-port` never does). */
async function askServer<T>(base: string, path: string, body?: unknown): Promise<T | null> {
  const init = body === undefined ? {} : { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } };
  const res = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(ASK_MS) }).catch(() => null);
  return res?.ok ? ((await res.json()) as T) : null;
}

/**
 * Ask VS Code to open a page of the server, and hold it to its word. VS Code answers once it has
 * forwarded the port, not once a browser loaded anything, and a forward it already holds for a port
 * is usually stale: it accepts and relays nothing. So every open goes to a loopback port no forward
 * has seen, and the page load is waited for; without one a second fresh port is tried; without one
 * again the user is told how to forward it themselves (`spec/live/vscode-open.md`).
 *
 * @param path - the page under the server's base, "" for the deck list.
 * @param waits - how long to wait for the load on the first fresh port and on the second.
 * @returns whether a browser loaded the page.
 */
export async function openChecked(base: string, path = "", waits: readonly [number, number] = [FIRST_LOAD_MS, SECOND_LOAD_MS]): Promise<boolean> {
  const urlOn = (port: number) => {
    const url = new URL(`${base}/${path}`);
    url.port = String(port);
    return url.href;
  };
  const loadedOn = async (open: OpenPort, ms: number) =>
    !!(await askServer<{ loaded: boolean }>(base, "/api/open-port/wait", { port: open.port, after: open.loads, ms }))?.loaded;
  const first = await askServer<OpenPort>(base, "/api/open-port", {});
  if (!first?.port) return openAndSay(`${base}/${path}`);
  if (!(await openInEditor(urlOn(first.port)).catch(() => null))) return (process.stdout.write(notOpened(`${base}/${path}`)), false);
  process.stdout.write(`asked VS Code to open ${urlOn(first.port)}; waiting for the page to load\n`);
  if (await loadedOn(first, waits[0])) return (process.stdout.write("the page loaded in your browser\n"), true);
  const second = await askServer<OpenPort>(base, "/api/open-port", {});
  if (second?.port && (await openInEditor(urlOn(second.port)).catch(() => null)) && (await loadedOn(second, waits[1]))) {
    process.stdout.write(`port ${first.port} reached nothing, so the page moved to ${urlOn(second.port)}, where it loaded\n`);
    return true;
  }
  const port = second?.port ?? first.port;
  process.stdout.write(
    `VS Code said it opened the page${second?.port ? ` on ports ${first.port} and ${second.port}` : ""}, and no browser loaded it. Forward it yourself:\n` +
      `  ssh -L ${port}:127.0.0.1:${port} ${hostname()}\n  then open ${urlOn(port).replace("127.0.0.1", "localhost")}\n`,
  );
  return false;
}

/** The deck's address part: its token and a slash, or "" for the deck list. */
function deckPath(workspace: Workspace, ref: string | undefined): string {
  if (!ref) return "";
  const store = workspace.findDeck(resolve(ref)) ?? workspace.findDeck(ref);
  if (!store) throw new Error(`no deck at ${ref}; decks live under ${workspace.config.decksDir}`);
  return `${store.token}/`;
}

/** `folio open [deck]`: exit 0 when VS Code accepted it, 1 when no server runs or no VS Code answered. */
export async function openCommand(args: string[]): Promise<number> {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const workspace = new Workspace(loadConfig(findWorkspace(positionals[0] ?? ".")));
  const path = deckPath(workspace, positionals[0]);
  const base = await findServer(workspace);
  if (!base) {
    process.stderr.write(`no folio server is running for ${workspace.config.root}; start one with folio serve\n`);
    return 1;
  }
  return (await openChecked(base, path)) ? 0 : 1;
}

/** `folio restart [workspace]`: a new app behind the same listening port; exit 1 when that fails. */
export async function restartCommand(args: string[]): Promise<number> {
  const { positionals } = parseArgs({ args, allowPositionals: true });
  const config = loadConfig(findWorkspace(positionals[0] ?? "."));
  const base = await findServer({ config });
  if (!base) {
    process.stderr.write(`no folio server is running for ${config.root}; start one with folio serve\n`);
    return 1;
  }
  const res = await fetch(`${base}/api/restart`, { method: "POST", signal: AbortSignal.timeout(RESTART_MS) });
  const body = (await res.json()) as { pid?: number; previous?: number; detail?: string };
  if (res.status === 404) process.stderr.write("this server was started before folio held its port; stop it once and run folio serve again\n");
  else if (!res.ok) process.stderr.write(`restart failed, the old app keeps serving: ${body.detail}\n`);
  else {
    process.stdout.write(restartedLine(new URL(base).port, body.previous, body.pid));
    await openChecked(base);
  }
  return res.ok ? 0 : 1;
}
