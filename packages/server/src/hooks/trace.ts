/**
 * Trace records: what made each cached hook output, written beside it as
 * `<key>.json` in the step that caches the output, for every way a hook runs.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { relative } from "../posixpath.js";
import { dataCandidates, type Job, type TraceRecord } from "@folio/core";
import { atomicWrite, formatJson, readJson } from "../fsutil.js";
import { hooksDir, type HookCache } from "./state.js";
import type { LoadedHook } from "./runner.js";

/** How a run went, as far as the trace needs it. */
export interface TraceContext {
  exe: string | null;
  mode: "spawn" | "warm";
  seconds: number;
  format: string;
}

/** The sha256 of a file's bytes. */
export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

/**
 * The sha256 of every file of a hook folder, as `scriptHash` reads them.
 *
 * @returns sha256 by path relative to the folder, skipping caches and dot files.
 */
export function hookFileHashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d).sort()) {
      if (name === "__pycache__" || name.startsWith(".")) continue;
      const full = join(d, name);
      if (statSync(full).isDirectory()) walk(full);
      else out[relative(dir, full)] = sha256File(full);
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

const versions = new Map<string, string | null>();

/**
 * An interpreter's version line, asked once per process.
 *
 * @returns e.g. `Python 3.12.7`, or null when there is no interpreter or it does not answer.
 */
export function runtimeVersion(exe: string | null): string | null {
  if (!exe) return null;
  if (!versions.has(exe)) {
    try {
      versions.set(exe, execFileSync(exe, ["--version"], { encoding: "utf8", timeout: 10_000, stdio: ["ignore", "pipe", "pipe"] }).trim() || null);
    } catch {
      versions.set(exe, null);
    }
  }
  return versions.get(exe)!;
}

/**
 * The data files a run's inputs name.
 *
 * @param base - the folder relative names resolve against.
 * @returns each string of the inputs that is an existing file, with its sha256.
 */
export function dataFiles(base: string, inputs: unknown): TraceRecord["data"] {
  return dataCandidates(inputs).flatMap((path) => {
    const full = resolve(base, path);
    return existsSync(full) && statSync(full).isFile() ? [{ path, sha256: sha256File(full) }] : [];
  });
}

/**
 * Write the trace of an output just moved into the cache.
 *
 * @param cache - the cache the output is in.
 * @param output - the cached file.
 * @param response - a text or table hook's output as `folio hook run` writes
 *   it; its sha256 is the one recorded, so a regenerated output compares.
 * @returns the record written.
 */
export function writeTrace(cache: HookCache, job: Job, hook: LoadedHook, ctx: TraceContext, output: string, response?: string): TraceRecord {
  const stamp = job.stamp.split(":");
  const record: TraceRecord = {
    trace: 1,
    key: job.key,
    kind: job.kind,
    hook: { pack: hook.pack ?? null, name: hook.name, version: hook.version, scriptHash: stamp[stamp.length - 1] ?? "", stamp: job.stamp, files: hookFileHashes(hook.dir) },
    inputs: job.inputs,
    box: { w: job.box.w, h: job.box.h },
    dpi: job.kind === "figure" ? hook.dpi : 0,
    format: job.kind === "figure" ? ctx.format : null,
    slot: { deck: job.deck, slide: job.slide, slot: job.slot, role: job.role },
    base: cache.dir,
    data: dataFiles(cache.dir, job.inputs),
    runtime: { name: hook.runtime, exe: ctx.exe, version: runtimeVersion(ctx.exe), mode: ctx.mode },
    at: new Date().toISOString(),
    seconds: Math.round(ctx.seconds * 1000) / 1000,
    output: { file: basename(output), ...(response === undefined ? { sha256: sha256File(output), bytes: statSync(output).size } : { sha256: createHash("sha256").update(response).digest("hex"), bytes: Buffer.byteLength(response) }) },
  };
  atomicWrite(tracePath(cache, job.key), formatJson(record));
  return record;
}

/** Where the trace of a key is stored. */
export function tracePath(cache: HookCache, key: string): string {
  return join(hooksDir(cache), `${key}.json`);
}

/**
 * The trace of a cached output.
 *
 * @returns the record, or null when the key has none.
 */
export function readTrace(cache: HookCache, key: string | null): TraceRecord | null {
  return key ? readJson<TraceRecord | null>(tracePath(cache, key), null) : null;
}
