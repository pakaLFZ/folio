/**
 * Calling a hook without a deck. The call is turned into the same job a slot
 * makes (`hookJob`), checked against the same schema, looked up in the same
 * caches and run by the same runner, so a figure made here is the figure a
 * deck would show, and either side reuses what the other drew.
 */
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { formatJson, readJson } from "../fsutil.js";
import { isTrace, validateHookInputs, type Job, type RunRecord, type TraceRecord } from "@folio/core";
import type { Workspace } from "../workspace.js";
import { runSpawn, type LoadedHook } from "./runner.js";
import { resolveRuntime } from "./runtime.js";
import { hookJob } from "./slots.js";
import { cachedExt, figurePath, hooksDir, type HookCache } from "./state.js";
import { readTrace, sha256File, tracePath } from "./trace.js";

/** A direct call: the hook's input, the box in pt, and optionally dpi, format and the slot it stands for. */
export interface DirectCall {
  input: unknown;
  w: number;
  h: number;
  format?: string;
  slot?: string;
  role?: string;
}

/** The workspace-level cache of direct calls, `.folio/hooks` at the workspace root. */
export function workspaceCache(root: string, base: string = root): HookCache {
  return { dir: base, stateDir: join(root, ".folio") };
}

/**
 * Find a hook by `pack/hook` (or a bare hook name when only one pack has it).
 *
 * @returns the loaded hook, or the reason none was found, listing what exists.
 */
export function findHook(workspace: Workspace, ref: string): { ok: true; hook: LoadedHook } | { ok: false; reason: string } {
  const all = [...workspace.packs.values()].flatMap((p) => Object.values(p.hooks).map((h) => ({ ref: `${p.pack.name}/${h.name}`, hook: h })));
  const hit = ref.includes("/") ? all.filter((h) => h.ref === ref) : all.filter((h) => h.hook.name === ref);
  if (hit.length === 1) return { ok: true, hook: hit[0]!.hook };
  const known = all.map((h) => h.ref).join(", ") || "none";
  return { ok: false, reason: hit.length ? `hook "${ref}" is in several packs (${hit.map((h) => h.ref).join(", ")}); name it as pack/hook` : `no hook "${ref}" in this workspace (hooks: ${known}); folio hook list prints them` };
}

/**
 * The call a trace record describes.
 *
 * @returns the input, box, format and slot of the run that made the traced output.
 */
export function callOfTrace(trace: TraceRecord): DirectCall {
  return { input: trace.inputs, w: trace.box.w, h: trace.box.h, ...(trace.format ? { format: trace.format } : {}), slot: trace.slot.slot, role: trace.slot.role };
}

/**
 * The job of a direct call, by the function deck slots use.
 *
 * @returns the job, with deck and slide left empty.
 */
export function directJob(hook: LoadedHook, call: DirectCall): Job {
  const role = call.role ?? (hook.output === "figure" ? "figure" : hook.output === "table" ? "table" : "body");
  const slot = hookJob(hook, { deck: "", slide: "", slot: call.slot ?? (role === "figure" ? "fig" : role), role, input: call.input, w: call.w, h: call.h, ...(call.format ? { format: call.format } : {}) });
  return { ...slot, priority: 1, enqueuedAt: Date.now(), attempt: 0 };
}

/**
 * Copy a cached output and its trace from the first cache that has the key.
 *
 * @param key - the cache key.
 * @param from - caches to look in, in order.
 * @param to - the cache to copy into.
 * @returns the extension of the output now in `to`, or null when no cache has it.
 */
export function adoptCached(key: string, from: HookCache[], to: HookCache): string | null {
  const own = cachedExt(to, key);
  if (own) return own;
  for (const cache of from) {
    const ext = cachedExt(cache, key);
    if (!ext || !existsSync(tracePath(cache, key))) continue;
    mkdirSync(hooksDir(to), { recursive: true });
    copyFileSync(tracePath(cache, key), tracePath(to, key));
    copyFileSync(figurePath(cache, key, ext), figurePath(to, key, ext));
    return ext;
  }
  return null;
}

export interface DirectResult {
  record: RunRecord | null;
  cached: boolean;
  file: string | null;
  trace: TraceRecord | null;
  issues: { jsonPath: string; reason: string }[];
}

/**
 * Run a hook for a direct call.
 *
 * @param o.cache - where the output is cached (a deck's, or the workspace's).
 * @param o.others - other caches to reuse an output from (every deck's).
 * @param o.fresh - skip every cache and draw into a scratch folder.
 * @returns the run record (null on a cache hit), the output file and its trace.
 */
export async function runDirect(o: { workspace: Workspace; hook: LoadedHook; call: DirectCall; cache: HookCache; others: HookCache[]; fresh?: boolean }): Promise<DirectResult> {
  const issues = validateHookInputs(o.hook.inputs, o.call.input);
  const none = { record: null, cached: false, file: null, trace: null };
  if (issues.length) return { ...none, issues };
  const job = directJob(o.hook, o.call);
  const ext = o.fresh ? null : adoptCached(job.key, o.others, o.cache);
  if (ext) return { record: null, cached: true, file: figurePath(o.cache, job.key, ext), trace: readTrace(o.cache, job.key), issues };
  const runtime = resolveRuntime(o.hook, o.workspace.config.runtimes);
  if (!runtime.ok) throw new Error(`runtime ${runtime.runtime} is not configured: until it is, each hooked slot falls back to what it was given as written (a text slot shows its raw text). Add it to folio.local.toml beside folio.toml: [runtimes] ${runtime.runtime} = "<path to a Python 3 with matplotlib>"; folio doctor says which Python it finds`);
  const target = o.fresh ? { dir: o.cache.dir, stateDir: mkdtempSync(join(tmpdir(), "folio-fresh-")) } : o.cache;
  const record = await runSpawn({ store: target, job, hook: o.hook, exe: runtime.exe, signal: new AbortController().signal, memoryMb: o.workspace.config.memoryMb, ...(o.call.format ? { format: o.call.format } : {}) });
  const found = cachedExt(target, job.key);
  return { record, cached: false, file: found ? figurePath(target, job.key, found) : null, trace: readTrace(target, job.key), issues };
}

/**
 * Remove the scratch folder a fresh run drew into.
 *
 * @param result - the result of a fresh `runDirect`.
 */
export function dropFresh(result: DirectResult): void {
  const dir = result.file ? join(result.file, "..", "..") : null;
  if (dir && /folio-fresh-[^/]+$/.test(dir)) rmSync(dir, { recursive: true, force: true });
}

/**
 * Write a direct call's output where the caller asked: a figure's bytes, or a
 * text or table hook's output as JSON (`{"text"}`, `{"columns", "rows"}`).
 *
 * @param out - the file to write.
 */
export function writeOutput(result: DirectResult, out: string): void {
  mkdirSync(dirname(out), { recursive: true });
  if (result.trace && result.trace.kind !== "figure") writeFileSync(out, formatJson((readJson<{ output: unknown }>(result.file!, { output: null })).output));
  else copyFileSync(result.file!, out);
}

/**
 * Whether an output matches a trace.
 *
 * @returns true when the file's sha256 is the one the trace recorded.
 */
export function matchesTrace(file: string, trace: unknown): boolean | null {
  return isTrace(trace) ? sha256File(file) === trace.output.sha256 : null;
}
