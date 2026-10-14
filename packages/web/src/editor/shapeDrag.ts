/**
 * What a drag on the shape layer does to a shape or text box, with alignment
 * help: drawing, moving, resizing and dragging an end, each snapped to the
 * slide's targets unless Alt is held (spec/slides/drawing.md, "Alignment
 * help"). Pure: the layer feeds it pointer positions in pt.
 */
import { drawnShape, endDragged, moved, resized, type End, type Handle, type Pt, type Shape, type ShapeContent, type ShapeKind } from "./shapeModel";
import { handleAxes, snapMove, snapPoint, type Guide, type SnapTargets } from "./snap";

export type DrawTool = ShapeKind | "text";

export type Drag =
  | { kind: "draw"; tool: DrawTool; a: Pt; b: Pt; shift: boolean; free: boolean }
  | { kind: "move"; name: string; a: Pt; b: Pt; free: boolean }
  | { kind: "resize"; name: string; handle: Handle; a: Pt; b: Pt; shift: boolean; free: boolean }
  | { kind: "end"; name: string; end: End; b: Pt; shift: boolean; free: boolean };

/** Where to snap and how near (pt, from the screen px at this zoom). */
export interface SnapContext {
  targets: SnapTargets;
  tol: number;
}

/** A drag's result: the shape it leaves and the guides it snapped to. */
export interface Dragged {
  shape: Shape;
  guides: Guide[];
}

const NONE: Guide[] = [];

/** A point snapped, unless the drag is free (Alt held). */
function point(p: Pt, free: boolean, ctx: SnapContext, axes?: { x: boolean; y: boolean }): { p: Pt; guides: Guide[] } {
  return free ? { p, guides: NONE } : snapPoint(p, ctx.targets, ctx.tol, axes);
}

/**
 * Where a resize puts the handle's own point on the box: the handle's place
 * moved by the pointer's travel since the press. The press lands anywhere in
 * the handle's hit area (outside the box), so the edge never jumps to the
 * pointer when the drag begins.
 */
function handleDragged(shape: Shape, drag: Extract<Drag, { kind: "resize" }>): Pt {
  const [x, y, w, h] = shape.box;
  const hx = drag.handle.includes("w") ? x : drag.handle.includes("e") ? x + w : x + w / 2;
  const hy = drag.handle.includes("n") ? y : drag.handle.includes("s") ? y + h : y + h / 2;
  return [hx + drag.b[0] - drag.a[0], hy + drag.b[1] - drag.a[1]];
}

/** A new shape or text box from a draw drag, its corners snapped. */
export function drawn(drag: Extract<Drag, { kind: "draw" }>, ctx: SnapContext): { box: Shape["box"]; content: ShapeContent; guides: Guide[] } | null {
  const a = point(drag.a, drag.free, ctx);
  const b = drag.shift && drag.tool !== "rect" && drag.tool !== "ellipse" && drag.tool !== "text" ? { p: drag.b, guides: NONE } : point(drag.b, drag.free, ctx);
  const made = drawnShape(drag.tool === "text" ? "rect" : drag.tool, a.p, b.p, drag.shift);
  return made ? { ...made, guides: [...a.guides, ...b.guides] } : null;
}

/**
 * What a move, resize or end drag makes of a shape.
 *
 * @returns the shape and the guides it snapped to.
 */
export function applyDrag(drag: Exclude<Drag, { kind: "draw" }>, shape: Shape, ctx: SnapContext): Dragged {
  if (drag.kind === "move") {
    const free = moved(shape, drag.b[0] - drag.a[0], drag.b[1] - drag.a[1]);
    if (drag.free) return { shape: free, guides: NONE };
    const snap = snapMove(free.box, ctx.targets, ctx.tol);
    return { shape: moved(free, snap.dx, snap.dy), guides: snap.guides };
  }
  if (drag.kind === "resize") {
    const p = point(handleDragged(shape, drag), drag.free, ctx, handleAxes(drag.handle));
    return { shape: resized(shape, drag.handle, p.p, drag.shift), guides: p.guides };
  }
  const p = drag.shift ? { p: drag.b, guides: NONE } : point(drag.b, drag.free, ctx);
  return { shape: endDragged(shape, drag.end, p.p, drag.shift), guides: p.guides };
}

/** The drag's outline shape and its guides, for drawing while the pointer moves. */
export function preview(drag: Drag, items: Shape[], ctx: SnapContext): Dragged | null {
  if (drag.kind === "draw") {
    const made = drawn(drag, ctx);
    return made ? { shape: { name: "", box: made.box, content: made.content, text: drag.tool === "text" }, guides: made.guides } : null;
  }
  const shape = items.find((s) => s.name === drag.name);
  return shape ? applyDrag(drag, shape, ctx) : null;
}
