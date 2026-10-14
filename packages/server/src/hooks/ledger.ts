/**
 * The queue's memory across restarts: run outcomes per hook version (for the
 * circuit breaker), each version's rollout state, and which versions have ever
 * drawn a figure. One file, written only by the serving process.
 */
import { join } from "node:path";
import { breakerState, rolloutStep, type RolloutState } from "@folio/core";
import { atomicWrite, formatJson, readJson } from "../fsutil.js";

interface LedgerFile {
  history: Record<string, boolean[]>;
  rollout: Record<string, RolloutState>;
  proven: string[];
}

export class Ledger {
  private readonly data: LedgerFile;

  /**
   * @param root - the workspace root; the file is `.folio/queue-state.json`.
   */
  constructor(private readonly root: string) {
    this.data = readJson<LedgerFile>(this.path, { history: {}, rollout: {}, proven: [] });
    for (const [stamp, r] of Object.entries(this.data.rollout)) if (r.phase === "canary-running") this.data.rollout[stamp] = { phase: "canary" };
  }

  private get path(): string {
    return join(this.root, ".folio", "queue-state.json");
  }

  private save(): void {
    atomicWrite(this.path, formatJson(this.data));
  }

  /** Whether a hook version is paused by the circuit breaker. */
  paused(stamp: string): boolean {
    return breakerState(this.data.history[stamp] ?? []).paused;
  }

  /** Consecutive failures of a version. */
  failures(stamp: string): number {
    return breakerState(this.data.history[stamp] ?? []).failures;
  }

  /** Whether a version has drawn at least one figure. */
  proven(stamp: string): boolean {
    return this.data.proven.includes(stamp);
  }

  /**
   * The rollout state of a version.
   *
   * @returns `rolling` for a proven version, else the stored state, `canary`
   *   when the version has not run yet.
   */
  rollout(stamp: string): RolloutState {
    if (this.proven(stamp)) return { phase: "rolling" };
    return this.data.rollout[stamp] ?? { phase: "canary" };
  }

  /** Record that a version's canary started. */
  canaryStarted(stamp: string, key: string): void {
    this.data.rollout[stamp] = rolloutStep(this.rollout(stamp), { type: "start", key });
    this.save();
  }

  /**
   * Record the outcome of a run that counts.
   *
   * @param stamp - the version.
   * @param key - the job's key (to match a canary).
   * @param ok - whether it drew a good figure.
   * @param reason - why it failed.
   */
  record(stamp: string, key: string, ok: boolean, reason?: string): void {
    this.data.history[stamp] = [...(this.data.history[stamp] ?? []), ok].slice(-20);
    this.data.rollout[stamp] = rolloutStep(this.rollout(stamp), { type: "result", key, ok, ...(reason ? { reason } : {}) });
    if (ok && !this.data.proven.includes(stamp)) this.data.proven.push(stamp);
    this.save();
  }

  /**
   * Re-arm every version of a hook: forget its failures and failed rollouts.
   *
   * @param hook - the hook name.
   * @returns the versions re-armed.
   */
  resume(hook: string): string[] {
    const stamps = [...new Set([...Object.keys(this.data.history), ...Object.keys(this.data.rollout)])].filter((s) => s.startsWith(`${hook}@`));
    for (const s of stamps) {
      delete this.data.history[s];
      if (this.data.rollout[s]?.phase !== "rolling") delete this.data.rollout[s];
    }
    this.save();
    return stamps;
  }

  /** Versions currently paused, with their failure counts. */
  pausedStamps(): { stamp: string; failures: number }[] {
    return Object.keys(this.data.history).filter((s) => this.paused(s)).map((stamp) => ({ stamp, failures: this.failures(stamp) }));
  }

  /** Versions whose canary failed. */
  failedRollouts(): { stamp: string; reason: string }[] {
    return Object.entries(this.data.rollout).flatMap(([stamp, r]) => (r.phase === "failed" ? [{ stamp, reason: r.reason }] : []));
  }
}

/** Where the user and workers are, for the queue's priority order. */
export class Presence {
  private readonly viewed = new Map<string, number>();
  private readonly edits = new Map<string, number>();

  /**
   * @param openDecks - deck tokens open in at least one browser.
   */
  constructor(private readonly openDecks: () => Set<string>) {}

  /** A browser reports the slide it shows (every 20 s while shown). */
  viewing(deck: string, slide: string): void {
    this.viewed.set(`${deck}/${slide}`, Date.now());
  }

  /** A worker or the user wrote a slide. */
  edited(deck: string, slide: string): void {
    this.edits.set(`${deck}/${slide}`, Date.now());
  }

  /**
   * The priority of a slide's hooked slots.
   *
   * @returns 1 for the slide the user is looking at, 2 for a deck open in a
   *   browser, 3 for a slide edited in the last minute, 4 for the rest.
   */
  priority(deck: string, slide: string): number {
    const now = Date.now();
    if (now - (this.viewed.get(`${deck}/${slide}`) ?? 0) < 45_000) return 1;
    if (this.openDecks().has(deck)) return 2;
    if (now - (this.edits.get(`${deck}/${slide}`) ?? 0) < 60_000) return 3;
    return 4;
  }
}
