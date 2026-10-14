/**
 * Dragging slides in the rail, as a sortable list. The dragged thumbnails
 * turn invisible and their slots close up; the others slide apart to open a
 * gap the group's size under the pointer, and that gap is where the slides
 * land. A drag of several slides carries a small "N slides" stack instead of
 * the browser's picture of one thumbnail. Near the rail's top and bottom
 * edges the list scrolls. A drop holds the gap until the server's new order
 * arrives, so the list settles without a jump.
 */
import { useEffect, useRef, useState, type DragEvent, type RefObject } from "react";
import { api } from "../api";
import type { DeckState, DeckStore } from "./deckState";
import { dragSlots, gapLanding, gapUnder, homeGap } from "./railGap";
import { selectedIds } from "./railSelection";
import { slidesLabel } from "./slideCommands";

const EDGE = 48;
const MAX_SCROLL_STEP = 18;
const SETTLE_TIMEOUT_MS = 5000;

/** A drag in progress, or a drop waiting for the server's order. */
export interface RailDrag {
  ids: string[];
  grab: number;
  gap: number;
  settling: boolean;
  order: string;
}

/** The rail's slot grid: the first slot's top and the distance between slots, in list coordinates. */
export function slotGrid(list: HTMLElement): { top: number; pitch: number; height: number } {
  const [a, b] = list.querySelectorAll<HTMLElement>("[data-rail-slide]");
  if (!a) return { top: 0, pitch: 1, height: 1 };
  return { top: a.offsetTop, pitch: b ? b.offsetTop - a.offsetTop : a.offsetHeight, height: a.offsetHeight };
}

/** The slot under a pointer height. */
function slotAt(list: HTMLElement, y: number): number {
  const { top, pitch, height } = slotGrid(list);
  const inList = y - list.getBoundingClientRect().top + list.scrollTop;
  return Math.floor((inList - top + (pitch - height) / 2) / pitch);
}

/** Scroll the list when the pointer is near its top or bottom edge. */
function autoScroll(list: HTMLElement, y: number): void {
  const box = list.getBoundingClientRect();
  const into = y < box.top + EDGE ? -(box.top + EDGE - y) : y > box.bottom - EDGE ? y - (box.bottom - EDGE) : 0;
  if (into) list.scrollTop += Math.sign(into) * Math.ceil((Math.min(Math.abs(into), EDGE) / EDGE) * MAX_SCROLL_STEP);
}

/** A small lifted stack naming how many slides are being dragged, used as the drag image. */
function stackImage(e: DragEvent, count: number): void {
  const chip = document.createElement("div");
  chip.className = "fixed -top-[200px] left-0 flex items-center gap-2 rounded-control border border-line-strong bg-raised py-1.5 pl-2 pr-2.5 text-[12px] text-ink";
  chip.innerHTML = '<span class="relative block h-[18px] w-6"><span class="absolute left-1 top-0 block h-3.5 w-5 rounded-[2px] border border-line-strong bg-paper"></span><span class="absolute left-0 top-1 block h-3.5 w-5 rounded-[2px] border border-ink bg-paper"></span></span>';
  chip.append(slidesLabel(count));
  document.body.append(chip);
  e.dataTransfer.setDragImage(chip, 14, 14);
  setTimeout(() => chip.remove(), 0);
}

const orderKey = (state: DeckState) => state.manifest.map((e) => e.id).join();

/**
 * The rail's drag state and handlers.
 *
 * @param list - the scrolling list that holds the thumbnails.
 * @returns the drag, whether a drop is settling (true through the render
 *   that brings the server's new order), each slide's slot while the drag
 *   lasts (null otherwise), and
 *   handlers for the thumbnails (`start`, `end`) and the list (`listProps`).
 */
export function useRailDrop(store: DeckStore, state: DeckState, list: RefObject<HTMLDivElement | null>) {
  const [drag, setDrag] = useState<RailDrag | null>(null);
  const moving = useRef<string[]>([]);
  const settling = useRef(false);
  const order = state.manifest.map((e) => e.id);
  const current = drag && (!drag.settling || drag.order === orderKey(state)) ? drag : null;
  const slots = current ? dragSlots(order, current.ids, current.gap) : null;
  const end = () => ((moving.current = []), (settling.current = false), setDrag(null));
  useEffect(() => {
    if (drag?.settling && drag.order !== orderKey(state)) end();
  }, [drag, state]);
  useEffect(() => {
    if (!drag?.settling) return;
    const timer = setTimeout(end, SETTLE_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [drag?.settling]);
  const start = (e: DragEvent, id: string) => {
    const chosen = selectedIds(state);
    const ids = chosen.includes(id) ? chosen : [id];
    e.dataTransfer.setData("text/folio-slides", JSON.stringify(ids));
    e.dataTransfer.effectAllowed = "move";
    if (ids.length > 1) stackImage(e, ids.length);
    moving.current = ids;
    const lifted: RailDrag = { ids, grab: ids.indexOf(id), gap: homeGap(order, ids), settling: false, order: orderKey(state) };
    requestAnimationFrame(() => moving.current === ids && setDrag(lifted));
  };
  const gapFor = (y: number, d: RailDrag) => gapUnder(slotAt(list.current!, y), d.grab, order.length, d.ids.length);
  const over = (e: DragEvent) => {
    if (!moving.current.length || !list.current) return;
    e.preventDefault();
    autoScroll(list.current, e.clientY);
    const y = e.clientY;
    setDrag((d) => (d && !d.settling && gapFor(y, d) !== d.gap ? { ...d, gap: gapFor(y, d) } : d));
  };
  const drop = (e: DragEvent) => {
    e.preventDefault();
    const ids = moving.current;
    if (!ids.length || !current || !list.current) return end();
    const gap = gapFor(e.clientY, current);
    const before = gapLanding(order, ids, gap);
    if (before === undefined) return end();
    settling.current = true;
    setDrag({ ...current, gap, settling: true });
    void api.move(state.token, ids, before).catch((error: Error) => (end(), store.notify(`Move failed: ${error.message}`, "error")));
  };
  const enter = (e: DragEvent) => moving.current.length && e.preventDefault();
  const leave = (e: DragEvent) => {
    const box = list.current?.getBoundingClientRect();
    if (!box || (e.clientX > box.left && e.clientX < box.right && e.clientY > box.top && e.clientY < box.bottom)) return;
    setDrag((d) => (d && !d.settling ? { ...d, gap: homeGap(order, d.ids) } : d));
  };
  const dragEnd = () => !settling.current && end();
  return { drag: current, settling: !!drag?.settling, slots, start, end: dragEnd, listProps: { onDragEnter: enter, onDragOver: over, onDrop: drop, onDragLeave: leave } };
}
