/**
 * The layout cards: one live preview per layout of the deck's pack; pressing a
 * card inserts a slide of that layout after the current one and selects it.
 * A card shows only its preview and its layout name; usage notes are for agents.
 * Another pack's layouts show as the same previews, not pressable.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Pack } from "@folio/core";
import { makeSlideSpec, textSlots } from "@folio/core";
import { api } from "../api";
import type { FigureState, SlideEnv } from "../slide/env";
import { PX_PER_PT } from "../slide/measure";
import { SlideView } from "../slide/SlideView";
import { cn } from "../ui/cn";
import type { DeckState, DeckStore } from "./deckState";

/**
 * A figure slot's stand-in: a dashed box carrying the slot's name.
 *
 * @param name - the slot name.
 * @returns the figure state with an SVG data URL.
 */
function sampleFigure(name: string): FigureState {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300" viewBox="0 0 400 300" preserveAspectRatio="none"><rect x="2" y="2" width="396" height="296" fill="#f4f4f3" stroke="#9a9a9a" stroke-width="4" stroke-dasharray="14 10"/><text x="200" y="165" font-family="monospace" font-size="44" fill="#616161" text-anchor="middle">${name}</text></svg>`;
  return { url: `data:image/svg+xml,${encodeURIComponent(svg)}`, state: "ok" };
}

/**
 * Sample props for a layout: every text slot holds its own name.
 *
 * @returns props keyed by slot name.
 */
function sampleProps(pack: Pack, layout: string): Record<string, unknown> {
  const l = pack.layouts[layout];
  return l ? Object.fromEntries(textSlots(pack, l).map((t) => [t.name, t.name])) : {};
}

/** The width of an element, kept current as it resizes. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(e!.contentRect.width));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

/**
 * A live preview of a layout at the pack's aspect ratio, each text slot
 * holding its own name and each figure slot a dashed box.
 */
export function LayoutPreview({ pack, layout, className }: { pack: Pack; layout: string; className?: string }) {
  const { ref, width } = useWidth<HTMLSpanElement>();
  const spec = useMemo(() => makeSlideSpec(layout, sampleProps(pack, layout)), [pack, layout]);
  const env = useMemo<SlideEnv>(() => ({ pack, slideId: `layout-${pack.name}-${layout}`, mode: "thumb", overflow: {}, limits: {}, selectedSlot: null, figure: (slot) => sampleFigure(slot) }), [pack, layout]);
  return (
    <span ref={ref} className={cn("relative block w-full overflow-hidden bg-white outline outline-1 outline-line transition-[outline-color] duration-[120ms]", className)} style={{ aspectRatio: `${pack.canvas.w} / ${pack.canvas.h}` }}>
      {width > 0 ? <SlideView spec={spec} scale={width / (pack.canvas.w * PX_PER_PT)} env={env} /> : null}
    </span>
  );
}

const CARD = "grid min-w-0 content-start gap-1.5 rounded-card p-1.5 text-left";
const CARD_NAME = "num truncate px-0.5 text-[11px] text-ink-muted";

/** One card: the preview and the layout name. */
function LayoutCard({ pack, layout, busy, onInsert }: { pack: Pack; layout: string; busy: boolean; onInsert: () => void }) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={onInsert}
      aria-label={`Insert ${layout} slide`}
      className={cn(CARD, "group transition-colors duration-[120ms] hover:bg-whisper focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ink active:bg-ash disabled:opacity-40")}
    >
      <LayoutPreview pack={pack} layout={layout} className="group-hover:outline-line-strong" />
      <span className={cn(CARD_NAME, "group-hover:text-ink")}>{layout}</span>
    </button>
  );
}

/** The layouts of a pack the deck does not use: previews only, nothing to press. */
export function LayoutGallery({ pack }: { pack: Pack }) {
  return (
    <ul className="-mx-1.5 grid grid-cols-2 gap-1" aria-label={`${pack.name} layouts`}>
      {Object.keys(pack.layouts).map((l) => (
        <li key={l} className={CARD} data-layout-preview={l}>
          <LayoutPreview pack={pack} layout={l} />
          <span className={CARD_NAME}>{l}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The grid of cards.
 *
 * @param props.id - the current slide; a new slide goes right after it.
 */
export function LayoutCards({ store, state, pack, id }: { store: DeckStore; state: DeckState; pack: Pack; id: string }) {
  const [busy, setBusy] = useState(false);
  const insert = (layout: string) => {
    setBusy(true);
    void api
      .newSlide(state.token, layout, id)
      .then((r) => store.set((s) => ({ ...s, current: r.id, selectedSlot: null })))
      .finally(() => setBusy(false));
  };
  return (
    <div className="-mx-1.5 grid grid-cols-2 gap-1">
      {Object.keys(pack.layouts).map((l) => <LayoutCard key={l} pack={pack} layout={l} busy={busy} onInsert={() => insert(l)} />)}
    </div>
  );
}
