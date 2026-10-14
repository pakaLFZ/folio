/**
 * Running one hook in spawn mode. The hook is a child process in its own
 * process group, in a temporary folder, at lower priority; a timeout or a
 * cancellation kills the whole group. Its output is checked (a figure exists,
 * decodes and has the box size; a text or table response has its shape) and
 * only then moved into the cache, so a half-written output never replaces the
 * last good one.
 */
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { checkHookOutput, expectedPixels, parseHookStdout, pngSize, type HookDef, type Job, type RunRecord } from "@folio/core";
import { atomicWrite, formatJson, renameRetrying } from "../fsutil.js";
import { killTree } from "./killtree.js";
import { hookEnv } from "./runtime.js";
import { figurePath, hooksDir, OUTPUT_EXT, type HookCache } from "./state.js";
import { writeTrace, type TraceContext } from "./trace.js";

export type LoadedHook = HookDef & { dir: string; pack?: string };

export interface RunOptions {
  store: HookCache;
  job: Job;
  hook: LoadedHook;
  exe: string | null;
  signal: AbortSignal;
  memoryMb: number | null;
  /** A figure format other than the hook's own (a direct call). */
  format?: string;
}

/**
 * The request object a hook reads on stdin, the same envelope for every kind.
 *
 * @returns kind, slot, role, box in pt, deck and slide ids, the slot's input
 *   and the deck folder; a figure request adds `inputs` (the same object),
 *   dpi, output path and format.
 */
export function hookRequest(job: Job, hook: HookDef, out: string, deckDir: string, format: string = hook.outputs) {
  const envelope = { kind: job.kind, slot: job.slot, role: job.role, box: { w: job.box.w, h: job.box.h }, deck: job.deck, slide: job.slide, input: job.inputs, deck_dir: deckDir };
  return job.kind === "figure" ? { ...envelope, inputs: job.inputs, dpi: hook.dpi, out, format } : envelope;
}

/**
 * The command line of a spawn-mode hook.
 *
 * @returns the program and its arguments, under `nice` and, when a memory cap
 *   is set and `prlimit` exists, under `prlimit --as`.
 */
function commandLine(hook: LoadedHook, exe: string | null, memoryMb: number | null): string[] {
  const [script, ...rest] = hook.command;
  const target = exe ? [exe, join(hook.dir, script!), ...rest] : [join(hook.dir, script!), ...rest];
  const limited = memoryMb && existsSync("/usr/bin/prlimit") ? ["/usr/bin/prlimit", `--as=${memoryMb * 1024 * 1024}`, "--", ...target] : target;
  return existsSync("/usr/bin/nice") ? ["/usr/bin/nice", "-n", "10", ...limited] : limited;
}

/**
 * Check a written figure against the box.
 *
 * @returns null when it is right, else the size problem or a reason.
 */
export function verifyOutput(path: string, job: Job, hook: HookDef, format: string = hook.outputs): { size?: RunRecord["size"]; reason?: string } | null {
  if (!existsSync(path)) return { reason: "the hook wrote no figure" };
  const bytes = readFileSync(path);
  const want = expectedPixels({ ...job.box, dpi: hook.dpi });
  if (format === "pdf") return verifyPdf(bytes, job);
  if (format === "png") {
    const got = pngSize(bytes);
    if (!got) return { reason: "the figure is not a PNG" };
    return got.w === want.w && got.h === want.h ? null : { size: { w: got.w, h: got.h, ew: want.w, eh: want.h } };
  }
  const head = bytes.subarray(0, 2048).toString("utf8");
  const w = Number(/width="([\d.]+)pt"/.exec(head)?.[1]);
  const h = Number(/height="([\d.]+)pt"/.exec(head)?.[1]);
  if (!w || !h) return { reason: "the SVG has no width and height in pt" };
  return Math.abs(w - job.box.w) <= 0.5 && Math.abs(h - job.box.h) <= 0.5 ? null : { size: { w, h, ew: job.box.w, eh: job.box.h } };
}

/** Check a PDF figure's first page against the box, within half a point. */
function verifyPdf(bytes: Buffer, job: Job): { size?: RunRecord["size"]; reason?: string } | null {
  const box = /\/MediaBox\s*\[\s*([\d.-]+)\s+([\d.-]+)\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(bytes.toString("latin1"));
  if (!box) return { reason: "the figure is not a PDF with a MediaBox" };
  const w = Number(box[3]) - Number(box[1]);
  const h = Number(box[4]) - Number(box[2]);
  return Math.abs(w - job.box.w) <= 0.5 && Math.abs(h - job.box.h) <= 0.5 ? null : { size: { w, h, ew: job.box.w, eh: job.box.h } };
}

/**
 * Check a finished run's output and move it into the cache with its trace.
 *
 * @param out - where a figure hook wrote its file.
 * @param response - the response line of a text or table hook.
 * @param ctx - interpreter, mode, seconds and format, for the trace.
 * @returns null when the output is cached, else what the record must say.
 */
export function acceptOutput(store: HookCache, job: Job, hook: LoadedHook, out: string, response: unknown, ctx: Partial<TraceContext> = {}): Partial<RunRecord> | null {
  const trace: TraceContext = { exe: null, mode: "spawn", seconds: 0, format: hook.outputs, ...ctx };
  if (job.kind !== "figure") {
    const checked = checkHookOutput(job.kind, response);
    if (!checked.ok) return { status: "output", detail: checked.reason };
    const file = figurePath(store, job.key, OUTPUT_EXT);
    atomicWrite(file, formatJson({ input: job.inputs, output: checked.output }));
    writeTrace(store, job, hook, trace, file, formatJson(checked.output));
    return null;
  }
  const problem = verifyOutput(out, job, hook, trace.format);
  if (problem) return { status: problem.size ? "size" : "error", ...(problem.size ? { size: problem.size } : { detail: problem.reason }) };
  const file = figurePath(store, job.key, trace.format);
  renameRetrying(out, file);
  writeTrace(store, job, hook, trace, file);
  return null;
}

/**
 * Run one job in a fresh process.
 *
 * @param o - deck, job, hook, interpreter, cancellation signal, memory cap.
 * @returns the run record; on success the output is already in the cache.
 */
export async function runSpawn(o: RunOptions): Promise<RunRecord> {
  const started = Date.now();
  const tmp = join(hooksDir(o.store), "tmp", `${o.job.key}-${randomBytes(4).toString("hex")}`);
  mkdirSync(tmp, { recursive: true });
  const format = o.format ?? o.hook.outputs;
  const out = join(tmp, `figure.${format}`);
  const [program, ...args] = commandLine(o.hook, o.exe, o.memoryMb);
  const child = execa(program!, args, { input: JSON.stringify(hookRequest(o.job, o.hook, out, o.store.dir, format)), cwd: tmp, env: hookEnv(), detached: true, reject: false, stripFinalNewline: false });
  let ended: "timeout" | "cancelled" | null = null;
  const killGroup = (why: "timeout" | "cancelled") => {
    ended ??= why;
    killTree(child.pid);
  };
  const timer = setTimeout(() => killGroup("timeout"), o.hook.timeout * 1000);
  o.signal.addEventListener("abort", () => killGroup("cancelled"), { once: true });
  const result = await child;
  clearTimeout(timer);
  const printed = parseHookStdout(String(result.stdout ?? ""));
  const base = { key: o.job.key, kind: o.job.kind, hook: o.job.hook, stamp: o.job.stamp, deck: o.job.deck, slide: o.job.slide, slot: o.job.slot, inputs: o.job.inputs, exit: result.exitCode ?? null, seconds: (Date.now() - started) / 1000, stderrTail: String(result.stderr ?? "").slice(-2000), warnings: printed.warnings, at: new Date().toISOString() };
  try {
    if (ended) return { ...base, status: ended === "timeout" ? "timeout" : "cancelled" };
    if (result.signal) return { ...base, status: "signal", detail: result.signal };
    if (result.exitCode !== 0) return { ...base, status: "exit" };
    return { ...base, status: "ok", ...acceptOutput(o.store, o.job, o.hook, out, printed.response, { exe: o.exe, mode: "spawn", seconds: base.seconds, format }) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}
