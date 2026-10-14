/**
 * Where the new-comment input bar goes, in screen px: right of the selection's
 * top-right corner, else left, below, above; first within the free scene
 * (between rail, panel, top row and toolbar), then within the window. It
 * never covers the selection.
 */
export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export type Side = "right" | "left" | "below" | "above";

export interface Placement {
  side: Side;
  x: number;
  y: number;
}

export const BUBBLE_GAP = 12;
const SIDES: Side[] = ["right", "left", "below", "above"];

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The bar's corner for one side, kept inside `area` along that side. */
function corner(side: Side, sel: Rect, w: number, h: number, area: Rect): [number, number] {
  const y = clamp(sel.top, area.top, area.bottom - h);
  const x = clamp(sel.right - w, area.left, area.right - w);
  if (side === "right") return [sel.right + BUBBLE_GAP, y];
  if (side === "left") return [sel.left - BUBBLE_GAP - w, y];
  if (side === "below") return [x, sel.bottom + BUBBLE_GAP];
  return [x, sel.top - BUBBLE_GAP - h];
}

/**
 * Place the input bar.
 *
 * @param sel - the selection on screen.
 * @param size - the bar's size.
 * @param areas - bounds to try in order; the last is the fallback.
 * @returns the side and the top-left corner.
 */
export function placeBubble(sel: Rect, size: { w: number; h: number }, areas: Rect[]): Placement {
  const { w, h } = size;
  for (const area of areas) {
    for (const side of SIDES) {
      const [x, y] = corner(side, sel, w, h, area);
      if (x >= area.left && x + w <= area.right && y >= area.top && y + h <= area.bottom) return { side, x, y };
    }
  }
  const area = areas[areas.length - 1]!;
  const [x, y] = corner("below", sel, w, h, area);
  return { side: "below", x, y: Math.min(y, area.bottom - h) };
}

