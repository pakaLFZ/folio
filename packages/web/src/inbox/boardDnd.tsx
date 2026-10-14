/**
 * Real dragging on the inbox board: the card itself lifts and follows the
 * pointer, the column it leaves keeps a gap until it is gone, and the column
 * under it opens one where it will land. Mouse, touch and keyboard drive the
 * same moves; the server call follows the drop, and a refused move animates
 * the card back with a note saying why. Only the task columns take part:
 * the Drafts column, and any column the board hides, are neither a source nor
 * a target.
 */
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, MeasuringStrategy, MouseSensor, TouchSensor, closestCenter, closestCorners, pointerWithin, useDroppable, useSensor, useSensors,
  type Active, type CollisionDetection, type DragEndEvent, type DragOverEvent, type DragStartEvent, type Over,
} from "@dnd-kit/core";
import { arrayMove, sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { InboxRow } from "@folio/core";
import { announcements, DragLift, INSTRUCTIONS, useReducedMotion } from "./boardDndParts";

export type Target = "queue" | "held" | "done";
export type BoardColumn = { view: string; title: string; drop: Target | null };
type Items = Record<string, string[]>;
type Drag = { id: string; from: string; items: Items };
type Settled = { id: string; to: string; items: Items };
export type Returning = { id: string; rect: DOMRect };

const COLUMN = "col:";
const NOT_TASKS = ["drafts"];
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";
export const DURATION = 180;

interface BoardDragState {
  items: Items;
  rows: Map<string, InboxRow>;
  columns: BoardColumn[];
  activeId: string | null;
  overColumn: string | null;
  returning: Returning | null;
  note: { id: string; text: string } | null;
  reduced: boolean;
}

const BoardDrag = createContext<BoardDragState | null>(null);

/** The board's drag state, for the columns and cards inside `BoardDnd`. */
export function useBoardDrag(): BoardDragState {
  const state = useContext(BoardDrag);
  if (!state) throw new Error("useBoardDrag outside BoardDnd");
  return state;
}

/**
 * One column's drop zone and the cards it shows, the dragged card included.
 *
 * @param view - the column.
 * @param drop - where a drop there moves a card, or null when it takes none.
 * @returns the cards in place, whether the column takes the dragged card, whether it is under it, and the list's ref.
 */
export function useDropColumn(view: string, drop: Target | null) {
  const s = useBoardDrag();
  const active = s.activeId ? s.rows.get(s.activeId) : undefined;
  const accepts = !!active && !!drop && (view === "queue" || active.view !== view);
  const { setNodeRef } = useDroppable({ id: COLUMN + view, disabled: !drop });
  const rows = (s.items[view] ?? []).map((id) => s.rows.get(id)).filter((r): r is InboxRow => !!r);
  return { rows, accepts, over: accepts && s.overColumn === view, setNodeRef };
}

const itemsOf = (byView: Record<string, InboxRow[]>, columns: BoardColumn[]): Items =>
  Object.fromEntries(columns.map((c) => [c.view, (byView[c.view] ?? []).map((r) => r.id)]));

const columnOf = (items: Items, id: string | undefined): string | undefined =>
  id === undefined ? undefined : id.startsWith(COLUMN) ? id.slice(COLUMN.length) : Object.keys(items).find((k) => items[k]!.includes(id));

const collide: CollisionDetection = (args) => {
  if (!args.pointerCoordinates) return closestCorners(args);
  const column = pointerWithin({ ...args, droppableContainers: args.droppableContainers.filter((c) => String(c.id).startsWith(COLUMN)) })[0];
  if (!column) return [];
  const view = String(column.id).slice(COLUMN.length);
  const cards = args.droppableContainers.filter((c) => c.data.current?.sortable?.containerId === view);
  return cards.length ? closestCenter({ ...args, droppableContainers: cards }) : [column];
};

/**
 * Where the dragged card enters a column it is not yet in: in the queue
 * before or after the card under it; in a column ordered by time, at the top,
 * where the server will place it.
 */
function entryIndex(list: string[], view: string, active: Active, over: Over): number {
  if (view !== "queue") return 0;
  const at = list.indexOf(String(over.id));
  if (at < 0) return list.length;
  const moving = active.rect.current.translated;
  const below = !!moving && moving.top + moving.height / 2 > over.rect.top + over.rect.height / 2;
  return at + (below ? 1 : 0);
}

/** The items with the dragged card moved into another column. */
function moveAcross(items: Items, id: string, from: string, to: string, index: number): Items {
  const target = items[to]!.filter((x) => x !== id);
  target.splice(index, 0, id);
  return { ...items, [from]: items[from]!.filter((x) => x !== id), [to]: target };
}

/** The items once the card is dropped: a move within the queue is applied here. */
function placed(items: Items, to: string, id: string, overId: string): Items {
  const list = items[to]!;
  const from = list.indexOf(id);
  const at = list.indexOf(overId);
  if (to !== "queue" || at < 0 || from === at) return items;
  return { ...items, [to]: arrayMove(list, from, at) };
}

/** The sensors: a short distance for the mouse, a press for touch, Space for the keyboard. */
function useBoardSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space", "Enter"] } }),
  );
}

/**
 * A refused move: the card animates back from where it was placed, with a note.
 *
 * @returns a handler for the server's refusal.
 */
function useRefusal(setSettled: (s: Settled | null) => void) {
  const [returning, setReturning] = useState<Returning | null>(null);
  const [note, setNote] = useState<{ id: string; text: string } | null>(null);
  const refuse = (id: string, error: unknown) => {
    const node = document.querySelector(`[data-card="${CSS.escape(id)}"]`);
    if (node) setReturning({ id, rect: node.getBoundingClientRect() });
    setSettled(null);
    setNote({ id, text: `Move refused: ${error instanceof Error ? error.message : String(error)}` });
  };
  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 8000);
    return () => clearTimeout(timer);
  }, [note]);
  return { returning, note, refuse, clearNote: () => setNote(null) };
}

/**
 * The cards as placed after a drop, until the server's rows show the move.
 *
 * @returns the settled layout and its setter.
 */
function useSettled(byView: Record<string, InboxRow[]>) {
  const [settled, setSettled] = useState<Settled | null>(null);
  useEffect(() => {
    if (!settled) return;
    const at = (byView[settled.to] ?? []).findIndex((r) => r.id === settled.id);
    if (at >= 0 && (settled.to !== "queue" || at === settled.items.queue!.indexOf(settled.id))) return setSettled(null);
    const timer = setTimeout(() => setSettled(null), 4000);
    return () => clearTimeout(timer);
  }, [byView, settled]);
  return [settled, setSettled] as const;
}

type DropHandler = (row: InboxRow, target: Target, index: number) => Promise<unknown>;

/**
 * The drag handlers: lift, move across columns, drop and cancel.
 *
 * @returns the handlers for `DndContext` and the live drag.
 */
function useDragHandlers(byView: Record<string, InboxRow[]>, base: Items, rows: Map<string, InboxRow>, columns: BoardColumn[], onDrop: DropHandler) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const [overColumn, setOverColumn] = useState<string | null>(null);
  const [settled, setSettled] = useSettled(byView);
  const refusal = useRefusal(setSettled);
  const dropOf = (view: string | undefined) => columns.find((c) => c.view === view)?.drop ?? null;
  const onDragStart = ({ active }: DragStartEvent) => {
    refusal.clearNote();
    const id = String(active.id);
    setDrag({ id, from: columnOf(base, id)!, items: base });
  };
  const onDragOver = ({ active, over }: DragOverEvent) => {
    setOverColumn(over ? columnOf(drag?.items ?? base, String(over.id)) ?? null : null);
    if (!drag) return;
    if (!over) return setDrag({ ...drag, items: base });
    const from = columnOf(drag.items, drag.id)!;
    const to = columnOf(drag.items, String(over.id));
    if (!to || to === from || (!dropOf(to) && to !== drag.from)) return;
    const index = to === drag.from && to !== "queue" ? base[to]!.indexOf(drag.id) : entryIndex(drag.items[to]!, to, active, over);
    setDrag({ ...drag, items: moveAcross(drag.items, drag.id, from, to, index) });
  };
  const end = () => (setDrag(null), setOverColumn(null));
  const onDragEnd = ({ over }: DragEndEvent) => {
    const to = drag && over ? columnOf(drag.items, String(over.id)) : undefined;
    const target = dropOf(to);
    const row = drag ? rows.get(drag.id) : undefined;
    end();
    if (!drag || !over || !to || !target || !row) return;
    const items = placed(drag.items, to, drag.id, String(over.id));
    const index = items[to]!.indexOf(drag.id);
    if (to === drag.from && (to !== "queue" || index === base[to]!.indexOf(drag.id))) return;
    setSettled({ id: drag.id, to, items });
    onDrop(row, target, index).catch((e) => refusal.refuse(row.id, e));
  };
  return { drag, overColumn, settled, refusal, handlers: { onDragStart, onDragOver, onDragEnd, onDragCancel: end } };
}

/**
 * The board's drag and drop.
 *
 * @param props.byView - the server's cards per column, in board order.
 * @param props.columns - the shown columns and where a drop on each moves a card.
 * @param props.onDrop - sends a drop to the server: the card, its new column and its index there.
 * @param props.renderLifted - the card as drawn while lifted.
 */
export function BoardDnd({ byView, columns: shown, onDrop, renderLifted, children }: {
  byView: Record<string, InboxRow[]>; columns: BoardColumn[]; onDrop: DropHandler; renderLifted: (row: InboxRow) => ReactNode; children: ReactNode;
}) {
  const columns = useMemo(() => shown.filter((c) => !NOT_TASKS.includes(c.view)), [shown]);
  const rows = useMemo(() => new Map(columns.flatMap((c) => byView[c.view] ?? []).map((r) => [r.id, r])), [byView, columns]);
  const base = useMemo(() => itemsOf(byView, columns), [byView, columns]);
  const { drag, overColumn, settled, refusal, handlers } = useDragHandlers(byView, base, rows, columns, onDrop);
  const reduced = useReducedMotion();
  const items = drag?.items ?? settled?.items ?? base;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const state = useMemo<BoardDragState>(
    () => ({ items, rows, columns, activeId: drag?.id ?? null, overColumn, returning: refusal.returning, note: refusal.note, reduced }),
    [items, rows, columns, drag?.id, overColumn, refusal.returning, refusal.note, reduced],
  );
  const lifted = drag ? rows.get(drag.id) : undefined;
  return (
    <DndContext
      sensors={useBoardSensors()} collisionDetection={collide} measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      autoScroll={{ threshold: { x: 0.12, y: 0.15 }, acceleration: 12 }}
      accessibility={{ announcements: announcements(() => itemsRef.current, rows, columns), screenReaderInstructions: { draggable: INSTRUCTIONS } }}
      {...handlers}
    >
      <BoardDrag.Provider value={state}>{children}</BoardDrag.Provider>
      <DragOverlay dropAnimation={{ duration: reduced ? 0 : DURATION, easing: EASE }}>
        {lifted ? <DragLift id={lifted.id} reduced={reduced}>{renderLifted(lifted)}</DragLift> : null}
      </DragOverlay>
    </DndContext>
  );
}
