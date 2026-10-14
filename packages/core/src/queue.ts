/**
 * The hook queue, pure part. The queue is derived, not stored: the desired state
 * is "every hooked slot has a figure for its current inputs", and the jobs are
 * whatever is missing. These functions choose what runs next, when a hook is
 * paused, and how a new hook version rolls out.
 */

import type { HookKind } from "./hookdef.js";

/** A hooked slot as found in the slides. `inputs` is what the slot received. */
export interface HookSlot {
  deck: string;
  slide: string;
  slot: string;
  kind: HookKind;
  role: string;
  hook: string;
  stamp: string;
  key: string;
  inputs: unknown;
  box: { w: number; h: number; dpi: number };
}

/** A job: a slot whose figure is missing, with its priority (1 is first). */
export interface Job extends HookSlot {
  priority: number;
  enqueuedAt: number;
  attempt: number;
  /** A re-draw caused only by a new hook version: it waits for that version's canary. */
  rollout?: boolean;
}

export interface Caps {
  global: number;
  perHook: number;
}

/**
 * The slots whose figure is missing from the cache.
 *
 * @param slots - every hooked slot of every deck.
 * @param cached - cache keys present.
 * @returns the slots to draw, one per distinct key per slot.
 */
export function desiredJobs(slots: HookSlot[], cached: Set<string>): HookSlot[] {
  return slots.filter((s) => !cached.has(s.key));
}

/**
 * Choose the jobs to start now.
 *
 * @param queued - waiting jobs.
 * @param running - jobs running now.
 * @param caps - the global and per-hook concurrency caps.
 * @param blocked - hook names (or stamps) that may not start a job: paused
 *   hooks, and hooks whose canary is still running.
 * @returns jobs to start, by priority, round-robin across hooks within a
 *   priority so one hook cannot starve the others.
 */
export function nextJobs(queued: Job[], running: Job[], caps: Caps, blocked: Set<string>): Job[] {
  let free = caps.global - running.length;
  const perHook = new Map<string, number>();
  for (const r of running) perHook.set(r.hook, (perHook.get(r.hook) ?? 0) + 1);
  const busySlots = new Set(running.map((r) => `${r.deck}/${r.slide}/${r.slot}`));
  const out: Job[] = [];
  const byPriority = [...queued].sort((a, b) => a.priority - b.priority || a.enqueuedAt - b.enqueuedAt);
  const priorities = [...new Set(byPriority.map((j) => j.priority))];
  for (const p of priorities) {
    const lanes = new Map<string, Job[]>();
    for (const j of byPriority.filter((j) => j.priority === p)) lanes.set(j.hook, [...(lanes.get(j.hook) ?? []), j]);
    while (free > 0 && [...lanes.values()].some((lane) => lane.length > 0)) {
      for (const [hook, lane] of lanes) {
        const job = lane.shift();
        if (!job || free <= 0) continue;
        const slot = `${job.deck}/${job.slide}/${job.slot}`;
        if (blocked.has(hook) || blocked.has(job.stamp) || busySlots.has(slot) || (perHook.get(hook) ?? 0) >= caps.perHook) continue;
        out.push(job);
        busySlots.add(slot);
        perHook.set(hook, (perHook.get(hook) ?? 0) + 1);
        free -= 1;
      }
    }
  }
  return out;
}

export const BREAKER_LIMIT = 3;

/**
 * Whether a hook version is paused.
 *
 * @param history - outcomes of its runs, oldest first: true for success, false
 *   for a failure that counts (not a cancellation).
 * @returns the number of failures since the last success, and whether that
 *   reaches the limit of 3.
 */
export function breakerState(history: boolean[]): { failures: number; paused: boolean } {
  let failures = 0;
  for (const ok of history) failures = ok ? 0 : failures + 1;
  return { failures, paused: failures >= BREAKER_LIMIT };
}

export type RolloutState = { phase: "canary" } | { phase: "canary-running"; key: string } | { phase: "rolling" } | { phase: "failed"; reason: string };

/**
 * Advance the rollout of a new hook version.
 *
 * @param state - the stamp's current rollout state.
 * @param event - a canary started, or a run of this stamp ended.
 * @returns the next state: a successful canary opens the rollout, a failed
 *   canary stops it (old figures stay, marked stale).
 */
export function rolloutStep(state: RolloutState, event: { type: "start"; key: string } | { type: "result"; key: string; ok: boolean; reason?: string }): RolloutState {
  if (event.type === "start") return state.phase === "canary" ? { phase: "canary-running", key: event.key } : state;
  if (state.phase === "canary-running" && state.key === event.key) {
    return event.ok ? { phase: "rolling" } : { phase: "failed", reason: event.reason ?? "canary failed" };
  }
  return state;
}

/**
 * Whether a run outcome is transient, worth one automatic retry.
 *
 * @param status - the run record's status.
 * @returns true only for a timeout or a signal kill.
 */
export function isTransient(status: string): boolean {
  return status === "timeout" || status === "signal";
}
