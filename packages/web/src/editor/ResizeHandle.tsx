/**
 * The grip on a pane's inner edge: an 8 px band straddling the edge, drawn
 * only as a hairline while it is under the pointer, held or focused. Dragging
 * resizes the pane live, one update per animation frame; a double click
 * returns it to its initial width; arrow keys move the edge by `RESIZE_STEP`.
 */
import { useEffect, useRef, type KeyboardEvent, type PointerEvent } from "react";
import { PANE_LIMITS, RESIZE_STEP, type PaneSizing, type PanesOpen, type Side } from "./paneWidths";

/** +1 when the grip is the pane's right edge (the rail), -1 when its left (the panel). */
const GROWS_RIGHTWARD: Record<Side, 1 | -1> = { rail: 1, panel: -1 };

interface HandleProps {
  side: Side;
  label: string;
  width: number;
  max: number;
  onResize: (width: number) => void;
  onReset: () => void;
}

/**
 * Follow a drag from the grip, coalescing pointer moves into one resize per frame.
 *
 * @returns the pointer handlers for the grip.
 */
function useEdgeDrag(side: Side, width: number, onResize: (width: number) => void) {
  const latest = useRef(onResize);
  latest.current = onResize;
  const drag = useRef<{ grip: HTMLElement; x: number; width: number; frame: number; next: number } | null>(null);
  const end = () => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    cancelAnimationFrame(d.frame);
    latest.current(d.next);
    delete d.grip.dataset.dragging;
    delete document.documentElement.dataset.resizing;
  };
  useEffect(() => end, []);
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { grip: e.currentTarget, x: e.clientX, width, frame: 0, next: width };
    e.currentTarget.dataset.dragging = "";
    document.documentElement.dataset.resizing = "";
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    d.next = d.width + GROWS_RIGHTWARD[side] * (e.clientX - d.x);
    if (!d.frame) d.frame = requestAnimationFrame(() => (d.frame = 0, latest.current(d.next)));
  };
  return { onPointerDown, onPointerMove, onPointerUp: end, onPointerCancel: end, onLostPointerCapture: end };
}

/** The grip for one pane. */
export function ResizeHandle({ side, label, width, max, onResize, onReset }: HandleProps) {
  const pointer = useEdgeDrag(side, width, onResize);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === "ArrowRight" ? RESIZE_STEP : e.key === "ArrowLeft" ? -RESIZE_STEP : 0;
    if (!step) return;
    e.preventDefault();
    e.stopPropagation();
    onResize(width + GROWS_RIGHTWARD[side] * step);
  };
  return (
    <div
      className="pane-resizer"
      data-side={side}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={PANE_LIMITS[side].min}
      aria-valuemax={max}
      tabIndex={0}
      title="Drag to resize, double-click to reset"
      onDoubleClick={onReset}
      onKeyDown={onKeyDown}
      {...pointer}
    />
  );
}

/**
 * The grips of the open panes, at 900 px and wider; below that the panes are
 * sheets and keep their widths.
 */
export function PaneGrips({ sizing, open, wide }: { sizing: PaneSizing; open: PanesOpen; wide: boolean }) {
  if (!wide) return null;
  const grip = (side: Side, label: string) =>
    open[side] ? <ResizeHandle side={side} label={label} width={sizing.widths[side]} max={sizing.max[side]} onResize={(w) => sizing.resize(side, w)} onReset={() => sizing.reset(side)} /> : null;
  return (
    <>
      {grip("rail", "Resize slides")}
      {grip("panel", "Resize panel")}
    </>
  );
}
