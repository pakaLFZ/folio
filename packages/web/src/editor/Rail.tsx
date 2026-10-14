/**
 * The deck rail: every slide as a thumbnail, drawn live only within three
 * slots of the visible window (and, during a drag, of the gap); the rest are
 * same-size empty cards. Click selects one slide, Ctrl/Cmd+click toggles one, Shift+click
 * selects a range; dragging moves the selection, right-click opens the slide
 * menu. A danger dot marks a slide with an active warning; an ink mark at the
 * top-left corner, a slide an open questionnaire points at.
 */
import { useEffect, useLayoutEffect, useRef, useState, type DragEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import type { Pack } from "@folio/core";
import { SlideView } from "../slide/SlideView";
import { PX_PER_PT } from "../slide/measure";
import { cn } from "../ui/cn";
import { paneStyle } from "./chrome";
import type { DeckState, DeckStore } from "./deckState";
import { nearSpan } from "./railGap";
import { slotGrid, useRailDrop } from "./RailDrop";
import { RailMenu } from "./RailMenu";
import { clickSlide, collapseSelection, extendSelection, selectedIds } from "./railSelection";
import { slideEnv, type FigureResolver } from "./slideEnv";

const REACH = 3;

/**
 * The slots the list shows, from the first to the last partly visible one.
 *
 * @returns the window, updated as the list scrolls or resizes.
 */
function useWindow(list: RefObject<HTMLDivElement | null>, count: number) {
  const [view, setView] = useState({ first: 0, last: 0 });
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const read = () => {
      const { top, pitch } = slotGrid(el);
      const first = Math.floor((el.scrollTop - top) / pitch);
      const last = Math.floor((el.scrollTop + el.clientHeight - top) / pitch);
      setView((v) => (v.first === first && v.last === last ? v : { first, last }));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    el.addEventListener("scroll", read, { passive: true });
    return () => (ro.disconnect(), el.removeEventListener("scroll", read));
  }, [list, count]);
  return view;
}

/** How a thumbnail is marked and placed, and what its drag events do. */
interface ThumbMarks {
  selected: boolean;
  multi: boolean;
  lifted: boolean;
  settling: boolean;
  shift: number;
  drawn: boolean;
  onDragStart: (e: DragEvent, id: string) => void;
  onDragEnd: () => void;
}

/** What a click with these modifier keys asks for. */
const clickKind = (e: MouseEvent) => (e.shiftKey ? "range" : e.ctrlKey || e.metaKey ? "toggle" : "one");

/** One thumbnail. */
function Thumb({ store, state, pack, figure, id, index, warn, ask, width, marks }: { store: DeckStore; state: DeckState; pack: Pack; figure: FigureResolver; id: string; index: number; warn: boolean; ask: boolean; width: number; marks: ThumbMarks }) {
  const record = state.slides[id];
  const seen = marks.drawn;
  useEffect(() => {
    if (seen) void store.ensure(id);
  }, [seen, id, store, state.manifest]);
  const scale = width / (pack.canvas.w * PX_PER_PT);
  const current = state.current === id;
  return (
    <button
      draggable
      data-rail-slide={id}
      data-selected={marks.selected || undefined}
      data-lifted={marks.lifted || undefined}
      data-settling={marks.settling || undefined}
      style={marks.shift ? { transform: `translateY(${marks.shift}px)` } : undefined}
      onDragStart={(e) => marks.onDragStart(e, id)}
      onDragEnd={marks.onDragEnd}
      onClick={(e) => store.set((s) => clickSlide(s, id, clickKind(e)))}
      onContextMenu={() => !marks.selected && store.set((s) => clickSlide(s, id, "one"))}
      className={cn(
        "rail-thumb group block shrink-0 rounded-card p-[var(--thumb-pad)] text-left",
        current ? "bg-ash" : "hover:bg-whisper",
        marks.multi && marks.selected && "ring-1 ring-inset ring-ink",
        marks.lifted && "opacity-0",
      )}
      aria-current={current ? "page" : undefined}
      aria-label={`Slide ${index + 1}, ${id}`}
    >
      <span data-thumb className="relative block outline outline-1 outline-line" style={{ width, height: (width * pack.canvas.h) / pack.canvas.w }}>
        {seen && record ? <SlideView spec={record.spec} error={record.error} scale={scale} env={slideEnv(store, state, pack, id, "thumb", figure)} /> : <span data-empty className="block size-full bg-paper" />}
        <span className="num absolute bottom-1 left-1 rounded-chip bg-surface/90 px-1 text-[10px] leading-[14px] text-ink-muted">{index + 1}</span>
        {ask ? <span data-asked className="absolute -left-1 -top-1 size-2 rounded-full bg-ink ring-2 ring-surface" aria-label="has an open question" /> : null}
        {warn ? <span className="absolute -right-1 -top-1 size-2 rounded-full bg-danger ring-2 ring-surface" aria-label="has warnings" /> : null}
      </span>
    </button>
  );
}

/**
 * The rail.
 *
 * @param props.warned - slide ids that carry an active warning.
 * @param props.asked - slide ids an open questionnaire points at.
 * @param props.open - whether the rail is open; a shut rail stays mounted off-screen.
 * @param props.thumbWidth - each thumbnail's width, which follows the rail's.
 */
export function Rail({ store, state, pack, figure, warned, asked, open, thumbWidth }: { store: DeckStore; state: DeckState; pack: Pack; figure: FigureResolver; warned: Set<string>; asked?: Set<string>; open: boolean; thumbWidth: number }) {
  const list = useRef<HTMLDivElement>(null);
  const drop = useRailDrop(store, state, list);
  const view = useWindow(list, state.manifest.length);
  const selected = new Set(selectedIds(state));
  const { drag, slots } = drop;
  const pitch = list.current ? slotGrid(list.current).pitch : 0;
  const marksOf = (id: string, index: number): ThumbMarks => {
    const slot = slots?.get(id) ?? index;
    const nearGap = !drag || nearSpan(slot, drag.gap, drag.gap + drag.ids.length - 1, REACH);
    return {
      selected: selected.has(id),
      multi: selected.size > 1,
      lifted: !!drag && !drag.settling && drag.ids.includes(id),
      settling: drop.settling,
      shift: (slot - index) * pitch,
      drawn: nearGap && nearSpan(slot, view.first, view.last, REACH),
      onDragStart: drop.start,
      onDragEnd: drop.end,
    };
  };
  return (
    <nav aria-label="Slides" aria-hidden={!open} onKeyDown={(e) => railKey(store, e)} className="pane glass bottom-[var(--panel-inset)] left-[var(--panel-inset)] top-[var(--panel-inset)] w-[var(--rail-w)] max-[900px]:z-[25]" style={paneStyle(open, "translateX(calc(-100% - 1.5rem))")}>
      <div className="pane-header" aria-hidden />
      <RailMenu store={store} count={selected.size}>
        <div ref={list} className="rail-list relative flex-1" {...drop.listProps}>
          {state.manifest.map((entry, i) => (
            <Thumb key={entry.id} store={store} state={state} pack={pack} figure={figure} id={entry.id} index={i} warn={warned.has(entry.id)} ask={!!asked?.has(entry.id)} width={thumbWidth} marks={marksOf(entry.id, i)} />
          ))}
        </div>
      </RailMenu>
    </nav>
  );
}

/** Keys that act on the rail's selection while it has focus: Shift+Arrow extends it, Escape collapses it. */
function railKey(store: DeckStore, e: KeyboardEvent): void {
  const step = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
  if (e.shiftKey && step) {
    e.preventDefault();
    e.stopPropagation();
    store.set((s) => extendSelection(s, step));
  } else if (e.key === "Escape" && selectedIds(store.get()).length > 1) {
    e.stopPropagation();
    store.set(collapseSelection);
  }
}
