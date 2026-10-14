/**
 * The hook queue. Derived, not stored: on start and on every slide change it
 * computes each hooked slot's cache key and queues only the missing figures.
 * Isolation, caps, fairness, the circuit breaker and the canary rollout follow
 * section 4e of the plan; the pure decisions live in @folio/core.
 */
import { join, posix } from "node:path";
import { toPosix } from "../posixpath.js";
import { watchTree, type TreeWatcher } from "../treewatch.js";
import { canonicalJson, isTransient, nextJobs, type FolioWarning, type Job, type RunRecord, type SlideSpec } from "@folio/core";
import type { FolioApp } from "../app.js";
import type { DeckStore } from "../deckstore.js";
import { Ledger, Presence } from "./ledger.js";
import { runSpawn, type LoadedHook } from "./runner.js";
import { resolveRuntime, unmetRequirement } from "./runtime.js";
import { flowedHeights, hookedSlots, hookSlotWarnings } from "./slots.js";
import { readJson } from "../fsutil.js";
import { settler } from "../settle.js";
import { hooksDir, logHook, readSlideState, slotView, writeSlotState, type SlotPhase, type SlotState } from "./state.js";
import { WarmPool } from "./warm.js";
import { adoptCached, workspaceCache } from "./direct.js";

export const DEBOUNCE_MS = 300;

/**
 * Whether a job only re-draws a figure because its hook changed: the slot has a
 * good figure from another version of the same hook, drawn from the same inputs.
 *
 * @returns true for a rollout job, which waits for its version's canary.
 */
function isRollout(store: DeckStore, slot: { hook: string; stamp: string; inputs: unknown }, prev: SlotState | undefined): boolean {
  if (!prev?.goodKey || !prev.goodStamp || prev.goodStamp === slot.stamp || !prev.goodStamp.startsWith(`${slot.hook}@`)) return false;
  const meta = readJson<{ inputs?: unknown } | null>(join(hooksDir(store), `${prev.goodKey}.json`), null);
  return !!meta && canonicalJson(meta.inputs) === canonicalJson(slot.inputs);
}

interface Running {
  job: Job;
  hook: LoadedHook;
  controller: AbortController;
}

export class HookService {
  private readonly queued = new Map<string, { job: Job; hook: LoadedHook }>();
  private readonly running = new Map<string, Running>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly recent: RunRecord[] = [];
  readonly ledger: Ledger;
  readonly presence: Presence;
  private readonly warm = new WarmPool();
  private slideWatcher: TreeWatcher | null = null;

  /**
   * @param app - the server state.
   * @param memoryMb - an optional address-space cap per hook run.
   */
  constructor(private readonly app: FolioApp, private readonly memoryMb: number | null = null) {
    this.ledger = new Ledger(app.config.root);
    this.presence = new Presence(() => app.hub.watchedDecks());
    app.warnings.addProvider((store, slide, spec, at) => this.warningsOf(store, slide, spec, at));
  }

  /**
   * Reconcile every slide and follow slide and pack changes. Slide files of
   * every deck are watched here, browser or not, so a worker's edit is drawn
   * even when nobody is looking.
   */
  start(): void {
    this.slideWatcher = watchTree(this.app.config.decksDir, { ignoreInitial: true, depth: 2, ignored: (p) => /\/\.(folio|archive)|\.tmp$/.test(toPosix(p)) });
    const touch = settler(({ path }) => this.fileSettled(path));
    this.slideWatcher.on("all", (event, path) => event.endsWith("Dir") || touch(path));
    this.app.listen((token, type, data) => {
      const store = this.app.workspace.decks.get(token);
      if (!store) return;
      if (type === "slide") {
        this.presence.edited(token, (data as { id: string }).id);
        this.reconcileSoon(store, (data as { id: string }).id);
      } else if (type === "pack") for (const id of store.slideIds()) this.reconcileSoon(store, id);
      else if (type === "measured") this.reconcile(store, (data as { slide: string }).slide);
    });
    for (const store of this.app.workspace.decks.values()) for (const id of store.slideIds()) this.reconcile(store, id);
  }

  /** A slide, `deck.json` or `.table.json` file of some deck settled (path with forward slashes): draw and reconcile. */
  private fileSettled(path: string): void {
    const decks = [...this.app.workspace.decks.values()];
    const m = /\/([^/]+)\/slides\/([^/.][^/]*)\.json$/.exec(path);
    const store = m ? decks.find((d) => toPosix(d.dir) === posix.dirname(posix.dirname(path))) : undefined;
    if (store && m) this.app.slideTouched(store, m[2]!);
    const deck = path.endsWith("/deck.json") || path.endsWith(".table.json") ? decks.find((d) => path.startsWith(`${toPosix(d.dir)}/`)) : undefined;
    if (deck) this.deckChanged(deck);
  }

  /** A deck's `deck.json` (its pack pin) or a `.table.json` file changed: reload the deck and reconcile every slide. */
  private deckChanged(store: DeckStore): void {
    try {
      store.reloadDeck();
    } catch {
      return;
    }
    for (const id of store.slideIds()) this.reconcileSoon(store, id);
  }

  /** Reconcile a slide after a quiet 300 ms, so a burst of edits runs once. */
  reconcileSoon(store: DeckStore, slide: string): void {
    const id = `${store.token}/${slide}`;
    clearTimeout(this.timers.get(id));
    this.timers.set(id, setTimeout(() => (this.timers.delete(id), this.reconcile(store, slide)), DEBOUNCE_MS));
  }

  private warningsOf(store: DeckStore, slide: string, spec: SlideSpec | null, at: string): FolioWarning[] {
    const pack = this.app.workspace.packOf(store);
    return pack ? hookSlotWarnings(store, slide, hookedSlots(store, slide, spec, pack, flowedHeights(this.app.warnings.lastMeasured(store, slide))), pack.pack.name, at) : [];
  }

  /**
   * Bring one slide's hooked slots to their desired state.
   *
   * @param store - the deck.
   * @param slide - the slide id.
   */
  reconcile(store: DeckStore, slide: string): void {
    const found = hookedSlots(store, slide, store.readSlide(slide)?.spec ?? null, this.app.workspace.packOf(store), flowedHeights(this.app.warnings.lastMeasured(store, slide)));
    const states = readSlideState(store, slide);
    const seen = new Set<string>();
    for (const f of found) {
      const slotName = f.kind === "ok" ? f.slot.slot : f.slot;
      seen.add(slotName);
      const id = `${store.token}/${slide}/${slotName}`;
      const prev = states[slotName];
      if (f.kind !== "ok") {
        this.cancel(id);
        this.setState(store, slide, slotName, { key: "", hook: f.hook, stamp: "", goodKey: prev?.goodKey ?? null, goodStamp: prev?.goodStamp ?? null, phase: "invalid", record: null, at: new Date().toISOString() });
        continue;
      }
      this.reconcileSlot(store, f.slot, f.hook, prev);
    }
    for (const slotName of Object.keys(states)) {
      if (seen.has(slotName)) continue;
      this.cancel(`${store.token}/${slide}/${slotName}`);
      writeSlotState(store, slide, slotName, null);
    }
    this.app.publishWarnings(store, slide, null);
    this.pump();
  }

  private reconcileSlot(store: DeckStore, slot: Job | Omit<Job, "priority" | "enqueuedAt" | "attempt">, hook: LoadedHook, prev: SlotState | undefined): void {
    const id = `${slot.deck}/${slot.slide}/${slot.slot}`;
    const base = { key: slot.key, hook: slot.hook, stamp: slot.stamp, goodKey: prev?.goodKey ?? null, goodStamp: prev?.goodStamp ?? null, at: new Date().toISOString() };
    if (adoptCached(slot.key, [workspaceCache(this.app.config.root)], store)) {
      this.cancel(id);
      if (prev?.phase !== "ok" || prev.key !== slot.key) this.setState(store, slot.slide, slot.slot, { ...base, goodKey: slot.key, goodStamp: slot.stamp, phase: "ok", record: prev?.key === slot.key ? prev.record : null });
      return;
    }
    const runtime = resolveRuntime(hook, this.app.config.runtimes);
    if (!runtime.ok) {
      this.setState(store, slot.slide, slot.slot, { ...base, phase: "failed", record: { ...this.emptyRecord(slot), status: "runtime", detail: runtime.runtime } });
      return;
    }
    const running = this.running.get(id);
    if (running?.job.key === slot.key || this.queued.get(id)?.job.key === slot.key) return;
    if (running) this.cancel(id);
    const rollout = isRollout(store, slot, prev);
    const job: Job = { ...slot, priority: this.presence.priority(slot.deck, slot.slide), enqueuedAt: Date.now(), attempt: 0, rollout };
    this.queued.set(id, { job, hook });
    this.setState(store, slot.slide, slot.slot, { ...base, phase: this.waitingPhase(job, prev), record: prev?.key === slot.key ? prev.record : null });
  }

  private waitingPhase(job: Job, prev: SlotState | undefined): SlotPhase {
    if (this.ledger.paused(job.stamp)) return "paused";
    if (job.rollout && this.ledger.rollout(job.stamp).phase === "failed") return prev?.goodKey ? "stale" : "failed";
    return "waiting";
  }

  /** Whether a rollout job must wait: its version has not passed a canary yet, or failed one. */
  private rolloutBlocked(job: Job): boolean {
    return !!job.rollout && this.ledger.rollout(job.stamp).phase !== "rolling";
  }

  private emptyRecord(slot: { key: string; kind: Job["kind"]; hook: string; stamp: string; deck: string; slide: string; slot: string; inputs: unknown }): Omit<RunRecord, "status"> {
    return { key: slot.key, kind: slot.kind, hook: slot.hook, stamp: slot.stamp, deck: slot.deck, slide: slot.slide, slot: slot.slot, inputs: slot.inputs, exit: null, seconds: 0, stderrTail: "", warnings: [], at: new Date().toISOString() };
  }

  /** Stop a slot's queued or running job (latest wins; not a failure). */
  private cancel(id: string): void {
    this.queued.delete(id);
    this.running.get(id)?.controller.abort();
  }

  /** Start whatever the caps, priorities, breaker and rollouts allow. */
  pump(): void {
    const queued = [...this.queued.values()].map((q) => q.job);
    for (const job of queued) job.priority = this.presence.priority(job.deck, job.slide);
    const running = [...this.running.values()].map((r) => r.job);
    const paused = new Set(queued.filter((j) => this.ledger.paused(j.stamp)).map((j) => j.stamp));
    const caps = { global: this.app.config.concurrency, perHook: this.app.config.perHook };
    const starts = nextJobs(queued.filter((j) => !this.rolloutBlocked(j)), running, caps, paused);
    const waitingCanary = new Set(queued.filter((j) => j.rollout && !paused.has(j.stamp) && this.ledger.rollout(j.stamp).phase === "canary").map((j) => j.stamp));
    for (const stamp of waitingCanary) {
      if (running.length + starts.length >= caps.global) break;
      const canary = queued.filter((j) => j.stamp === stamp && j.rollout).sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt)[0]!;
      this.ledger.canaryStarted(stamp, canary.key);
      starts.push(canary);
    }
    for (const job of starts) void this.startJob(job);
  }

  private async startJob(job: Job): Promise<void> {
    const id = `${job.deck}/${job.slide}/${job.slot}`;
    const entry = this.queued.get(id);
    const store = this.app.workspace.decks.get(job.deck);
    if (!entry || entry.job.key !== job.key || !store) return;
    this.queued.delete(id);
    const controller = new AbortController();
    this.running.set(id, { job, hook: entry.hook, controller });
    const prev = readSlideState(store, job.slide)[job.slot];
    if (prev) this.setState(store, job.slide, job.slot, { ...prev, phase: "drawing" }, true);
    const runtime = resolveRuntime(entry.hook, this.app.config.runtimes);
    const exe = runtime.ok ? runtime.exe : null;
    const unmet = exe ? await unmetRequirement(exe, entry.hook.requires) : null;
    const options = { store, job, hook: entry.hook, exe, signal: controller.signal, memoryMb: this.memoryMb };
    let record: RunRecord;
    try {
      record = entry.hook.mode === "warm" && exe ? await this.warm.run(options) : await runSpawn(options);
    } catch (error) {
      record = { ...this.emptyRecord(job), status: "error", detail: (error as Error).message };
    }
    if (unmet && record.status !== "ok") record = { ...record, status: "requirement", detail: unmet, interpreter: exe! };
    this.finish(store, job, entry.hook, record);
  }

  private finish(store: DeckStore, job: Job, hook: LoadedHook, record: RunRecord): void {
    const id = `${job.deck}/${job.slide}/${job.slot}`;
    if (this.running.get(id)?.job === job) this.running.delete(id);
    logHook(store, { ...record, attempt: job.attempt });
    if (record.status === "cancelled") return this.pump();
    if (isTransient(record.status) && job.attempt === 0 && !this.queued.has(id)) {
      this.queued.set(id, { job: { ...job, attempt: 1, enqueuedAt: Date.now() }, hook });
      return this.pump();
    }
    const ok = record.status === "ok";
    this.ledger.record(job.stamp, job.key, ok, ok ? undefined : record.status);
    if (!ok) this.recent.push(record), this.recent.splice(0, Math.max(0, this.recent.length - 50));
    const prev = readSlideState(store, job.slide)[job.slot];
    const base = { key: job.key, hook: job.hook, stamp: job.stamp, record, at: record.at };
    if (ok) this.setState(store, job.slide, job.slot, { ...base, goodKey: job.key, goodStamp: job.stamp, phase: "ok" });
    else this.setState(store, job.slide, job.slot, { ...base, goodKey: prev?.goodKey ?? null, goodStamp: prev?.goodStamp ?? null, phase: this.ledger.paused(job.stamp) ? "paused" : job.rollout && this.ledger.rollout(job.stamp).phase === "failed" && prev?.goodKey ? "stale" : "failed" });
    if (!ok) this.markBlocked(job.stamp);
    this.app.publishWarnings(store, job.slide, null);
    this.pump();
  }

  /** After a pause or a failed canary, every waiting slot of that version says so. */
  private markBlocked(stamp: string): void {
    for (const { job } of this.queued.values()) {
      if (job.stamp !== stamp) continue;
      const store = this.app.workspace.decks.get(job.deck);
      const prev = store ? readSlideState(store, job.slide)[job.slot] : undefined;
      const phase = this.waitingPhase(job, prev);
      if (store && prev && phase !== prev.phase) {
        this.setState(store, job.slide, job.slot, { ...prev, phase });
        this.app.publishWarnings(store, job.slide, null);
      }
    }
  }

  /** Persist a slot's state and tell the browsers. */
  private setState(store: DeckStore, slide: string, slot: string, state: SlotState, reading = false): void {
    writeSlotState(store, slide, slot, state);
    const message = state.record && state.record.status !== "ok" ? `${state.record.status}${state.record.detail ? `: ${state.record.detail}` : ""}` : undefined;
    const data = { slide, slot, ...slotView(store, state), message };
    if (reading) this.app.hub.publish(store.token, "hook", data, "reading", `${slide}/${slot}`);
    else this.app.emit(store.token, "hook", data);
  }

  /**
   * Re-arm a paused or failed hook and queue its slots again.
   *
   * @param hook - the hook name.
   * @returns the versions re-armed.
   */
  resume(hook: string): string[] {
    const stamps = this.ledger.resume(hook);
    for (const store of this.app.workspace.decks.values()) for (const id of store.slideIds()) this.reconcile(store, id);
    return stamps;
  }

  /** What `folio queue` shows. */
  snapshot() {
    const view = (j: Job, state: string) => ({ state, deck: j.deck, slide: j.slide, slot: j.slot, hook: j.hook, stamp: j.stamp, priority: j.priority, ageSeconds: Math.round((Date.now() - j.enqueuedAt) / 1000), attempt: j.attempt });
    return {
      running: [...this.running.values()].map((r) => view(r.job, "running")),
      queued: [...this.queued.values()].map((q) => view(q.job, this.ledger.paused(q.job.stamp) ? "paused" : "queued")),
      paused: this.ledger.pausedStamps(),
      failedRollouts: this.ledger.failedRollouts(),
      failed: this.recent.slice(-20).map((r) => ({ deck: r.deck, slide: r.slide, slot: r.slot, hook: r.hook, status: r.status, at: r.at, error: (r.detail ?? r.stderrTail).slice(-300) })),
    };
  }

  /**
   * Wait until a deck has no queued or running job.
   *
   * @param token - the deck.
   * @param timeoutMs - how long to wait.
   * @returns slot ids still pending when the wait ended (empty when idle).
   */
  async idle(token: string, timeoutMs: number): Promise<string[]> {
    const until = Date.now() + timeoutMs;
    for (;;) {
      const pending = [...this.queued.values()].filter((q) => q.job.deck === token && !this.ledger.paused(q.job.stamp) && !(q.job.rollout && this.ledger.rollout(q.job.stamp).phase === "failed")).map((q) => q.job);
      const busy = [...[...this.running.values()].map((r) => r.job).filter((j) => j.deck === token), ...pending];
      if (!busy.length || Date.now() > until) return busy.map((j) => `${j.slide}/${j.slot}`);
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /** Stop every job and warm worker. */
  close(): void {
    void this.slideWatcher?.close();
    for (const t of this.timers.values()) clearTimeout(t);
    for (const r of this.running.values()) r.controller.abort();
    this.warm.close();
  }
}
