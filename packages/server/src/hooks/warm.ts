/**
 * Warm mode: a few long-lived Python workers per hook version import the hook
 * once and answer one request at a time (a figure, a text or a table). One job per worker at a time; a timeout
 * or crash kills the worker's process group and the next job gets a fresh one;
 * a worker is retired after 50 jobs so a leak cannot grow without end.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { execa, type ResultPromise } from "execa";
import type { Job, RunRecord } from "@folio/core";
import { killTree } from "./killtree.js";
import { hookEnv } from "./runtime.js";
import { hooksDir } from "./state.js";
import { acceptOutput, hookRequest, type RunOptions } from "./runner.js";

export const RECYCLE_AFTER = 50;

class WarmWorker {
  readonly proc: ResultPromise;
  private readonly lines: string[] = [];
  private waiter: ((line: string | null) => void) | null = null;
  jobs = 0;
  alive = true;
  busy = false;

  constructor(exe: string, hookDir: string, entry: string) {
    this.proc = execa(exe, ["-m", "folio_hook.warm", hookDir, entry], { env: hookEnv(), detached: true, reject: false, buffer: false, stdin: "pipe" });
    const rl = createInterface({ input: this.proc.stdout! });
    rl.on("line", (line) => (this.waiter ? (this.waiter(line), (this.waiter = null)) : this.lines.push(line)));
    rl.on("close", () => {
      this.alive = false;
      this.waiter?.(null);
      this.waiter = null;
    });
    this.proc.stderr?.on("data", () => {});
    void this.proc.catch(() => {});
  }

  /**
   * The next protocol line, or null when the worker dies or the time runs out.
   *
   * @param ms - how long to wait.
   * @param signal - aborts the wait.
   */
  next(ms: number, signal: AbortSignal): Promise<string | null> {
    if (this.lines.length) return Promise.resolve(this.lines.shift()!);
    if (!this.alive) return Promise.resolve(null);
    return new Promise((resolve) => {
      const done = (line: string | null) => {
        clearTimeout(timer);
        resolve(line);
      };
      const timer = setTimeout(() => ((this.waiter = null), resolve(null)), ms);
      signal.addEventListener("abort", () => ((this.waiter = null), done(null)), { once: true });
      this.waiter = done;
    });
  }

  send(request: unknown): void {
    this.proc.stdin!.write(`${JSON.stringify(request)}\n`);
  }

  /** Kill the worker's whole process group. */
  kill(): void {
    this.alive = false;
    killTree(this.proc.pid);
  }
}

export class WarmPool {
  private readonly workers = new Map<string, WarmWorker[]>();

  /**
   * Run one job on a warm worker of its hook version.
   *
   * @param o - the same options as spawn mode; `exe` must be set.
   * @returns the run record.
   */
  async run(o: RunOptions): Promise<RunRecord> {
    const started = Date.now();
    const base = (status: RunRecord["status"], extra: Partial<RunRecord> = {}): RunRecord => ({ key: o.job.key, kind: o.job.kind, hook: o.job.hook, stamp: o.job.stamp, deck: o.job.deck, slide: o.job.slide, slot: o.job.slot, inputs: o.job.inputs, exit: null, seconds: (Date.now() - started) / 1000, stderrTail: "", warnings: [], at: new Date().toISOString(), status, ...extra });
    const worker = await this.acquire(o);
    if (!worker) return base("error", { detail: "the warm worker did not start" });
    const tmp = join(hooksDir(o.store), "tmp", `${o.job.key}-${randomBytes(4).toString("hex")}`);
    mkdirSync(tmp, { recursive: true });
    const out = join(tmp, `figure.${o.hook.outputs}`);
    try {
      worker.send(hookRequest(o.job, o.hook, out, o.store.dir));
      const line = await worker.next(o.hook.timeout * 1000, o.signal);
      if (line === null) {
        worker.kill();
        return base(o.signal.aborted ? "cancelled" : "timeout");
      }
      const reply = JSON.parse(line) as { ok: boolean; warnings?: RunRecord["warnings"]; error?: string; response?: unknown };
      if (!reply.ok) return base("exit", { exit: 1, stderrTail: reply.error ?? "", warnings: reply.warnings ?? [] });
      return base("ok", { exit: 0, warnings: reply.warnings ?? [], ...acceptOutput(o.store, o.job, o.hook, out, reply.response, { exe: o.exe, mode: "warm", seconds: (Date.now() - started) / 1000 }) });
    } finally {
      worker.busy = false;
      worker.jobs += 1;
      if (worker.jobs >= RECYCLE_AFTER || !worker.alive) this.retire(o.job.stamp, worker);
      rmSync(tmp, { recursive: true, force: true });
    }
  }

  private async acquire(o: RunOptions): Promise<WarmWorker | null> {
    const list = (this.workers.get(o.job.stamp) ?? []).filter((w) => w.alive);
    this.workers.set(o.job.stamp, list);
    const idle = list.find((w) => !w.busy);
    const worker = idle ?? new WarmWorker(o.exe!, o.hook.dir, o.hook.entry ?? "draw:draw");
    worker.busy = true;
    if (!idle) {
      list.push(worker);
      const ready = await worker.next(o.hook.timeout * 1000, o.signal);
      if (ready === null) {
        this.retire(o.job.stamp, worker);
        return null;
      }
    }
    return worker;
  }

  private retire(stamp: string, worker: WarmWorker): void {
    worker.kill();
    this.workers.set(stamp, (this.workers.get(stamp) ?? []).filter((w) => w !== worker));
  }

  /** Kill every warm worker. */
  close(): void {
    for (const list of this.workers.values()) list.forEach((w) => w.kill());
    this.workers.clear();
  }
}

export type { Job };
