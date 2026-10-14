/**
 * `folio comment reshoot <cid> | --all [path] [--force]`: re-take comment
 * screenshots in the current style (no selection border). Through the running
 * server when there is one, otherwise headless. A pair whose slide has changed
 * since is kept unless `--force`, which re-takes it from today's slide.
 */
import { parseArgs } from "node:util";
import { findWorkspace, FolioApp, listComments, loadConfig, PlaywrightShots, type DeckStore } from "@folio/server";
import { deckOfComment } from "./commentcmds.js";
import { startHeadless } from "./headless.js";
import { findServer } from "./queuecmds.js";
import { attachServices } from "./services.js";

type Outcome = { id: string; retaken: number[]; kept: { index: number; reason: string }[] };
type Target = { store: DeckStore; cid: string };

const USAGE = "usage: folio comment reshoot <cid> | --all [path] [--force]";

/** Re-take each target through a running server. */
async function viaServer(base: string, targets: Target[], force: boolean): Promise<Outcome[]> {
  const out: Outcome[] = [];
  for (const { store, cid } of targets) {
    const res = await fetch(`${base}/${store.token}/comments/${cid}/reshoot`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
    const body = (await res.json()) as Outcome & { detail?: string };
    if (!res.ok) throw new Error(`reshoot of ${cid} refused: ${body.detail ?? res.status}`);
    out.push(body);
  }
  return out;
}

/** Re-take each target on a headless server of this workspace. */
async function headlessly(app: FolioApp, targets: Target[], force: boolean): Promise<Outcome[]> {
  const headless = await startHeadless(app.config.root, (a) => attachServices(a, false).routes);
  const shots = new PlaywrightShots(() => headless.base);
  try {
    const comments = attachServices(headless.app, false).comments;
    comments.shots = shots;
    const out: Outcome[] = [];
    for (const { store, cid } of targets) out.push(await comments.reshoot(headless.app.workspace.findDeck(store.dir)!, cid, force));
    return out;
  } finally {
    await shots.close();
    await headless.close();
  }
}

/** Run the command. */
export async function reshootCommand(args: string[]): Promise<number> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: { all: { type: "boolean" }, force: { type: "boolean" } } });
  if (!values.all && !positionals[0]) throw new Error(USAGE);
  const app = new FolioApp(loadConfig(findWorkspace(values.all ? (positionals[0] ?? ".") : ".")));
  try {
    const targets: Target[] = values.all
      ? [...app.workspace.decks.values()].flatMap((store) => listComments(store).map((c) => ({ store, cid: c.id })))
      : [{ store: deckOfComment(app, positionals[0]!), cid: positionals[0]! }];
    if (!targets.length) {
      process.stdout.write("no comments to reshoot\n");
      return 0;
    }
    const base = await findServer(app);
    const outcomes = base ? await viaServer(base, targets, !!values.force) : await headlessly(app, targets, !!values.force);
    for (const o of outcomes) {
      process.stdout.write(`${o.id}  re-took ${o.retaken.length} pair${o.retaken.length === 1 ? "" : "s"}\n`);
      for (const k of o.kept) process.stdout.write(`    kept message ${k.index}'s pair: ${k.reason}${k.reason.includes("changed") ? " (--force re-takes it from today's slide)" : ""}\n`);
    }
    return outcomes.some((o) => o.kept.some((k) => !k.reason.includes("changed") && !k.reason.includes("gone"))) ? 1 : 0;
  } finally {
    await app.close();
  }
}
