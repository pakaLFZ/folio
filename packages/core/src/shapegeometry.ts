/**
 * The geometry of a drawn shape, in pt inside its box: where an arrow's line
 * stops and its heads sit, how a dash pattern is spaced, and where a shape's
 * text goes. The renderer draws exactly these numbers.
 */
import type { Box } from "./pack.js";

export type Point = [number, number];
export type Heads = "end" | "start" | "both" | "none";
export type Dash = "solid" | "dash" | "dot";

/** Inset of a rect's text from its box, before the stroke width is added. */
export const SHAPE_TEXT_PAD = 6;

/** The length of an arrow head for a stroke width; its width is 0.8 of this. */
export function headLength(strokeWidth: number): number {
  return 4 + 3 * strokeWidth;
}

/** The SVG dash array of a dash style, scaled by the stroke width; undefined for solid. */
export function dashArray(dash: Dash, strokeWidth: number): string | undefined {
  const w = Math.max(strokeWidth, 0.5);
  if (dash === "dash") return `${3 * w} ${2 * w}`;
  if (dash === "dot") return `0 ${2 * w}`;
  return undefined;
}

/** An arrow or line as drawn: the stroked segment and a triangle per head. */
export interface ArrowParts {
  line: [Point, Point];
  heads: [Point, Point, Point][];
}

/**
 * The parts of an arrow: the line stops at each head's base so its end does
 * not poke through the tip.
 *
 * @param from - the tail point; `to` the tip, in pt inside the box.
 * @param strokeWidth - the line's width; the heads scale with it.
 * @param heads - which ends carry a head.
 * @returns the segment to stroke and the triangles to fill (tip first).
 */
export function arrowParts(from: Point, to: Point, strokeWidth: number, heads: Heads): ArrowParts {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
  if (length === 0) return { line: [from, to], heads: [] };
  const ux = (to[0] - from[0]) / length;
  const uy = (to[1] - from[1]) / length;
  const size = Math.min(headLength(strokeWidth), length / (heads === "both" ? 2 : 1));
  const half = 0.4 * size;
  const head = (tip: Point, dx: number, dy: number): [Point, Point, Point] => {
    const base: Point = [tip[0] - dx * size, tip[1] - dy * size];
    return [tip, [base[0] - dy * half, base[1] + dx * half], [base[0] + dy * half, base[1] - dx * half]];
  };
  const atEnd = heads === "end" || heads === "both";
  const atStart = heads === "start" || heads === "both";
  const start: Point = atStart ? [from[0] + ux * size, from[1] + uy * size] : from;
  const end: Point = atEnd ? [to[0] - ux * size, to[1] - uy * size] : to;
  return { line: [start, end], heads: [...(atEnd ? [head(to, ux, uy)] : []), ...(atStart ? [head(from, -ux, -uy)] : [])] };
}

/**
 * Where a shape's text sits, relative to the box's top-left.
 *
 * @param kind - `rect` or `ellipse`.
 * @param w - the box width; `h` its height.
 * @param strokeWidth - the outline's width.
 * @returns a rect's box inset by 6 pt plus the stroke width; an ellipse's
 *   inscribed rectangle, centred. Width and height are at least 1 pt.
 */
export function shapeTextBox(kind: "rect" | "ellipse", w: number, h: number, strokeWidth: number): Box {
  if (kind === "ellipse") {
    const [iw, ih] = [w / Math.SQRT2, h / Math.SQRT2];
    return [(w - iw) / 2, (h - ih) / 2, iw, ih];
  }
  const inset = SHAPE_TEXT_PAD + strokeWidth;
  return [inset, inset, Math.max(1, w - 2 * inset), Math.max(1, h - 2 * inset)];
}
