/**
 * `folio open`: ask VS Code to forward the server's port and open a deck on the
 * user's machine (`spec/live/vscode-open.md`); `folio restart`: reload the app
 * behind the held port (`spec/live/server-and-addresses.md`).
 */
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { findWorkspace, loadConfig, openInEditor, Workspace } from "@folio/server";
import { findServer } from "./queuecmds.js";

const RESTART_MS = 180_000;

export const restartedLine = (port: number | string, from?: number, to?: number) => `folio: restarted the app behind port ${port} (pid ${from} -> ${to}); the port stayed open\n`;

/**
 * Ask VS Code to open an address and print what happened.
 *
 * @returns whether a VS Code window accepted the request.
 */
export async function openAndSay(url: string): Promise<boolean> {
  const port = new URL(url).port;
  const opened = await openInEditor(url).catch(() => null);
  process.stdout.write(opened
    ? `VS Code accepted the forward and open request for ${url}; browser reachability was not checked\n`
    : `no VS Code window answered; open ${url} in a browser. If VS Code's Ports panel lists port ${port} but the page does not load, remove that forward and forward port ${port} again.\n`);
  return opened !== null;
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
  return (await openAndSay(`${base}/${path}`)) ? 0 : 1;
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
  const body = (await res.json()) as { pid?: number; previous?: number; forwardPort?: number; detail?: string };
  if (res.status === 404) process.stderr.write("this server was started before folio held its port; stop it once and run folio serve again\n");
  else if (!res.ok) process.stderr.write(`restart failed, the old app keeps serving: ${body.detail}\n`);
  else {
    process.stdout.write(restartedLine(new URL(base).port, body.previous, body.pid));
    const url = new URL(base);
    url.port = String(body.forwardPort ?? url.port);
    await openAndSay(`${url.origin}${url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`}`);
  }
  return res.ok ? 0 : 1;
}
