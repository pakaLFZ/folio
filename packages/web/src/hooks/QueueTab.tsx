/**
 * The Queue tab: hook jobs running, queued, paused and failed, refreshed every
 * two seconds while open. What `folio queue` prints.
 */
import { useEffect, useState } from "react";
import { call } from "../api";
import { Section } from "../editor/SlideTab";
import { Button } from "../ui/button";

interface QueueRow {
  state: string;
  deck: string;
  slide: string;
  slot: string;
  hook: string;
  priority: number;
  ageSeconds: number;
}

export interface QueueSnapshot {
  running: QueueRow[];
  queued: QueueRow[];
  paused: { stamp: string; failures: number }[];
  failedRollouts: { stamp: string; reason: string }[];
  failed: { slide: string; slot: string; hook: string; status: string; at: string; error: string }[];
}

/**
 * Poll the queue.
 *
 * @param every - interval in ms.
 * @returns the latest snapshot, or null before the first.
 */
export function useQueue(every = 2000): QueueSnapshot | null {
  const [snap, setSnap] = useState<QueueSnapshot | null>(null);
  useEffect(() => {
    const load = () => void call<QueueSnapshot>("api/queue").then(setSnap, () => {});
    load();
    const t = setInterval(load, every);
    return () => clearInterval(t);
  }, [every]);
  return snap;
}

/** One job line. */
function Job({ j }: { j: QueueRow }) {
  return (
    <li className="flex items-center gap-2 py-0.5 text-[12px]">
      <span className="num text-ink-muted">{j.slide}/{j.slot}</span>
      <span className="truncate">{j.hook}</span>
      <span className="num ml-auto text-[11px] text-ink-faint">p{j.priority} {j.ageSeconds}s</span>
    </li>
  );
}

/**
 * The tab.
 *
 * @param props.snap - the latest queue snapshot.
 */
export function QueueTab({ snap }: { snap: QueueSnapshot | null }) {
  if (!snap) return <p className="py-3 text-ink-faint">Reading the queue</p>;
  const resume = (stamp: string) => void call("api/queue/resume", { method: "POST", json: { hook: stamp.split("@")[0] } });
  const idle = !snap.running.length && !snap.queued.length && !snap.paused.length && !snap.failedRollouts.length;
  return (
    <div className="divide-y divide-line-soft">
      {idle ? <p className="py-3 text-[12px] text-ink-muted">Every hooked figure is drawn for its current inputs.</p> : null}
      {snap.running.length ? <Section title={`Drawing ${snap.running.length}`}><ul>{snap.running.map((j) => <Job key={`${j.slide}/${j.slot}`} j={j} />)}</ul></Section> : null}
      {snap.queued.length ? <Section title={`Queued ${snap.queued.length}`}><ul>{snap.queued.map((j) => <Job key={`${j.slide}/${j.slot}`} j={j} />)}</ul></Section> : null}
      {[...snap.paused.map((p) => ({ stamp: p.stamp, why: `paused after ${p.failures} failures in a row` })), ...snap.failedRollouts.map((f) => ({ stamp: f.stamp, why: `new version failed its canary (${f.reason}); old figures stay` }))].map((b) => (
        <Section key={b.stamp} title={b.stamp.split(":")[0]!}>
          <p className="text-[12px] text-danger">{b.why}</p>
          <Button size="sm" variant="outline" onClick={() => resume(b.stamp)}>Resume</Button>
        </Section>
      ))}
      {snap.failed.length ? (
        <Section title="Recent failures">
          <ul className="space-y-1">
            {snap.failed.slice().reverse().slice(0, 8).map((f, i) => (
              <li key={i} className="text-[12px]">
                <span className="num text-ink-muted">{f.slide}/{f.slot}</span> {f.hook} <span className="text-danger">{f.status}</span>
                {f.error ? <pre className="num mt-0.5 max-h-20 overflow-auto whitespace-pre-wrap text-[10px] text-ink-faint">{f.error}</pre> : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
