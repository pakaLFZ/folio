/**
 * The zoom rules of the scene, as values: the zoom is a factor over fit, from
 * MIN_ZOOM (a quarter of fit) to MAX_ZOOM. Ctrl+wheel (and a trackpad pinch,
 * which arrives as ctrl+wheel) zooms about the pointer; a plain wheel scrolls
 * instead (pans the single slide at 100%+, or scrolls the column below it).
 * Every zoom step is the same fixed factor, never scaled by the speed or size
 * of the wheel delta: a mouse notch (a discrete deltaMode) is one step
 * outright, and a trackpad's continuous px deltas are accumulated and spent a
 * fixed amount at a time.
 */
export const MAX_ZOOM = 8;
export const MIN_ZOOM = 0.25;
export const STEP = 1.05;
const WHEEL_STEP_PX = 50;
const LINE_PX = 16;

/** The least of the slide that must stay visible on each panned axis: 48 px, or a tenth of that axis, whichever is larger. */
export const PAN_VISIBLE_MIN_PX = 48;
export const PAN_VISIBLE_FRACTION = 0.1;

export interface WheelInput {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey: boolean;
  shiftKey: boolean;
}

/** Keep a zoom between MIN_ZOOM and MAX_ZOOM. */
export function clampZoom(zoom: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/** A wheel's deltas in px, whatever unit the device reported. */
export function wheelPixels(e: WheelInput, pagePx: number): [number, number] {
  const unit = e.deltaMode === 1 ? LINE_PX : e.deltaMode === 2 ? pagePx : 1;
  return [e.deltaX * unit, e.deltaY * unit];
}

/**
 * What a ctrl+wheel (or pinch) step asks for: a signed step count (positive
 * zooms in), accumulating a trackpad's small deltas against WHEEL_STEP_PX so
 * a fast flick steps no further than the same distance scrolled slowly.
 *
 * @param acc - the px accumulated but not yet spent; pass 0 for the first.
 */
export function wheelZoomSteps(e: WheelInput, acc: number): { steps: number; acc: number } {
  if (e.deltaMode !== 0) return { steps: e.deltaY < 0 ? 1 : -1, acc };
  if (e.deltaY === 0) return { steps: 0, acc };
  const total = acc + e.deltaY;
  const spent = Math.trunc(total / WHEEL_STEP_PX);
  return { steps: -spent, acc: total - spent * WHEEL_STEP_PX };
}

/** The key's zoom factor, 0 for back to fit, or null for a key that is not a zoom key. */
export function keyZoom(key: string): number | null {
  if (key === "+" || key === "=") return STEP;
  if (key === "-" || key === "_") return 1 / STEP;
  if (key === "0") return 0;
  return null;
}

/**
 * The furthest a slide of `sheetSize` px may be panned along an axis of `freeSize`
 * free-scene px, centred at a pan of 0, while keeping at least
 * {@link PAN_VISIBLE_MIN_PX} (or {@link PAN_VISIBLE_FRACTION} of the slide,
 * whichever is larger, capped at the slide's own size) inside the free scene.
 */
export function panBound(freeSize: number, sheetSize: number): number {
  const visible = Math.min(sheetSize, Math.max(PAN_VISIBLE_MIN_PX, sheetSize * PAN_VISIBLE_FRACTION));
  return Math.max(0, (freeSize + sheetSize) / 2 - visible);
}

/** Keep a value within [-bound, bound]. */
export function clampAxis(value: number, bound: number): number {
  return Math.min(bound, Math.max(-bound, value));
}

/**
 * The index of the slide at a px offset `y` (relative to the column's own
 * top) inside a column of `count` uniformly spaced slides `pitch` px apart
 * (each slide's height plus its gap), given how far the column is scrolled.
 */
export function columnIndexAt(scrollTop: number, y: number, pitch: number, count: number): number {
  if (count <= 0) return 0;
  return Math.min(count - 1, Math.max(0, Math.floor((scrollTop + y) / pitch)));
}
