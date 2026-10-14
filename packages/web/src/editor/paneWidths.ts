/**
 * The widths of the rail and the panel, dragged by their inner edges. Each
 * stays inside its own limits and never leaves the scene less than
 * `SCENE_MIN` px between the open panes; the choice is kept per browser.
 * Below 900 px the panes are sheets at their initial widths and nothing resizes.
 */
import { useEffect, useLayoutEffect, useState } from "react";

export type Side = "rail" | "panel";
export type PaneWidths = Record<Side, number>;
export type PanesOpen = Record<Side, boolean>;

export const PANE_LIMITS = {
  rail: { min: 140, max: 400, initial: 196 },
  panel: { min: 280, max: 560, initial: 328 },
} as const;
export const SCENE_MIN = 320;
export const PANE_INSET = 12;
export const RESIZE_STEP = 16;
export const WIDE_MIN = 900;
const STORE_KEYS: Record<Side, string> = { rail: "folio.rail-w", panel: "folio.panel-w" };
const CSS_VARS: Record<Side, string> = { rail: "--rail-w", panel: "--panel-w" };
const INITIAL: PaneWidths = { rail: PANE_LIMITS.rail.initial, panel: PANE_LIMITS.panel.initial };

const otherSide = (side: Side): Side => (side === "rail" ? "panel" : "rail");
const within = (side: Side, w: number) => Math.round(Math.min(PANE_LIMITS[side].max, Math.max(PANE_LIMITS[side].min, w)));
const room = (side: Side, widths: PaneWidths, open: PanesOpen) => (open[side] ? PANE_INSET + widths[side] : 0);

/** A rail thumbnail's width: the rail less `inset` on each side, so it stays centred. */
export const thumbWidth = (rail: number, inset: number) => rail - 2 * inset;

/** A length token from `styles.css`, resolved to px. */
function cssLength(token: string): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:absolute;visibility:hidden;width:var(${token})`;
  document.body.append(probe);
  const px = probe.getBoundingClientRect().width;
  probe.remove();
  return px;
}

/** The widest `side` may be beside the other pane as it stands, in px. */
export function paneMax(side: Side, widths: PaneWidths, open: PanesOpen, viewport: number): number {
  const free = viewport - SCENE_MIN - PANE_INSET - room(otherSide(side), widths, open);
  return within(side, free);
}

/**
 * The stored widths fitted to the window: each inside its limits, then the
 * rail and after it the panel narrowed until the scene keeps `SCENE_MIN`.
 */
export function fitWidths(stored: PaneWidths, open: PanesOpen, viewport: number): PaneWidths {
  const fitted = { rail: within("rail", stored.rail), panel: within("panel", stored.panel) };
  let excess = room("rail", fitted, open) + room("panel", fitted, open) + SCENE_MIN - viewport;
  for (const side of ["rail", "panel"] as const) {
    if (!open[side] || excess <= 0) continue;
    const cut = Math.min(excess, fitted[side] - PANE_LIMITS[side].min);
    fitted[side] -= cut;
    excess -= cut;
  }
  return fitted;
}

function readStored(side: Side): number {
  try {
    const value = Number(localStorage.getItem(STORE_KEYS[side]));
    return value > 0 ? value : PANE_LIMITS[side].initial;
  } catch {
    return PANE_LIMITS[side].initial;
  }
}

function writeStored(widths: PaneWidths): void {
  try {
    for (const side of ["rail", "panel"] as const) localStorage.setItem(STORE_KEYS[side], String(widths[side]));
  } catch {
    return;
  }
}

/** Write the widths into the CSS the panes and the mode switch read; clear them below 900 px. */
function usePaneVars(widths: PaneWidths, wide: boolean): void {
  useLayoutEffect(() => {
    const root = document.documentElement.style;
    for (const side of ["rail", "panel"] as const) {
      if (wide) root.setProperty(CSS_VARS[side], `${widths[side]}px`);
      else root.removeProperty(CSS_VARS[side]);
    }
  }, [widths.rail, widths.panel, wide]);
}

export interface PaneSizing {
  widths: PaneWidths;
  thumb: number;
  max: PaneWidths;
  resize: (side: Side, width: number) => void;
  reset: (side: Side) => void;
}

/**
 * The panes' widths for this window.
 *
 * @param open - which panes are open; a shut pane takes no room from the scene.
 * @param viewport - the window's width in px.
 */
export function usePaneWidths(open: PanesOpen, viewport: number): PaneSizing {
  const wide = viewport >= WIDE_MIN;
  const [stored, setStored] = useState<PaneWidths>(() => ({ rail: readStored("rail"), panel: readStored("panel") }));
  const [thumbInset] = useState(() => cssLength("--thumb-inset"));
  const widths = wide ? fitWidths(stored, open, viewport) : INITIAL;
  usePaneVars(widths, wide);
  useEffect(() => {
    const timer = setTimeout(() => writeStored(stored), 150);
    return () => clearTimeout(timer);
  }, [stored]);
  const max = { rail: paneMax("rail", widths, open, viewport), panel: paneMax("panel", widths, open, viewport) };
  const resize = (side: Side, width: number) => setStored((s) => ({ ...s, [side]: Math.min(max[side], within(side, width)) }));
  const reset = (side: Side) => resize(side, PANE_LIMITS[side].initial);
  return { widths, thumb: thumbWidth(widths.rail, thumbInset), max, resize, reset };
}
