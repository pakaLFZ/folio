/**
 * The pieces of the board's dragging that draw: the lifted card, a card's
 * place in its column (or the gap it leaves), the column's sortable list, and
 * what a screen reader hears.
 */
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type Ref } from "react";
import { useDndContext, type Announcements } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS, getEventCoordinates } from "@dnd-kit/utilities";
import type { InboxRow } from "@folio/core";
import { DURATION, useBoardDrag, type BoardColumn } from "./boardDnd";

const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
const unsorted: SortingStrategy = () => null;

export const INSTRUCTIONS =
  "To move a card, press Space. Arrow keys move it up and down a column and across columns; Space drops it and Escape cancels.";

/** Whether the reader asked for less motion. */
export function useReducedMotion(): boolean {
  const query = "(prefers-reduced-motion: reduce)";
  const [reduced, setReduced] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const list = matchMedia(query);
    const change = () => setReduced(list.matches);
    list.addEventListener("change", change);
    return () => list.removeEventListener("change", change);
  }, []);
  return reduced;
}

/**
 * What a screen reader hears at each step of a drag.
 *
 * @param items - the cards per column as they stand now.
 * @returns the announcements.
 */
export function announcements(items: () => Record<string, string[]>, rows: Map<string, InboxRow>, columns: BoardColumn[]): Announcements {
  const name = (id: string | number) => `card "${(rows.get(String(id))?.lastMessage ?? "").slice(0, 60)}"`;
  const where = (id: string | number) => {
    const now = items();
    const view = Object.keys(now).find((k) => now[k]!.includes(String(id)));
    const title = columns.find((c) => c.view === view)?.title ?? "the board";
    return view ? `${title}, position ${now[view]!.indexOf(String(id)) + 1} of ${now[view]!.length}` : title;
  };
  return {
    onDragStart: ({ active }) => `Picked up ${name(active.id)} in ${where(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${name(active.id)} is over ${where(active.id)}.` : `${name(active.id)} is over no column that takes it.`),
    onDragEnd: ({ active, over }) => (over ? `Dropped ${name(active.id)} in ${where(active.id)}.` : `Dropped ${name(active.id)} outside any column; it stays where it was.`),
    onDragCancel: ({ active }) => `Move cancelled; ${name(active.id)} is back where it was.`,
  };
}

/** Where the pointer took the card, as a transform origin, so the lift grows around that point. */
function useGrabOrigin(): string {
  const { active, activatorEvent } = useDndContext();
  const box = active?.rect.current.initial;
  const at = activatorEvent ? getEventCoordinates(activatorEvent) : null;
  return box && at && !(activatorEvent instanceof KeyboardEvent) ? `${at.x - box.left}px ${at.y - box.top}px` : "50% 50%";
}

/**
 * The card while lifted: full opacity, a little larger, a soft shadow and a
 * slight tilt, grown around the point the pointer took.
 */
export function DragLift({ id, reduced, children }: { id: string; reduced: boolean; children: ReactNode }) {
  const node = useRef<HTMLUListElement>(null);
  const origin = useGrabOrigin();
  const lifted = "scale(1.02) rotate(0.6deg)";
  useLayoutEffect(() => {
    if (reduced) return;
    node.current?.animate([{ transform: "none", boxShadow: "none" }, { transform: lifted, boxShadow: "var(--glass-lift)" }], { duration: 120, easing: EASE });
  }, [reduced]);
  const style: CSSProperties = { transform: reduced ? undefined : lifted, transformOrigin: origin, boxShadow: "var(--glass-lift)", cursor: "grabbing" };
  return <ul ref={node} data-drag-overlay={id} className="h-full rounded-card" style={style}>{children}</ul>;
}

/**
 * A column's cards as one sortable list. The queue opens a gap where the card
 * will land; columns ordered by time keep their order.
 */
export function ColumnCards({ view, ids, children }: { view: string; ids: string[]; children: ReactNode }) {
  return <SortableContext id={view} items={ids} strategy={view === "queue" ? verticalListSortingStrategy : unsorted}>{children}</SortableContext>;
}

export type CardDnd = {
  liProps: HTMLAttributes<HTMLLIElement> & { ref: Ref<HTMLLIElement>; style: CSSProperties };
  linkProps: HTMLAttributes<HTMLAnchorElement> & { ref: Ref<HTMLAnchorElement> };
};

/** Animates a refused card back from where it was dropped. */
function useReturn(id: string, node: React.RefObject<HTMLLIElement | null>) {
  const { returning, reduced } = useBoardDrag();
  useLayoutEffect(() => {
    if (!returning || returning.id !== id || !node.current || reduced) return;
    const now = node.current.getBoundingClientRect();
    const dx = returning.rect.left - now.left;
    const dy = returning.rect.top - now.top;
    node.current.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: "none" }], { duration: DURATION, easing: EASE });
  }, [returning, id, node, reduced]);
}

/**
 * One card in its column: drawn by `children` with the drag wiring, or as the
 * gap it leaves while it is lifted. A refused move adds the reason below it.
 */
export function DragCard({ row, sourceOnly, children }: { row: InboxRow; sourceOnly: boolean; children: (dnd: CardDnd) => ReactNode }) {
  const { reduced, note } = useBoardDrag();
  const sortable = useSortable({ id: row.id, disabled: { draggable: false, droppable: sourceOnly }, transition: reduced ? null : { duration: DURATION, easing: EASE } });
  const node = useRef<HTMLLIElement | null>(null);
  const setRef = (el: HTMLLIElement | null) => ((node.current = el), sortable.setNodeRef(el));
  useReturn(row.id, node);
  const style: CSSProperties = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition, WebkitTouchCallout: "none", touchAction: "manipulation" };
  const height = sortable.active?.rect.current.initial?.height;
  if (sortable.isDragging) return <li ref={setRef} style={{ ...style, height }} data-placeholder={row.id} aria-hidden className="rounded-card bg-ink/[.05] outline outline-1 -outline-offset-1 outline-dashed outline-line-strong" />;
  const liProps = { ref: setRef, style, ...(sortable.listeners as HTMLAttributes<HTMLLIElement>) };
  const linkProps = { ref: sortable.setActivatorNodeRef, "aria-roledescription": "draggable card", "aria-describedby": sortable.attributes["aria-describedby"] };
  return (
    <>
      {children({ liProps, linkProps })}
      {note?.id === row.id ? <li role="alert" className="px-1 text-[11px] text-ink-muted">{note.text}</li> : null}
    </>
  );
}
