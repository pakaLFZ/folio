/**
 * What each open editor tab shows, in memory only. A tab's report goes when the
 * tab says it closed, when no open stream carries its deck any more, or after
 * `VIEWING_TTL_MS` without a report. Every change that an agent would see moves
 * the version, and `wait` resolves on the next one.
 */
import { sameView, type ViewingReport } from "@folio/core";

export const VIEWING_TTL_MS = 75_000;

export interface ViewingEntry extends ViewingReport {
  seenAt: number;
  activeAt: number;
}

export class ViewingRegistry {
  private readonly tabs = new Map<string, ViewingEntry>();
  private readonly waiters = new Set<() => void>();
  version = 0;

  /**
   * Take a tab's report.
   *
   * @param report - what the tab shows.
   * @param now - the time in ms.
   */
  report(report: ViewingReport, now = Date.now()): void {
    const before = this.tabs.get(report.tab);
    const changed = !before || !sameView(before, report);
    const activeAt = changed || report.focused ? now : before.activeAt;
    this.tabs.set(report.tab, { ...report, seenAt: now, activeAt });
    if (changed) this.bump();
  }

  /** Forget a tab that has closed. */
  close(tab: string): void {
    if (this.tabs.delete(tab)) this.bump();
  }

  /**
   * Forget every tab whose deck no open stream carries any more.
   *
   * @param streamed - whether some open stream still carries a deck.
   */
  keepStreamed(streamed: (token: string) => boolean): void {
    let dropped = false;
    for (const [tab, entry] of this.tabs) if (!streamed(entry.token)) dropped = this.tabs.delete(tab) || dropped;
    if (dropped) this.bump();
  }

  /**
   * The live tabs, after dropping those silent for longer than the TTL.
   *
   * @param now - the time in ms.
   * @returns the entries, unordered.
   */
  list(now = Date.now()): ViewingEntry[] {
    let expired = false;
    for (const [tab, entry] of this.tabs) if (now - entry.seenAt > VIEWING_TTL_MS) expired = this.tabs.delete(tab) || expired;
    if (expired) this.bump();
    return [...this.tabs.values()];
  }

  /**
   * Resolve when the version moves past `since`, or after `ms`. A tab that
   * falls silent past the TTL counts as a move, checked every few seconds.
   *
   * @returns true when it moved.
   */
  wait(since: number, ms: number): Promise<boolean> {
    if (this.version !== since) return Promise.resolve(true);
    return new Promise((resolve) => {
      const done = () => {
        clearInterval(sweep);
        clearTimeout(timer);
        this.waiters.delete(done);
        resolve(this.version !== since);
      };
      const sweep = setInterval(() => this.list(), 5_000);
      const timer = setTimeout(done, ms);
      this.waiters.add(done);
    });
  }

  /** Release every waiter (the server is closing). */
  closeAll(): void {
    for (const wake of [...this.waiters]) wake();
  }

  private bump(): void {
    this.version += 1;
    for (const wake of [...this.waiters]) wake();
  }
}
