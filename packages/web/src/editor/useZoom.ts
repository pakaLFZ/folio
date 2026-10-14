/**
 * Zoom and pan of the slide in the scene. The zoom is a factor over fit; at
 * 100% or above the pan is a free 2D offset the hook owns (not the scene's
 * native scroll, which only has range on the axis the slide overflows),
 * applied as a CSS translate on the sheet, so whatever follows the slide (the
 * comment bubble) follows the pan too. Below 100% the scene shows the deck's
 * slides in a native-scrolling column instead (Scene.tsx / ColumnScene.tsx),
 * so no pan offset applies there. The slide is redrawn at `fit * zoom`, one
 * CSS scale on the pt canvas, so line measurement never sees the zoom.
 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { clampAxis, clampZoom, keyZoom, panBound, wheelPixels, wheelZoomSteps, STEP } from "./zoom";

type El = RefObject<HTMLElement | null>;

interface Anchor {
  u: number;
  v: number;
  x: number;
  y: number;
}

/** The pan offset, in the same sign as the scene's old scrollLeft/scrollTop would have read: larger means the slide sits further up/left. */
export interface Pan {
  x: number;
  y: number;
}

const ZERO_PAN: Pan = { x: 0, y: 0 };

export interface Zoom {
  zoom: number;
  pan: Pan;
  reset: () => void;
  /** Space is held or a pan drag is under way: the scene shows a hand. */
  grabbing: "grab" | "grabbing" | null;
}

/** True when a key press belongs to a text field or an editable slot. */
function typingIn(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return !!el && (el.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(el.tagName));
}

/** The centre of the scene's free area (inside its padding), on screen. */
function sceneCentre(el: HTMLElement): [number, number] {
  const r = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  return [(r.left + parseFloat(cs.paddingLeft) + r.right - parseFloat(cs.paddingRight)) / 2, (r.top + parseFloat(cs.paddingTop) + r.bottom - parseFloat(cs.paddingBottom)) / 2];
}

/** The scene's free area (inside its padding), in px. */
function freeSize(el: HTMLElement): [number, number] {
  const cs = getComputedStyle(el);
  return [el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight), el.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom)];
}

/** Keep a pan within the loose bound of each axis (spec/chrome/zoom.md: 48 px or 10% of the slide stays visible). */
function clampPan(pan: Pan, free: [number, number], sheet: [number, number]): Pan {
  return { x: clampAxis(pan.x, panBound(free[0], sheet[0])), y: clampAxis(pan.y, panBound(free[1], sheet[1])) };
}

/**
 * Zoom and pan the slide.
 *
 * @param scene - the free scene (the padded area the slide or the column sits in).
 * @param sheet - the single-slide element at 100%+, unset (ref holds null) in the column.
 * @param resetKey - any change returns to fit (the window resizing, a pane opening or closing).
 * @param onColumnHover - told the pointer's clientY on every ctrl+wheel step taken below 100%, so
 *   the caller can keep `current` the slide under the pointer, ready for when zoom crosses up to it.
 */
export function useZoom(scene: El, sheet: El, resetKey: string, onColumnHover?: (clientY: number) => void): Zoom {
  const [zoom, setZoom] = useState(1);
  const current = useRef(1);
  const anchor = useRef<Anchor | null>(null);
  const [pan, setPanState] = useState<Pan>(ZERO_PAN);
  const panRef = useRef<Pan>(ZERO_PAN);
  const setPan = useCallback(
    (next: Pan) => {
      panRef.current = next;
      setPanState(next);
      scene.current?.dispatchEvent(new Event("scroll"));
    },
    [scene],
  );
  const zoomAbout = useCallback((factor: number, x: number, y: number) => {
    const next = clampZoom(current.current * factor);
    if (next === current.current) return;
    const r = sheet.current?.getBoundingClientRect();
    anchor.current = r && r.width ? { u: (x - r.left) / r.width, v: (y - r.top) / r.height, x, y } : null;
    current.current = next;
    setZoom(next);
  }, [sheet]);
  const reset = useCallback(() => {
    anchor.current = null;
    current.current = 1;
    setZoom(1);
    setPan(ZERO_PAN);
  }, [setPan]);
  useLayoutEffect(reset, [resetKey, reset]);
  useLayoutEffect(() => settle(scene.current, sheet.current, anchor, current.current, panRef, setPan), [zoom, scene, sheet, setPan]);
  useWheel(scene, sheet, current, zoomAbout, panRef, setPan, onColumnHover);
  useZoomKeys(scene, zoomAbout, reset);
  const shift = useShiftHand();
  const dragging = useDragPan(scene, sheet, current, panRef, setPan);
  return { zoom, pan, reset, grabbing: dragging ? "grabbing" : zoom >= 1 && shift ? "grab" : null };
}

/** After a zoom, keep the anchored point of the slide under the pointer, then clamp the pan to its bound; below 100% (no sheet to anchor to) the pan is always none. */
function settle(scene: HTMLElement | null, sheet: HTMLElement | null, anchor: RefObject<Anchor | null>, zoomNow: number, panRef: RefObject<Pan>, setPan: (p: Pan) => void): void {
  if (!scene || !sheet) return;
  const a = anchor.current;
  const r = sheet.getBoundingClientRect();
  let next = panRef.current;
  if (a) {
    anchor.current = null;
    next = { x: next.x + (r.left + a.u * r.width - a.x), y: next.y + (r.top + a.v * r.height - a.y) };
  }
  next = zoomNow < 1 ? ZERO_PAN : clampPan(next, freeSize(scene), [r.width, r.height]);
  if (next.x !== panRef.current.x || next.y !== panRef.current.y) setPan(next);
}

/**
 * The wheel over the scene. Ctrl+wheel (and a trackpad pinch, which carries
 * ctrlKey) always zooms about the pointer, in fixed steps with no easing,
 * whether the slide is shown at 100%+ or as a column below it (accumulated in
 * a ref, so nothing moves once the wheel stops); below 100% it also tells
 * `onColumnHover` the pointer's clientY, so the hovered slide is ready to
 * become `current` once zoom crosses up to 100%. A plain wheel pans the
 * single slide at 100%+ (never the page); below 100% it is left alone, for
 * the column's own native scroll.
 */
function useWheel(scene: El, sheet: El, current: RefObject<number>, zoomAbout: (factor: number, x: number, y: number) => void, panRef: RefObject<Pan>, setPan: (p: Pan) => void, onColumnHover?: (clientY: number) => void): void {
  const acc = useRef(0);
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    const on = (e: WheelEvent) => {
      if (e.ctrlKey) {
        e.preventDefault();
        if (current.current < 1) onColumnHover?.(e.clientY);
        const { steps, acc: next } = wheelZoomSteps(e, acc.current);
        acc.current = next;
        if (steps) zoomAbout(STEP ** steps, e.clientX, e.clientY);
        return;
      }
      if (current.current < 1 || !sheet.current) return;
      e.preventDefault();
      const [dx, dy] = wheelPixels(e, el.clientHeight);
      const r = sheet.current.getBoundingClientRect();
      setPan(clampPan({ x: panRef.current.x + (e.shiftKey ? dx || dy : dx), y: e.shiftKey ? panRef.current.y : panRef.current.y + dy }, freeSize(el), [r.width, r.height]));
    };
    el.addEventListener("wheel", on, { passive: false });
    return () => el.removeEventListener("wheel", on);
  }, [scene, sheet, current, zoomAbout, panRef, setPan, onColumnHover]);
}

/** `+`, `-` and `0` outside a text slot: zoom about the scene's centre, or back to fit. */
function useZoomKeys(scene: El, zoomAbout: (factor: number, x: number, y: number) => void, reset: () => void): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (typingIn(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      const factor = keyZoom(e.key);
      if (factor === null || !scene.current) return;
      e.preventDefault();
      if (factor === 0) return reset();
      zoomAbout(factor, ...sceneCentre(scene.current));
    };
    addEventListener("keydown", down);
    return () => removeEventListener("keydown", down);
  }, [scene, zoomAbout, reset]);
}

/** Whether Shift is held for panning; never while the caret is in a text slot or field, where Shift extends the selection. */
function useShiftHand(): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Shift" && setHeld(e.type === "keydown" && !typingIn(document.activeElement));
    const off = () => setHeld(false);
    addEventListener("keydown", on);
    addEventListener("keyup", on);
    addEventListener("blur", off);
    return () => (removeEventListener("keydown", on), removeEventListener("keyup", on), removeEventListener("blur", off));
  }, []);
  return held;
}

/** A press that pans: left with Shift (unless the caret is in a text slot or field), middle, or right. */
function pansFrom(e: PointerEvent): boolean {
  return e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey && !typingIn(document.activeElement));
}

/**
 * Pan by dragging with the left button while Shift is held, with the middle
 * button, or with the right button (over the slide or a text slot alike,
 * without moving the caret), freely in both x and y at 100% or above — not
 * the scene's native scroll, which has no range on an axis the slide already
 * fits, but an offset this hook owns and clamps to its own loose bound.
 * Caught before the slide sees the press, so no region, mark or text
 * selection starts. Below 100% (the column) it does nothing, leaving the
 * column's own scroll alone. The scene always suppresses its own
 * `contextmenu` (Chromium on Linux and macOS fires it on the right-button
 * press itself, before any movement, so a press-then-check would already be
 * too late to let the drag pan).
 *
 * @returns whether a drag is under way.
 */
function useDragPan(scene: El, sheet: El, current: RefObject<number>, panRef: RefObject<Pan>, setPan: (p: Pan) => void): boolean {
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const el = scene.current;
    if (!el) return;
    let last: [number, number] | null = null;
    const down = (e: PointerEvent) => {
      if (current.current < 1 || !pansFrom(e)) return;
      e.preventDefault();
      e.stopPropagation();
      el.setPointerCapture(e.pointerId);
      last = [e.clientX, e.clientY];
      setDragging(true);
    };
    const move = (e: PointerEvent) => {
      if (!last || !sheet.current) return;
      const r = sheet.current.getBoundingClientRect();
      const next = clampPan({ x: panRef.current.x - (e.clientX - last[0]), y: panRef.current.y - (e.clientY - last[1]) }, freeSize(el), [r.width, r.height]);
      setPan(next);
      last = [e.clientX, e.clientY];
    };
    const up = () => ((last = null), setDragging(false));
    const swallow = (e: Event) => last && (e.preventDefault(), e.stopPropagation());
    const context = (e: Event) => e.preventDefault();
    const events: [string, EventListener, boolean][] = [["pointerdown", down as EventListener, true], ["mousedown", swallow, true], ["pointermove", move as EventListener, false], ["pointerup", up, false], ["pointercancel", up, false], ["contextmenu", context, false]];
    events.forEach(([type, fn, capture]) => el.addEventListener(type, fn, capture));
    return () => events.forEach(([type, fn, capture]) => el.removeEventListener(type, fn, capture));
  }, [scene, sheet, current, panRef, setPan]);
  return dragging;
}
