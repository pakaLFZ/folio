/**
 * Below 100% zoom the scene shows every slide of the deck stacked in one
 * scrollable column, the way Edge's PDF viewer shows pages below fit
 * (spec/chrome/zoom.md, 2026-10-13): the wheel scrolls through it and the
 * slide most in view becomes `current`, the same `current` the rail and the
 * keyboard drive, so the column scrolls to meet them. Only slides near the
 * viewport are drawn with their real content; the rest are same-size
 * placeholders, the windowing `Rail.tsx` already uses for its thumbnails, so
 * a long deck never mounts more than a window's worth of slides at once.
 * The `current` slide is live, drawn in the editor's mode with the scene's
 * overlay (comment tools, shapes), so every tool works on it as on the single
 * slide; the others render in "thumb" mode: read-only, unselectable, and never
 * a source of overflow measurement, so scrolling the column never triggers a
 * re-measure. A click on one makes it `current` where it sits.
 */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import type { Pack } from "@folio/core";
import { SlideView } from "../slide/SlideView";
import { PX_PER_PT } from "../slide/measure";
import type { DeckState, DeckStore } from "./deckState";
import { slideEnv, type FigureResolver } from "./slideEnv";

const GAP = 16;
const REACH_SCREENS = 1;

/** One slide's height in the column, including its trailing gap, at `scale` (`fit * zoom`). */
export function columnPitch(pack: Pack, scale: number): number {
  return pack.canvas.h * PX_PER_PT * scale + GAP;
}

/** One slide, drawn with its real content; the window around it decides whether it is mounted at all (a placeholder stands in otherwise). */
function Slot({ store, state, pack, figure, id, width, height, cursor, overlay }: { store: DeckStore; state: DeckState; pack: Pack; figure: FigureResolver; id: string; width: number; height: number; cursor?: string; overlay?: ReactNode }) {
  const record = state.slides[id];
  const live = state.current === id;
  useEffect(() => void store.ensure(id), [id, store]);
  return (
    <div data-column-slide={id} data-current={live || undefined} className={`mx-auto flex-none bg-paper shadow-[var(--sheet-lift)] outline outline-1 outline-line${live ? "" : " select-none"}`} style={{ width, height, marginBottom: GAP, cursor: live ? undefined : (cursor ?? "default") }} onClick={() => live || store.set((s) => ({ ...s, current: id }))}>
      {record ? <SlideView spec={live && state.preview?.id === id ? state.preview.spec : record.spec} error={record.error} scale={width / (pack.canvas.w * PX_PER_PT)} env={slideEnv(store, state, pack, id, live ? state.mode : "thumb", figure)} overlay={live ? overlay : undefined} /> : null}
    </div>
  );
}

/**
 * The slides near the scrolled window, like `Rail.tsx`'s `useWindow`: the
 * first and last index within `REACH_SCREENS` screens of the viewport, kept
 * only while they change, and the index most centred, which becomes `current`
 * when the user scrolls. A `current` set from outside (rail, keys, a click)
 * that is not wholly in view scrolls the column to centre it; the offset the
 * column is left at is pinned either way, so neither that scroll nor a clamped
 * one at either end of the deck (where a slide cannot reach the middle) hands
 * `current` to a neighbour.
 */
function useColumnWindow(container: RefObject<HTMLDivElement | null>, ids: string[], pitch: number, height: number, current: string | null, onCurrent: (id: string) => void) {
  const [range, setRange] = useState({ first: 0, last: -1 });
  const pinned = useRef<number | null>(null);
  const latest = useRef({ ids, current, onCurrent });
  latest.current = { ids, current, onCurrent };
  const count = ids.length;
  const middle = (el: HTMLDivElement) => Math.min(count - 1, Math.max(0, Math.round((el.scrollTop + el.clientHeight / 2 - height / 2) / pitch)));
  const idx = ids.indexOf(current ?? "");
  useLayoutEffect(() => {
    const el = container.current;
    if (!el || idx < 0) return;
    if (middle(el) === idx && pinned.current === null) return;
    const top = idx * pitch - el.scrollTop;
    if (top < 0 || top + height > el.clientHeight) el.scrollTop = idx * pitch + height / 2 - el.clientHeight / 2;
    pinned.current = el.scrollTop;
  }, [idx, container, pitch, height]);
  useLayoutEffect(() => {
    const el = container.current;
    if (!el || !count) return;
    const read = () => {
      const reach = el.clientHeight * REACH_SCREENS;
      const first = Math.max(0, Math.floor((el.scrollTop - reach) / pitch));
      const last = Math.min(count - 1, Math.ceil((el.scrollTop + el.clientHeight + reach) / pitch));
      setRange((r) => (r.first === first && r.last === last ? r : { first, last }));
      if (pinned.current !== null && Math.abs(el.scrollTop - pinned.current) < 1) return;
      pinned.current = null;
      const { ids, current, onCurrent } = latest.current;
      const id = ids[middle(el)];
      if (id && id !== current) onCurrent(id);
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    el.addEventListener("scroll", read, { passive: true });
    return () => (ro.disconnect(), el.removeEventListener("scroll", read));
  }, [container, count, pitch, height]);
  return range;
}

/**
 * The column. `scale` is `fit * zoom`, under 1 by construction (Scene.tsx
 * only mounts this below 100%).
 *
 * @param containerRef - exposed so Scene.tsx can read `scrollTop` from it
 *   when picking the slide under the pointer on a ctrl+wheel step.
 */
export function ColumnScene({ store, state, pack, figure, scale, cursor, overlay, containerRef }: { store: DeckStore; state: DeckState; pack: Pack; figure: FigureResolver; scale: number; cursor?: string; overlay?: ReactNode; containerRef: RefObject<HTMLDivElement | null> }) {
  const width = pack.canvas.w * PX_PER_PT * scale;
  const height = pack.canvas.h * PX_PER_PT * scale;
  const pitch = columnPitch(pack, scale);
  const ids = state.manifest.map((m) => m.id);
  const onCurrent = (id: string) => store.set((s) => ({ ...s, current: id }));
  const range = useColumnWindow(containerRef, ids, pitch, height, state.current, onCurrent);
  return (
    <div ref={containerRef} className="size-full overflow-y-auto overflow-x-hidden" data-column-scene>
      {ids.map((id, i) =>
        i < range.first || i > range.last ? (
          <div key={id} className="mx-auto" style={{ width, height, marginBottom: GAP }} />
        ) : (
          <Slot key={id} store={store} state={state} pack={pack} figure={figure} id={id} width={width} height={height} cursor={cursor} overlay={overlay} />
        ),
      )}
    </div>
  );
}
