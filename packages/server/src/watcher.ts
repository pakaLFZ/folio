/**
 * File watchers. A deck's watcher starts with its first browser subscriber and
 * stops when the deck has been unwatched for a while; edits from any writer
 * (CLI, editor, a text editor) become `slide` events with a small patch.
 */
import { watchTree, type TreeWatcher } from "./treewatch.js";
import { posix } from "node:path";
import { toPosix } from "./posixpath.js";
import { settler } from "./settle.js";

export const IDLE_STOP_MS = 60_000;

export interface DeckWatchHandlers {
  slideChanged: (id: string) => void;
  deckChanged: () => void;
  /** Any other file, by its path with forward slashes; `version` is its content version, null when it is gone. */
  otherChanged: (path: string, version: string | null) => void;
}

/** Folders and files a deck watcher never reports: folio's own state, shots, temporary files, archives. */
export const ignoredInDeck = (path: string): boolean => /\/\.(folio|shots)(\/|$)|\.tmp$|\/node_modules\/|\/slides\/\.archive(\/|$)/.test(toPosix(path));

/**
 * Watch one deck folder.
 *
 * @param dir - the deck folder.
 * @param handlers - called with a slide id for `slides/<id>.json`, for
 *   `deck.json`, and with the path for anything else (comments, figures),
 *   each once its file is settled (`settle.ts`). Paths are matched in their
 *   forward-slash form, so the routing is the same on every OS.
 * @returns the watcher; close it to stop.
 */
export function watchDeck(dir: string, handlers: DeckWatchHandlers): TreeWatcher {
  const watcher = watchTree(dir, {
    ignoreInitial: true,
    depth: 3,
    ignored: ignoredInDeck,
  });
  const root = toPosix(dir);
  const touch = settler(({ path, version }) => {
    if (path === `${root}/deck.json`) handlers.deckChanged();
    else if (posix.dirname(path) === `${root}/slides` && path.endsWith(".json")) handlers.slideChanged(posix.basename(path, ".json"));
    else handlers.otherChanged(path, version);
  });
  watcher.on("add", touch).on("change", touch).on("unlink", touch);
  return watcher;
}

export class LazyWatchers {
  private readonly active = new Map<string, TreeWatcher>();
  private readonly stopTimers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly start: (token: string) => TreeWatcher | null) {}

  /**
   * Follow a deck's interest: start its watcher, or schedule its stop.
   *
   * @param token - the deck token.
   * @param watching - whether any browser now subscribes to it.
   */
  interest(token: string, watching: boolean): void {
    const timer = this.stopTimers.get(token);
    if (timer) clearTimeout(timer);
    this.stopTimers.delete(token);
    if (watching) {
      if (!this.active.has(token)) {
        const w = this.start(token);
        if (w) this.active.set(token, w);
      }
      return;
    }
    const stop = setTimeout(() => this.stop(token), IDLE_STOP_MS);
    stop.unref();
    this.stopTimers.set(token, stop);
  }

  /** Whether a deck currently has a watcher. */
  isActive(token: string): boolean {
    return this.active.has(token);
  }

  private stop(token: string): void {
    void this.active.get(token)?.close();
    this.active.delete(token);
    this.stopTimers.delete(token);
  }

  /** Close every watcher. */
  async closeAll(): Promise<void> {
    for (const t of this.stopTimers.values()) clearTimeout(t);
    await Promise.all([...this.active.values()].map((w) => w.close()));
    this.active.clear();
  }
}
