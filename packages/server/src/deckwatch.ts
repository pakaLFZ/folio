/**
 * The workspace channel: one watcher over `decks/` that mounts a deck folder
 * the moment its `deck.json` appears, unmounts it when the file goes, and
 * publishes `deck.added`, `deck.changed` and `deck.removed` on the hub under
 * the `workspace` key, whoever wrote the files (the server, the CLI or an
 * agent). A browser subscribes with `/events?decks=workspace`.
 */
import { watchTree, type TreeWatcher } from "./treewatch.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { relative } from "./posixpath.js";
import { DeckStore } from "./deckstore.js";
import type { Hub } from "./hub.js";
import type { Workspace } from "./workspace.js";

export const WORKSPACE_CHANNEL = "workspace";

const SETTLE_MS = 100;

/** What a deck list needs to place a deck: the light row of `GET /api/decks`. */
export interface DeckRow {
  token: string;
  title: string;
  template: string;
  dir: string;
  archived: boolean;
  editedAt: string;
}

/** The light row of a deck. */
export function deckRow(store: DeckStore): DeckRow {
  return { token: store.token, title: store.deck.title, template: store.deck.template, dir: store.dir, archived: store.deck.archived === true, editedAt: store.editedAt() };
}

/** Whether a path under `decks/` can change a deck's row: its folder, its `deck.json` or a slide file. */
function rowFile(rel: string): string | null {
  const [folder, ...rest] = rel.split("/");
  if (!folder || folder === ".." || folder.startsWith(".")) return null;
  const file = rest.join("/");
  return file === "" || file === "deck.json" || /^slides\/[^/.][^/]*\.json$/.test(file) ? folder : null;
}

/**
 * Watch `decks/` for deck folders and their rows.
 *
 * @param workspace - mounts and unmounts decks here.
 * @param hub - publishes the workspace events.
 * @returns the watcher; close it to stop.
 */
export function watchDeckFolders(workspace: Workspace, hub: Hub): TreeWatcher {
  const decksDir = workspace.config.decksDir;
  const timers = new Map<string, NodeJS.Timeout>();
  const watcher = watchTree(decksDir, { ignoreInitial: true, depth: 2, ignored: (p) => /(^|\/)\.|\.tmp$/.test(relative(decksDir, p)) });
  watcher.on("all", (_event, path) => {
    const folder = rowFile(relative(decksDir, path));
    if (!folder) return;
    clearTimeout(timers.get(folder));
    timers.set(folder, setTimeout(() => (timers.delete(folder), rescanDeck(workspace, hub, join(decksDir, folder))), SETTLE_MS).unref());
  });
  return watcher;
}

/**
 * Bring one deck folder's mount in line with the disk and say what changed.
 *
 * @param dir - `decks/<folder>`.
 */
export function rescanDeck(workspace: Workspace, hub: Hub, dir: string): void {
  const mounted = [...workspace.decks.values()].find((s) => s.dir === dir);
  if (!existsSync(join(dir, "deck.json"))) {
    if (mounted && workspace.unmount(mounted)) hub.publish(WORKSPACE_CHANNEL, "deck.removed", { token: mounted.token, dir });
    return;
  }
  try {
    if (mounted) {
      mounted.reloadDeck();
      return hub.publish(WORKSPACE_CHANNEL, "deck.changed", deckRow(mounted));
    }
    const store = new DeckStore(dir);
    if (workspace.decks.has(store.token)) return;
    workspace.mount(store);
    hub.publish(WORKSPACE_CHANNEL, "deck.added", deckRow(store));
  } catch (error) {
    process.stderr.write(`deck ${dir} not mounted: ${(error as Error).message}\n`);
  }
}
