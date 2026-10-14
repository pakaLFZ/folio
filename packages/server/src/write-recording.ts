import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

export interface WriteRecording {
  roots: string[];
  before: Map<string, Buffer | null>;
  conflicted: Set<string>;
  active: boolean;
}

const context = new AsyncLocalStorage<WriteRecording>();
const active = new Set<WriteRecording>();

export function newRecording(roots: string[]): WriteRecording {
  const recording: WriteRecording = { roots: roots.map((root) => resolve(root)), before: new Map(), conflicted: new Set(), active: true };
  active.add(recording);
  return recording;
}

export function runRecording<T>(recording: WriteRecording, fn: () => T): T {
  return context.run(recording, fn);
}

export function finishRecording(recording: WriteRecording): void {
  recording.active = false;
  active.delete(recording);
}

export function touchWrittenPath(path: string): void {
  const recording = context.getStore();
  if (!isAbsolute(path)) return;
  const full = resolve(path);
  for (const other of active) {
    if (other !== recording && other.before.has(full)) other.conflicted.add(full);
  }
  if (!recording?.active) return;
  for (const root of recording.roots) {
    const rel = relative(root, full);
    if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) continue;
    const parts = rel.split(sep);
    if (parts[0] === ".folio" || parts[0] === ".shots" || full.endsWith(".tmp")) return;
    if (existsSync(full) && statSync(full).isDirectory()) {
      for (const name of readdirSync(full)) touchWrittenPath(resolve(full, name));
    } else if (!recording.before.has(full)) {
      recording.before.set(full, existsSync(full) ? readFileSync(full) : null);
    }
    return;
  }
}

export function touchRenamedPaths(from: string, to: string): void {
  if (existsSync(from) && statSync(from).isDirectory()) {
    for (const name of readdirSync(from)) touchRenamedPaths(resolve(from, name), resolve(to, name));
    return;
  }
  touchWrittenPath(from);
  touchWrittenPath(to);
}
