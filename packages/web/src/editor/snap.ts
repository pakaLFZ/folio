/**
 * Alignment help for drawing, moving and resizing shapes and text boxes: an
 * edge or centre within a few screen px of another slot's edge or centre, of
 * the slide's edges or of its centre lines, snaps onto it, and a guide line
 * shows what it snapped to (spec/slides/drawing.md, "Alignment help"). Pure:
 * pt in, pt out.
 */
import type { Box } from "@folio/core";
import type { Handle, Pt } from "./shapeModel";

/** Where things may snap to, per axis, in canvas pt. */
export interface SnapTargets {
  xs: number[];
  ys: number[];
}

/** A guide line: a vertical line at `x` or a horizontal one at `y`, across the canvas. */
export interface Guide {
  axis: "x" | "y";
  at: number;
}

/** How near, in screen px, an edge must come to snap. */
export const SNAP_PX = 4;

/** The edges and centre of a box along one axis. */
function lines(box: Box, axis: "x" | "y"): number[] {
  const [start, size] = axis === "x" ? [box[0], box[2]] : [box[1], box[3]];
  return [start, start + size / 2, start + size];
}

/**
 * Every target on a slide: the other slots' edges and centres, and the canvas's edges and centre lines.
 *
 * @param boxes - the boxes of every other slot (template and added).
 * @param canvas - the slide's size in pt.
 */
export function snapTargets(boxes: Box[], canvas: { w: number; h: number }): SnapTargets {
  const page: Box = [0, 0, canvas.w, canvas.h];
  return { xs: [...lines(page, "x"), ...boxes.flatMap((b) => lines(b, "x"))], ys: [...lines(page, "y"), ...boxes.flatMap((b) => lines(b, "y"))] };
}

/** The nearest target to any of `values` within `tol`: the shift that lands on it, and where. */
function nearest(values: number[], targets: number[], tol: number): { shift: number; at: number } | null {
  let best: { shift: number; at: number } | null = null;
  for (const v of values) for (const t of targets) if (Math.abs(t - v) <= tol && (!best || Math.abs(t - v) < Math.abs(best.shift))) best = { shift: t - v, at: t };
  return best;
}

/**
 * Snap one point (a drawn corner, a handle, an arrow's end).
 *
 * @param axes - the axes that may snap; a side handle moves along one only.
 * @returns the point and the guides it snapped to.
 */
export function snapPoint(p: Pt, targets: SnapTargets, tol: number, axes: { x: boolean; y: boolean } = { x: true, y: true }): { p: Pt; guides: Guide[] } {
  const x = axes.x ? nearest([p[0]], targets.xs, tol) : null;
  const y = axes.y ? nearest([p[1]], targets.ys, tol) : null;
  const guides: Guide[] = [...(x ? [{ axis: "x" as const, at: x.at }] : []), ...(y ? [{ axis: "y" as const, at: y.at }] : [])];
  return { p: [x ? x.at : p[0], y ? y.at : p[1]], guides };
}

/**
 * Snap a moved box: whichever of its edges or centre comes nearest a target, per axis.
 *
 * @returns the extra shift that lands it, and the guides.
 */
export function snapMove(box: Box, targets: SnapTargets, tol: number): { dx: number; dy: number; guides: Guide[] } {
  const x = nearest(lines(box, "x"), targets.xs, tol);
  const y = nearest(lines(box, "y"), targets.ys, tol);
  const guides: Guide[] = [...(x ? [{ axis: "x" as const, at: x.at }] : []), ...(y ? [{ axis: "y" as const, at: y.at }] : [])];
  return { dx: x?.shift ?? 0, dy: y?.shift ?? 0, guides };
}

/** The axes a resize handle moves along. */
export function handleAxes(handle: Handle): { x: boolean; y: boolean } {
  return { x: handle.includes("e") || handle.includes("w"), y: handle.includes("n") || handle.includes("s") };
}
