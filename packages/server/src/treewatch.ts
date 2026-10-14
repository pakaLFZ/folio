/**
 * One way to watch a folder tree on every OS. On Linux and macOS it is
 * chokidar, unchanged. On Windows chokidar keeps an open handle on every
 * watched subfolder, and Windows refuses to rename or remove a folder while a
 * handle inside it is open, so a deck folder could not be renamed (by the
 * user or by folio, which moves comment folders) while the server ran. There
 * the tree is watched with one recursive `fs.watch` on its root, which locks
 * nothing below it, and its raw events are turned into chokidar's: `add`,
 * `addDir`, `change`, `unlink`, `unlinkDir`, each also as `all`, then `ready`.
 */
import { EventEmitter } from "node:events";
import { watch as fsWatch, readdirSync, statSync, type FSWatcher as NodeWatcher } from "node:fs";
import { join, sep } from "node:path";
import { watch as chokidarWatch, type FSWatcherEventMap } from "chokidar";

type EventName = FSWatcherEventMap["all"][0];

/** The options folio's watchers use. */
export interface TreeWatchOptions {
  ignoreInitial: true;
  /** How many levels of subfolders are followed; 0 is the root's own entries. */
  depth: number;
  ignored: (path: string) => boolean;
}

/** What folio's watchers use of a watcher: chokidar's typed events and `close`. */
export interface TreeWatcher {
  on<K extends keyof FSWatcherEventMap>(event: K, listener: (...args: FSWatcherEventMap[K]) => void): TreeWatcher;
  once<K extends keyof FSWatcherEventMap>(event: K, listener: (...args: FSWatcherEventMap[K]) => void): TreeWatcher;
  close(): Promise<void>;
}

/**
 * Watch a folder tree.
 *
 * @param dir - the root folder.
 * @param options - depth, the ignore test, and no events for what exists now.
 * @returns chokidar's watcher, or on Windows the recursive one.
 */
export function watchTree(dir: string, options: TreeWatchOptions): TreeWatcher {
  return process.platform === "win32" ? new RecursiveWatcher(dir, options) : chokidarWatch(dir, options);
}

/** A recursive `fs.watch` that reports chokidar's events, from what it has seen on disk. */
export class RecursiveWatcher extends EventEmitter<FSWatcherEventMap> {
  /** Every path under the root that is watched: null for a folder, a file's modification time and size. */
  private readonly known = new Map<string, string | null>();
  private readonly native: NodeWatcher;

  constructor(private readonly root: string, private readonly options: TreeWatchOptions) {
    super();
    this.scan(root, 0, false);
    this.native = fsWatch(root, { recursive: true }, (_type, name) => name && this.seen(name.toString()));
    this.native.on("error", (e) => this.emit("error", e));
    setImmediate(() => this.emit("ready"));
  }

  async close(): Promise<void> {
    this.native.close();
  }

  /** Whether a path below the root, given relative to it, is too deep or under an ignored folder. */
  private skipped(rel: string): boolean {
    const parts = rel.split(sep);
    if (parts.length - 1 > this.options.depth) return true;
    return parts.some((_, i) => this.options.ignored(join(this.root, ...parts.slice(0, i + 1))));
  }

  /** Record a folder's entries, at `level` below the root, and below them to the watched depth; announce each when `announce` is set. */
  private scan(dir: string, level: number, announce: boolean): void {
    if (level > this.options.depth) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (this.options.ignored(path)) continue;
      this.known.set(path, entry.isDirectory() ? null : stampOf(path) ?? "");
      if (announce) this.report(entry.isDirectory() ? "addDir" : "add", path);
      if (entry.isDirectory()) this.scan(path, level + 1, announce);
    }
  }

  /** One raw event: compare the path on disk with what was known and report the difference, as chokidar would. */
  private seen(rel: string): void {
    if (this.skipped(rel)) return;
    const path = join(this.root, rel);
    const now = stampOf(path);
    const was = this.known.get(path);
    if (was !== undefined && (now === undefined || (was === null) !== (now === null))) this.forget(path);
    if (now === undefined) return;
    if (now !== null) {
      const before = this.known.get(path);
      this.known.set(path, now);
      if (before !== now) this.report(before === undefined ? "add" : "change", path);
    } else if (!this.known.has(path)) {
      this.known.set(path, null);
      this.report("addDir", path);
      this.scan(path, rel.split(sep).length, true);
    }
  }

  /** A path went away: report it, and everything known below it first. */
  private forget(path: string): void {
    for (const [p, stamp] of [...this.known]) if (p.startsWith(path + sep)) (this.known.delete(p), this.report(stamp === null ? "unlinkDir" : "unlink", p));
    const stamp = this.known.get(path);
    this.known.delete(path);
    this.report(stamp === null ? "unlinkDir" : "unlink", path);
  }

  private report(event: EventName, path: string): void {
    this.emit(event, path);
    this.emit("all", event, path);
  }
}

/** A path's state: null for a folder, a file's modification time and size, undefined when it is not there (also while Windows deletes it). */
function stampOf(path: string): string | null | undefined {
  try {
    const stats = statSync(path, { throwIfNoEntry: false });
    return stats === undefined ? undefined : stats.isDirectory() ? null : `${stats.mtimeMs}:${stats.size}`;
  } catch {
    return undefined;
  }
}
