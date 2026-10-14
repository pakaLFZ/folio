/**
 * The scene: the current slide, fitted to the space between the floating
 * rail and panel, and zoomed and panned from there (spec/chrome/zoom.md). The
 * canvas is scaled as one piece; it is never re-laid-out by the zoom.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Pack } from "@folio/core";
import { SlideView } from "../slide/SlideView";
import { PX_PER_PT } from "../slide/measure";
import { ColumnScene, columnPitch } from "./ColumnScene";
import type { DeckState, DeckStore } from "./deckState";
import { slideEnv, type FigureResolver } from "./slideEnv";
import { useZoom, type Zoom } from "./useZoom";
import { columnIndexAt } from "./zoom";

const PAD = 28;
const TOP_ROW = 44;

/**
 * Follow an element's size.
 *
 * @returns a ref to attach and the element's current content size.
 */
export function useSize<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([entry]) => setSize({ w: entry!.contentRect.width, h: entry!.contentRect.height }));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return { ref, size };
}

/**
 * Render the current slide. The scene's padding is the room the rail, the
 * panel and the top row take; the slide is centred in what is left at fit,
 * and at fit or above, `useZoom`'s own pan offset (not the scene's native
 * scroll) translates it freely in both x and y.
 *
 * @param props.insetLeft - room taken by the rail, in px.
 * @param props.insetRight - room taken by the panel, in px.
 * @param props.overlay - drawn over the slide in canvas coordinates.
 * @param props.cursor - the chosen tool's pointer, for the column's slides.
 * @param props.onZoom - the zoom's current value and reset, lifted to the top
 *   row's zoom chip (chrome.tsx) since it floats outside the scene.
 */
export function Scene({ store, state, pack, figure, insetLeft, insetRight, insetBottom, overlay, cursor, onZoom }: { store: DeckStore; state: DeckState; pack: Pack; figure: FigureResolver; insetLeft: number; insetRight: number; insetBottom: number; overlay?: ReactNode; cursor?: string; onZoom?: (zoom: Zoom) => void }) {
  const { ref, size } = useSize<HTMLElement>();
  const sheet = useRef<HTMLDivElement>(null);
  const column = useRef<HTMLDivElement>(null);
  const zoomNow = useRef(1);
  const id = state.current;
  const record = id ? state.slides[id] : undefined;
  const fit = Math.min(Math.max(40, size.w) / (pack.canvas.w * PX_PER_PT), Math.max(40, size.h) / (pack.canvas.h * PX_PER_PT));
  // Below 100%, keep `current` the slide under the pointer while ctrl+wheel zooms, so it is
  // already right once the zoom crosses up to 100% and the single-slide view takes over.
  const onColumnHover = useCallback(
    (clientY: number) => {
      const el = column.current;
      if (!el || !state.manifest.length) return;
      const idx = columnIndexAt(el.scrollTop, clientY - el.getBoundingClientRect().top, columnPitch(pack, fit * zoomNow.current), state.manifest.length);
      const next = state.manifest[idx]?.id;
      if (next && next !== state.current) store.set((s) => ({ ...s, current: next }));
    },
    [pack, fit, state.manifest, state.current, store],
  );
  // The slide switching (rail, keys, inbox) never resets zoom or pan on its own; only the
  // free scene's own size changing does (spec/chrome/zoom.md, "What resets").
  const z = useZoom(ref, sheet, `${fit}`, onColumnHover);
  const { zoom, pan, reset, grabbing } = z;
  useEffect(() => {
    zoomNow.current = zoom;
  }, [zoom]);
  useEffect(() => onZoom?.(z), [zoom, reset, onZoom]);
  const room = { paddingLeft: insetLeft + PAD, paddingRight: insetRight + PAD, paddingTop: PAD + TOP_ROW, paddingBottom: insetBottom + PAD };
  const columnMode = zoom < 1;
  return (
    <main ref={ref} className="fixed inset-0 z-[0] flex overflow-hidden" style={room} data-pan-x={pan.x} data-pan-y={pan.y} onClick={(e) => e.target === e.currentTarget && store.set((s) => ({ ...s, selectedSlot: null }))} onDoubleClick={(e) => e.target === e.currentTarget && reset()}>
      {columnMode ? (
        state.manifest.length ? (
          <ColumnScene store={store} state={state} pack={pack} figure={figure} scale={fit * zoom} cursor={cursor} overlay={overlay} containerRef={column} />
        ) : (
          <p className="m-auto text-ink-faint">This deck has no slides yet. Agents add them with folio new.</p>
        )
      ) : id && record ? (
        <div ref={sheet} className="m-auto flex-none bg-paper shadow-[var(--sheet-lift)] outline outline-1 outline-line" style={{ transform: `translate(${-pan.x}px, ${-pan.y}px)` }}>
          <SlideView spec={state.preview?.id === id ? state.preview.spec : record.spec} error={record.error} scale={fit * zoom} env={slideEnv(store, state, pack, id, state.mode, figure)} overlay={overlay} />
        </div>
      ) : (
        <p className="m-auto text-ink-faint">{state.manifest.length ? "Loading slide" : "This deck has no slides yet. Agents add them with folio new."}</p>
      )}
      {grabbing ? <div data-pan-hand={grabbing} className="fixed inset-0" style={{ cursor: grabbing, zIndex: "var(--z-overlay)" }} /> : null}
    </main>
  );
}
