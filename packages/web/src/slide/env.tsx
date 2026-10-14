/**
 * What a rendered slide needs besides its props: the pack, how it is being
 * shown, and the callbacks for measurement and edits. json-render passes only
 * props to a component, so this travels by React context.
 */
import { createContext, useContext } from "react";
import type { MeasuredSlot, Pack } from "@folio/core";

export type SlideMode = "view" | "edit" | "print" | "thumb";

/** A text or table hook's last good output, with the input it was made from. */
export interface HookOutput {
  input: unknown;
  output: unknown;
}

/** A slot's hook state as the renderer sees it: a figure URL or a text or table output. */
export interface FigureState {
  url: string | null;
  state: "ok" | "drawing" | "failed" | "paused" | "stale" | "missing" | "none";
  output?: HookOutput | null;
  /** Whether `output` was made from the slot's current input (the server's word). */
  current?: boolean;
  message?: string;
  /** The box in pt a hook figure was drawn for; it is shown at that size, never scaled to another. */
  box?: { w: number; h: number };
}

export interface SlideEnv {
  pack: Pack;
  slideId: string;
  mode: SlideMode;
  /** The canvas scale on screen; chrome drawn inside the slide divides by it to keep its size. */
  scale?: number;
  overflow: Record<string, MeasuredSlot>;
  limits: Record<string, number>;
  selectedSlot: string | null;
  /** A slot's figure or hook state; a hooked text slot passes `{hook, input}`. */
  figure: (slot: string, value: unknown) => FigureState;
  /** The URL of a deck-relative file, such as a table's `.table.json`; absent where no deck is open. */
  fileUrl?: (path: string) => string;
  onSlotMeasured?: (m: MeasuredSlot) => void;
  /** Told why the slide failed to render; the slide shows an error box instead. */
  onRenderError?: (message: string) => void;
  /** Save a slot: text slots give their markup, a code block its value (a string or `{code, language}`). */
  onCommit?: (slot: string, value: unknown) => void;
  onHistory?: (slot: string, direction: "undo" | "redo") => void;
  onSelectSlot?: (slot: string | null) => void;
  onEditing?: (slot: string | null) => void;
  /** Draw the user's drafts outside Edit and the rail: a shot taken with `--drafts` or `--marks`. */
  showDrafts?: boolean;
}

export const SlideEnvContext = createContext<SlideEnv | null>(null);

/**
 * Read the slide environment.
 *
 * @returns the nearest environment; throws outside a `SlideView`.
 */
export function useSlideEnv(): SlideEnv {
  const env = useContext(SlideEnvContext);
  if (!env) throw new Error("slide component rendered outside SlideView");
  return env;
}

/**
 * How a slide's pictures load. The print page lays every slide out in one tall
 * column that headless Chromium never scrolls, so a lazy picture far down it
 * would never start loading and the page would never be ready.
 */
export function imageLoading(mode: SlideMode): "eager" | "lazy" {
  return mode === "print" ? "eager" : "lazy";
}
