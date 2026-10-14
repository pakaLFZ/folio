/**
 * The template manager: the Slide tab's collapsible sections. The template
 * bank lists every pack in the workspace; Templates shows the layouts of the
 * group selected there. Only the deck's own pack inserts slides; choosing a
 * group never changes the deck. The Vocabulary bank (closed by default) shows
 * and edits the deck's words (VocabularyBank.tsx).
 */
import { Check, ChevronRight } from "lucide-react";
import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { Pack } from "@folio/core";
import { api } from "../api";
import { installPackFonts } from "../slide/fonts";
import { cn } from "../ui/cn";
import type { DeckState, DeckStore } from "./deckState";
import { LayoutCards, LayoutGallery, LayoutPreview } from "./LayoutCards";
import { VocabularyBank } from "./VocabularyBank";

const OPEN_KEY = "folio.templateManager";
type SectionKey = "bank" | "templates" | "vocab";
type OpenSections = Record<SectionKey, boolean>;

function storedOpen(): OpenSections {
  try {
    return { bank: true, templates: true, vocab: false, ...JSON.parse(localStorage.getItem(OPEN_KEY) ?? "{}") };
  } catch {
    return { bank: true, templates: true, vocab: false };
  }
}

/** Which sections are open, as this browser last left them; the two template sections open and the vocabulary bank closed by default. */
function useOpenSections(): [OpenSections, (key: SectionKey) => void] {
  const [open, setOpen] = useState(storedOpen);
  const toggle = (key: SectionKey) => {
    const next = { ...open, [key]: !open[key] };
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      return;
    }
  };
  return [open, toggle];
}

/** Every pack in the workspace, the deck's own copy in its place; the deck's pack alone until the list arrives. */
function useGroups(pack: Pack): Pack[] {
  const [listed, setListed] = useState<Pack[] | null>(null);
  useEffect(() => {
    let live = true;
    api.packs().then((r) => live && setListed(r.packs), () => live && setListed(null));
    return () => {
      live = false;
    };
  }, [pack]);
  const all = useMemo(() => {
    const groups = (listed ?? []).map((p) => (p.name === pack.name ? pack : p));
    return groups.some((p) => p.name === pack.name) ? groups : [pack, ...groups];
  }, [listed, pack]);
  useEffect(() => all.forEach((p) => void (p !== pack && installPackFonts(p))), [all, pack]);
  return all;
}

/** A section whose body folds away under its header row. */
function Collapsible({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: ReactNode }) {
  const body = useId();
  return (
    <section>
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={body}
          onClick={onToggle}
          className="-mx-1.5 flex h-7 w-[calc(100%+0.75rem)] items-center gap-1 rounded-control px-1.5 text-left transition-colors duration-[120ms] hover:bg-whisper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink"
        >
          <ChevronRight aria-hidden className={cn("size-3.5 shrink-0 text-ink-faint transition-transform duration-150 ease-[var(--ease)] motion-reduce:transition-none", open && "rotate-90")} />
          <span className="section-title flex-1 truncate">{title}</span>
        </button>
      </h3>
      <div className="grid transition-[grid-template-rows] duration-150 ease-[var(--ease)] motion-reduce:transition-none" style={{ gridTemplateRows: open ? "1fr" : "0fr" }}>
        <div id={body} inert={!open} className={cn("min-h-0 overflow-clip", open && "[overflow-clip-margin:4px]")}>
          <div className="pb-2 pt-1.5">{children}</div>
        </div>
      </div>
    </section>
  );
}

/** One template group: its first layout, its name, and a check when the deck uses it. */
function GroupRow({ group, selected, inUse, onSelect }: { group: Pack; selected: boolean; inUse: boolean; onSelect: () => void }) {
  const first = Object.keys(group.layouts)[0];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn("grid w-full grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-card p-1.5 text-left transition-colors duration-[120ms] hover:bg-whisper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink", selected && "bg-ash hover:bg-ash")}
    >
      {first ? <LayoutPreview pack={group} layout={first} /> : <span />}
      <span className="truncate text-[12px] text-ink">{group.name}</span>
      {inUse ? <span role="img" aria-label="In use" title="In use" className="text-ink"><Check aria-hidden className="size-3.5" /></span> : null}
    </button>
  );
}

/**
 * The sections.
 *
 * @param props.pack - the deck's pack; its layouts insert slides.
 * @param props.id - the current slide; a new slide goes right after it.
 */
export function TemplateManager({ store, state, pack, id }: { store: DeckStore; state: DeckState; pack: Pack; id: string }) {
  const [open, toggle] = useOpenSections();
  const groups = useGroups(pack);
  const [chosen, setChosen] = useState(pack.name);
  const group = groups.find((g) => g.name === chosen) ?? pack;
  const own = group.name === pack.name;
  return (
    <div className="flex flex-col gap-1 pt-[var(--section-pad)]">
      <Collapsible title="Template bank" open={open.bank} onToggle={() => toggle("bank")}>
        <div className="-mx-1.5 space-y-0.5">
          {groups.map((g) => <GroupRow key={g.name} group={g} selected={g.name === group.name} inUse={g.name === pack.name} onSelect={() => setChosen(g.name)} />)}
        </div>
      </Collapsible>
      <Collapsible title="Templates" open={open.templates} onToggle={() => toggle("templates")}>
        {own ? (
          <LayoutCards store={store} state={state} pack={pack} id={id} />
        ) : (
          <div className="space-y-1.5">
            <p className="text-[11px] text-ink-faint">Slides in this deck use {pack.name}; these are previews.</p>
            <LayoutGallery pack={group} />
          </div>
        )}
      </Collapsible>
      <Collapsible title="Vocabulary bank" open={open.vocab} onToggle={() => toggle("vocab")}>
        {open.vocab ? <VocabularyBank token={state.token} /> : null}
      </Collapsible>
    </div>
  );
}
