/**
 * A workspace: every pack under `templates/` and every deck under `decks/`,
 * each deck mounted under its 8-hex token.
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { buildCatalog, hookSlotProblems, loadHookDef, loadPack, parsePackRef, type FolioCatalog, type HookDef, type Pack } from "@folio/core";
import type { WorkspaceConfig } from "./config.js";
import { DeckStore } from "./deckstore.js";
import { readJson } from "./fsutil.js";
import { toPosix } from "./posixpath.js";

export interface LoadedPack {
  pack: Pack;
  dir: string;
  hooks: Record<string, HookDef & { dir: string; pack: string }>;
  catalog: FolioCatalog;
}

/**
 * List the subfolders of a folder.
 *
 * @param dir - the folder; may not exist.
 * @returns names of visible subfolders.
 */
function subdirs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => !n.startsWith(".") && statSync(join(dir, n)).isDirectory());
}

/**
 * Load one pack folder with its hooks.
 *
 * @param dir - `templates/<pack>/`.
 * @returns the pack and its catalog, or the problems found.
 */
export function loadPackDir(dir: string): { ok: true; loaded: LoadedPack } | { ok: false; problems: string[] } {
  const result = loadPack(readJson(join(dir, "pack.json"), null));
  if (!result.ok) return result;
  const hooks: LoadedPack["hooks"] = {};
  const problems: string[] = [];
  for (const name of subdirs(join(dir, "hooks"))) {
    const hookResult = loadHookDef(readJson(join(dir, "hooks", name, "hook.json"), null));
    if (hookResult.ok) hooks[hookResult.hook.name] = { ...hookResult.hook, dir: join(dir, "hooks", name), pack: result.pack.name };
    else problems.push(...hookResult.problems.map((p) => `hooks/${name}/hook.json ${p}`));
  }
  if (!problems.length) problems.push(...hookSlotProblems(result.pack, hooks));
  if (problems.length) return { ok: false, problems };
  return { ok: true, loaded: { pack: result.pack, dir, hooks, catalog: buildCatalog(result.pack, hooks) } };
}

export class Workspace {
  readonly config: WorkspaceConfig;
  readonly packs = new Map<string, LoadedPack>();
  readonly packProblems = new Map<string, string[]>();
  readonly decks = new Map<string, DeckStore>();

  /**
   * Load every pack and deck of a workspace.
   *
   * @param config - the workspace configuration.
   * @throws when two decks share a token, naming both folders.
   */
  constructor(config: WorkspaceConfig) {
    this.config = config;
    this.reloadPacks();
    for (const name of subdirs(config.decksDir)) {
      const dir = join(config.decksDir, name);
      if (existsSync(join(dir, "deck.json"))) this.mount(new DeckStore(dir));
    }
  }

  /** Re-read every pack folder; packs that fail keep their problems listed. */
  reloadPacks(): void {
    this.packs.clear();
    this.packProblems.clear();
    for (const name of subdirs(this.config.templatesDir)) {
      const result = loadPackDir(join(this.config.templatesDir, name));
      if (result.ok) this.packs.set(result.loaded.pack.name, result.loaded);
      else this.packProblems.set(name, result.problems);
    }
  }

  /**
   * Mount a deck under its token.
   *
   * @param store - the opened deck.
   * @throws on a token collision, naming both deck folders.
   */
  mount(store: DeckStore): void {
    const other = this.decks.get(store.token);
    if (other && other.dir !== store.dir) throw new Error(`deck token ${store.token} is shared by ${other.dir} and ${store.dir}; give one of them a new id in deck.json`);
    this.decks.set(store.token, store);
  }

  /**
   * Take a deck off its token, when its folder no longer holds it.
   *
   * @returns whether it was mounted.
   */
  unmount(store: DeckStore): boolean {
    return this.decks.get(store.token) === store && this.decks.delete(store.token);
  }

  /**
   * The pack a deck uses.
   *
   * @param store - the deck.
   * @returns the loaded pack, or undefined when it is not installed or the
   *   installed version differs from the pinned one.
   */
  packOf(store: DeckStore): LoadedPack | undefined {
    const ref = parsePackRef(store.deck.template);
    const loaded = this.packs.get(ref.name);
    if (!loaded) return undefined;
    return ref.version === null || ref.version === loaded.pack.version ? loaded : undefined;
  }

  /**
   * Find a deck by token, folder name or path.
   *
   * @param key - an 8-hex token, a folder name under `decks/`, or a path.
   * @returns the deck, or undefined.
   */
  findDeck(key: string): DeckStore | undefined {
    if (this.decks.has(key)) return this.decks.get(key);
    const wanted = toPosix(key).replace(/\/+$/, "");
    for (const store of this.decks.values()) {
      const dir = toPosix(store.dir);
      if (dir === wanted || dir.endsWith(`/${wanted}`)) return store;
    }
    return undefined;
  }
}
