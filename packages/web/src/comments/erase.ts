/** Hit-testing for the draft eraser, in slide coordinates. */
import type { Box, Mark } from "@folio/core";
import type { DraftState } from "./useComments";

type Point = [number, number];
const RADIUS = 9;

function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = dx || dy ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

function samples(path: Point[]): Point[] {
  const result = [path[0]!];
  for (let i = 1; i < path.length; i++) {
    const [a, b] = [path[i - 1]!, path[i]!];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / (RADIUS / 2)));
    for (let j = 1; j <= steps; j++) result.push([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps]);
  }
  return result;
}

function contains(box: Box, p: Point): boolean {
  return p[0] >= box[0] - RADIUS && p[0] <= box[0] + box[2] + RADIUS && p[1] >= box[1] - RADIUS && p[1] <= box[1] + box[3] + RADIUS;
}

function touches(mark: Mark, path: Point[]): boolean {
  const points = mark.points;
  if (!points.length) return false;
  const a = points[0]!;
  const b = points[points.length - 1]!;
  if (mark.tool === "rect") {
    const box: Box = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
    return path.some((p) => contains(box, p));
  }
  const segments = mark.tool === "pen" ? points.slice(1).map((p, i) => [points[i]!, p] as const) : [[a, b] as const];
  return path.some((p) => segments.some(([start, end]) => distanceToSegment(p, start, end) <= RADIUS));
}

/** Erase only the draft marks crossed by a stroke; a tap removes the topmost hit. */
export function eraseDraft(draft: DraftState, path: Point[]): DraftState {
  if (!path.length) return draft;
  const sampled = samples(path);
  const hit = draft.marks.map((mark, i) => touches(mark, sampled) ? i : -1).filter((i) => i >= 0);
  if (hit.length) {
    const removed = path.length === 1 ? [hit[hit.length - 1]!] : hit;
    return { ...draft, marks: draft.marks.filter((_, i) => !removed.includes(i)) };
  }
  if (draft.region && sampled.some((p) => contains(draft.region!, p))) return { ...draft, region: null };
  return draft;
}
