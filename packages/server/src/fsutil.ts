/**
 * File primitives every writer uses: atomic replace, append-only JSON lines,
 * a cross-process lock, and move-to-archive (nothing is ever deleted).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { touchRenamedPaths, touchWrittenPath } from "./write-recording.js";

/**
 * Write a file so a reader never sees half of it.
 *
 * @param path - destination.
 * @param content - full new content.
 * @returns nothing; the content is written to a sibling temporary file and
 *   renamed over the destination, which is atomic on one filesystem.
 */
export function atomicWrite(path: string, content: string | Uint8Array): void {
  touchWrittenPath(path);
  mkdirSync(dirname(path), { recursive: true });
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.${Date.now()}.tmp`);
  writeFileSync(tmp, content);
  renameRetrying(tmp, path);
}

/** Error codes Windows gives a rename while another process has the file open; they clear when it closes. */
const RENAME_BUSY = new Set(["EPERM", "EACCES", "EBUSY"]);
const RENAME_WAIT_MS = 2000;

/**
 * Rename, waiting out a reader on Windows.
 *
 * @param from - the path renamed.
 * @param to - its new path, replaced when it exists.
 * @returns nothing. On Windows a rename onto a file another process is reading
 *   fails with EPERM until the reader closes it, so it is retried every 10 ms
 *   for up to two seconds (graceful-fs does the same). Elsewhere a failure throws at once.
 */
export function renameRetrying(from: string, to: string): void {
  touchRenamedPaths(from, to);
  for (let waited = 0; ; waited += 10) {
    try {
      return renameSync(from, to);
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? "";
      if (process.platform !== "win32" || !RENAME_BUSY.has(code) || waited >= RENAME_WAIT_MS) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
}

/**
 * Append one record to a JSON-lines log.
 *
 * @param path - the log file, created with its folder when missing.
 * @param record - any JSON-serialisable value, written as one line.
 */
export function appendJsonl(path: string, record: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, `${JSON.stringify(record)}\n`);
}

/**
 * Read and parse a JSON file.
 *
 * @param path - the file.
 * @returns the parsed value, or `fallback` when the file does not exist.
 */
export function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Format JSON the way every folio file is stored.
 *
 * @param value - the value.
 * @returns two-space indented JSON with a trailing newline.
 */
export function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * Run a function while holding a lock directory, across processes.
 *
 * @param lockDir - path of the lock; `mkdir` succeeds for exactly one holder.
 * @param fn - the critical section.
 * @param timeoutMs - how long to wait; a lock older than 30 s is taken over as stale.
 * @returns whatever `fn` returns. Throws when the lock cannot be taken in time.
 */
export async function withLock<T>(lockDir: string, fn: () => Promise<T> | T, timeoutMs = 10_000): Promise<T> {
  mkdirSync(dirname(lockDir), { recursive: true });
  const started = Date.now();
  for (;;) {
    try {
      mkdirSync(lockDir);
      break;
    } catch {
      const age = existsSync(lockDir) ? Date.now() - statSync(lockDir).mtimeMs : 0;
      if (age > 30_000) rmdirSync(lockDir);
      else if (Date.now() - started > timeoutMs) throw new Error(`lock ${lockDir} is held`);
      else await new Promise((r) => setTimeout(r, 25 + Math.random() * 50));
    }
  }
  try {
    return await fn();
  } finally {
    rmdirSync(lockDir);
  }
}

/**
 * Move a file or folder into a dated archive beside where it lived.
 *
 * @param path - what to archive.
 * @param archiveRoot - the `.archive` folder to move it under.
 * @param at - the time, for the `YYYY-MM-DD` folder.
 * @returns the new path. Nothing is deleted.
 */
export function archive(path: string, archiveRoot: string, at = new Date()): string {
  const day = at.toISOString().slice(0, 10);
  let target = join(archiveRoot, day, basename(path));
  if (existsSync(target)) target = join(archiveRoot, day, `${Date.now()}_${basename(path)}`);
  mkdirSync(dirname(target), { recursive: true });
  renameRetrying(path, target);
  return target;
}

/**
 * Today's date as used in log file names.
 *
 * @param at - the time.
 * @returns `YYYY-MM-DD` in UTC.
 */
export function dayOf(at = new Date()): string {
  return at.toISOString().slice(0, 10);
}
