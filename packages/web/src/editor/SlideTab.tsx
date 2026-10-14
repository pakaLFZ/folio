/**
 * The Slide tab: the template manager whose layout cards insert a slide
 * after the current one. Duplicate, copy, paste and archive live on the
 * rail; the background belongs to the deck's template. A slide's overrides
 * of its template are set and reset through `folio override` and the HTTP
 * overrides route, not this tab (spec/slides/overrides.md). A figure's or
 * table's provenance is read with `folio trace`, not shown here
 * (spec/hooks/provenance.md).
 */
import type { Pack } from "@folio/core";
import { Button } from "../ui/button";
import type { DeckState, DeckStore } from "./deckState";
import { TemplateManager } from "./TemplateManager";

/** A titled block separated from the next by air. */
export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-1.5 py-[var(--section-pad)]">
      <div className="flex items-center justify-between">
        <h3 className="section-title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The conflict card: both versions, and a choice. */
function ConflictCard({ store, state, id }: { store: DeckStore; state: DeckState; id: string }) {
  const c = state.conflicts[id];
  if (!c) return null;
  const theirs = c.theirs.spec?.elements[c.theirs.spec.root]?.props[c.slot];
  return (
    <div className="space-y-2 rounded-card border border-danger/40 p-2.5">
      <p className="text-[12px] text-danger">Slot {c.slot} was changed elsewhere while you typed.</p>
      <p className="section-title">Yours</p>
      <p className="whitespace-pre-wrap text-[12px]">{(typeof c.mine === "string" ? c.mine : (c.mine as { code?: string } | null)?.code) || "(empty)"}</p>
      <p className="section-title">Now on disk</p>
      <p className="whitespace-pre-wrap text-[12px]">{typeof theirs === "string" ? theirs : "(empty)"}</p>
      <div className="flex gap-1.5">
        <Button variant="outline" size="sm" onClick={() => void store.resolveConflict(id, "mine")}>Keep mine</Button>
        <Button size="sm" onClick={() => void store.resolveConflict(id, "theirs")}>Keep theirs</Button>
      </div>
    </div>
  );
}

/**
 * The tab.
 *
 * @param props.pack - the deck's pack.
 */
export function SlideTab({ store, state, pack }: { store: DeckStore; state: DeckState; pack: Pack }) {
  const id = state.current;
  const record = id ? state.slides[id] : undefined;
  if (!id || !record) return <p className="py-4 text-ink-faint">No slide selected.</p>;
  return (
    <div className="divide-y divide-line-soft">
      <ConflictCard store={store} state={state} id={id} />
      {record.error ? <p className="py-2 text-[12px] text-danger">{record.error}</p> : null}
      <TemplateManager store={store} state={state} pack={pack} id={id} />
    </div>
  );
}
