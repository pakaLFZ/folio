/**
 * `folio viewing`: which deck, slide and selection the user has open in the
 * editor now, read from the workspace's running server. Exit 0 whether or not
 * anything is open; 4 when `--wait-change` reaches `--timeout`.
 */
import { parseArgs } from "node:util";
import { viewingStatusLine, viewingText, type Viewing } from "@folio/core";
import { findWorkspace, FolioApp, loadConfig } from "@folio/server";
import { draftNotes } from "./draftnotes.js";
import { findServer } from "./queuecmds.js";

const EXIT_TIMEOUT = 4;
const LONG_POLL_S = 120;

/**
 * Read what is open, or wait for the next change after `since`.
 *
 * @param base - the server address.
 * @param since - a version to wait past, or null to read at once.
 * @param waitS - how long the server holds the reply.
 * @param signal - aborts the wait.
 */
export async function fetchViewing(base: string, since: number | null, waitS: number, signal?: AbortSignal): Promise<Viewing> {
  const query = since === null ? "" : `?since=${since}&wait=${waitS}`;
  return (await (await fetch(`${base}/api/viewing${query}`, { signal })).json()) as Viewing;
}

/**
 * Wait until the version moves past `since` (by default, the version now),
 * asking in long polls of at most `LONG_POLL_S`.
 *
 * @returns the new state, or null at the timeout.
 */
async function waitChange(base: string, since: number | null, timeoutMs: number): Promise<Viewing | null> {
  const start = since === null ? await fetchViewing(base, null, 0) : { version: since };
  const end = timeoutMs ? Date.now() + timeoutMs : Infinity;
  for (;;) {
    const left = Math.ceil((end - Date.now()) / 1000);
    if (left <= 0) return null;
    const now = await fetchViewing(base, start.version, Math.min(LONG_POLL_S, left));
    if (now.version !== start.version) return now;
  }
}

/** The `folio status` line: what the user has open, or that nothing is. */
export async function viewingStatus(app: FolioApp): Promise<string> {
  const base = await findServer(app);
  return viewingStatusLine(base ? (await fetchViewing(base, null, 0)).tabs : null);
}

/** `folio viewing [path] [--json] [--wait-change [--since V]] [--timeout S]` */
export async function viewingCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { json: { type: "boolean" }, "wait-change": { type: "boolean" }, since: { type: "string" }, timeout: { type: "string" } } });
  const app = new FolioApp(loadConfig(findWorkspace(positionals[0] ?? ".")));
  const base = await findServer(app);
  if (!base) {
    await app.close();
    process.stdout.write(values.json ? `${JSON.stringify({ server: null, version: null, tabs: [] })}\n` : "no editor is open: no folio server is running for this workspace (start one with folio serve)\n");
    return 0;
  }
  const state = values["wait-change"] ? await waitChange(base, values.since === undefined ? null : Number(values.since), Number(values.timeout ?? 0) * 1000) : await fetchViewing(base, null, 0);
  if (!state) {
    await app.close();
    process.stderr.write("folio viewing: --timeout reached before the view changed\n");
    return EXIT_TIMEOUT;
  }
  const drafts = state.tabs.flatMap((t) => (t.slide ? draftsOnTab(app, t.token, t.slide.id) : []));
  await app.close();
  process.stdout.write(values.json ? `${JSON.stringify({ server: base, ...state, drafts })}\n` : viewingText(state.tabs) + drafts.map((d) => `${d}\n`).join(""));
  return 0;
}

/** The drafts on the slide a tab shows. */
function draftsOnTab(app: FolioApp, token: string, slide: string): string[] {
  const store = app.workspace.findDeck(token);
  return store ? draftNotes(app.workspace, store, slide) : [];
}
