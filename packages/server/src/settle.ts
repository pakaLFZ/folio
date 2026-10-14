/**
 * Settled file changes: a watcher's raw events (several per write, an atomic
 * replace that NTFS reports as unlink then add, a file still being written)
 * become one change per file once it can be read whole (its path written
 * with `/`, `toPosix`), with the content
 * version the browser puts in the file's address.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { toPosix } from "./posixpath.js";

export interface SettleTiming {
  /** How often a file still being written, locked or just gone is read again. */
  retryMs: number;
  /** How long a file must stay missing before it is published as gone. */
  goneMs: number;
  /** How long a file may stay unreadable or partial before it is published as it is. */
  giveUpMs: number;
  /**
   * When every event's file is read once more: chokidar drops a `change`
   * that follows another on the same path within 50 ms and never sends it
   * later, so the last write of a quick pair would otherwise go unseen.
   */
  confirmMs: number;
}

export const SETTLE_TIMING: SettleTiming = { retryMs: 25, goneMs: 250, giveUpMs: 2000, confirmMs: 60 };

/** A settled file: its path with forward slashes, and its content version, null when it is gone. */
export interface Settled {
  path: string;
  version: string | null;
}

const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]);

/** The content version of a file's bytes: the first 16 hex of their sha1. */
export function contentVersion(bytes: Uint8Array): string {
  return createHash("sha1").update(bytes).digest("hex").slice(0, 16);
}

/** The content version of a file as it is now, or null when it cannot be read. */
export function fileVersion(path: string): string | null {
  const read = readNow(path);
  return typeof read === "string" ? null : contentVersion(read);
}

/**
 * Whether bytes look like a whole file of their kind.
 *
 * @returns false for a PNG without its `IEND` chunk, a JPEG without its end
 *   marker, an empty one of either, or JSON that does not parse; true otherwise.
 */
export function looksWhole(path: string, bytes: Uint8Array): boolean {
  const ext = extname(path).toLowerCase();
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (ext === ".png") return buf.length > PNG_END.length && buf.subarray(buf.length - PNG_END.length).equals(PNG_END);
  if (ext === ".jpg" || ext === ".jpeg") return buf.length > 2 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9;
  if (ext !== ".json") return true;
  try {
    JSON.parse(buf.toString("utf8"));
    return true;
  } catch {
    return false;
  }
}

/** Read a file now: its bytes, `gone` when it does not exist, `busy` when it is locked (Windows) or unreadable. */
function readNow(path: string): Buffer | "gone" | "busy" {
  try {
    return readFileSync(path);
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT" ? "gone" : "busy";
  }
}

/**
 * Collect raw events per file and hand each file on once it is settled.
 *
 * @param onSettled - called once per settled change; never twice in a row
 *   with the same version for one path. Each event's file is read again
 *   `confirmMs` later, so a write whose own event chokidar dropped is seen.
 * @param timing - retry, grace and give-up times.
 * @returns `touch(path)` for every raw event.
 */
export function settler(onSettled: (change: Settled) => void, timing: SettleTiming = SETTLE_TIMING): (path: string) => void {
  const pending = new Set<string>();
  const last = new Map<string, string | null>();
  const publish = (path: string, version: string | null) => {
    pending.delete(path);
    if (last.has(path) && last.get(path) === version) return;
    last.set(path, version);
    onSettled({ path, version });
  };
  const check = (path: string, started: number) => {
    const read = readNow(path);
    const waited = Date.now() - started;
    if (read === "gone") return waited >= timing.goneMs ? publish(path, null) : void setTimeout(() => check(path, started), timing.retryMs).unref();
    const whole = read !== "busy" && looksWhole(path, read);
    if (!whole && waited < timing.giveUpMs) return void setTimeout(() => check(path, started), timing.retryMs).unref();
    if (read === "busy") return void pending.delete(path);
    publish(path, contentVersion(read));
  };
  const start = (path: string) => {
    if (pending.has(path)) return;
    pending.add(path);
    setTimeout(() => check(path, Date.now()), 0).unref();
  };
  return (raw) => {
    const path = toPosix(raw);
    start(path);
    setTimeout(() => start(path), timing.confirmMs).unref();
  };
}
