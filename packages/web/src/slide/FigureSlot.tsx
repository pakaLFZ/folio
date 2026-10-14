/**
 * A figure slot: a picture drawn at exactly its box, from a deck file or a hook.
 * While a hook draws, the last good figure stays with a quiet "drawing" mark; a
 * failed hook keeps the last good figure and shows a danger badge. In View and
 * print nothing but the picture is drawn; a thumbnail shows an empty slot's
 * faint placeholder so an empty slide is still recognisable.
 */
import { useLayoutEffect, type CSSProperties } from "react";
import { fontFamilyOf, placeholderOf, type Box, type Slot } from "@folio/core";
import { imageLoading, useSlideEnv, type FigureState } from "./env";

const LABEL: Record<string, string> = { drawing: "drawing", failed: "hook failed", paused: "hook paused", stale: "stale", missing: "file missing" };

/**
 * Render a figure slot.
 *
 * @param props.name - the slot name, e.g. `fig:a`.
 * @param props.slot - the slot's declaration.
 * @param props.value - a deck-relative path, a hook call, or null.
 * @param props.box - the box as laid out; a figure placed `below` another
 *   reports its laid-out height, so a squeezed one is warned about.
 */
export function FigureSlot({ name, slot, value, box }: { name: string; slot: Slot; value: unknown; box: Box }) {
  const env = useSlideEnv();
  const [x, y, w, h] = box;
  useLayoutEffect(() => void (slot.below && env.onSlotMeasured?.({ slot: name, lines: 0, overPt: 0, boxPt: h })));
  const figure = env.figure(name, value);
  const chrome = env.mode === "edit";
  const selected = env.selectedSlot === name;
  const danger = isDanger(figure.state);
  return (
    <div
      className="folio-slot"
      data-slot={name}
      onClick={() => chrome && env.onSelectSlot?.(name)}
      style={{ left: `${x}pt`, top: `${y}pt`, width: `${w}pt`, height: `${Math.max(0, h)}pt`, overflow: figure.box ? "hidden" : undefined, outline: chrome && (selected || danger) ? `1px solid ${danger ? "var(--color-danger)" : "rgb(0 0 0 / 0.35)"}` : undefined, outlineOffset: -1 }}
    >
      {figure.url ? (
        <img src={figure.url} alt="" draggable={false} loading={imageLoading(env.mode)} decoding="async" data-drawn-for={figure.box ? `${figure.box.w}x${figure.box.h}` : undefined} style={{ ...pictureSize(figure), opacity: figure.state === "drawing" ? 0.55 : 1 }} />
      ) : chrome || env.mode === "thumb" ? (
        <EmptyFigure name={name} slot={slot} size={chrome} />
      ) : null}
      {chrome ? <HookBadge figure={figure} /> : null}
    </div>
  );
}

/**
 * The size a picture is drawn at: a hook figure at the box it was made for
 * (top left, clipped by the slot while a redraw for a new box runs), a plain
 * image fitted to the slot.
 */
function pictureSize(figure: FigureState): CSSProperties {
  return figure.box ? { width: `${figure.box.w}pt`, height: `${figure.box.h}pt`, display: "block" } : { width: "100%", height: "100%", objectFit: "contain" };
}

/** Whether a slot's hook state is drawn as a problem. */
export function isDanger(state: FigureState["state"]): boolean {
  return state === "failed" || state === "paused" || state === "stale" || state === "missing";
}

/**
 * The quiet "drawing" mark, or the danger badge, at a hooked slot's top right.
 * Shown in Edit only; sized against the canvas scale so it keeps its size.
 *
 * @param props.figure - the slot's hook state.
 */
export function HookBadge({ figure }: { figure: FigureState }) {
  const env = useSlideEnv();
  if (figure.state === "ok" || figure.state === "none") return null;
  const danger = isDanger(figure.state);
  const scale = env.scale ?? 1;
  return (
    <span
      title={figure.message}
      className="num"
      data-hook-badge={figure.state}
      style={{ position: "absolute", right: 4, top: 4, font: `500 ${11 / scale}px var(--font-mono)`, padding: `${1 / scale}px ${6 / scale}px`, borderRadius: `calc(var(--radius-chip) / ${scale})`, background: danger ? "var(--color-danger)" : "rgb(255 255 255 / 0.85)", color: danger ? "#fff" : "#000", border: danger ? "none" : "1px solid rgb(0 0 0 / 0.12)" }}
    >
      {LABEL[figure.state] ?? figure.state}
    </span>
  );
}

/**
 * An empty figure slot in the editor: a faint dashed frame with the slot's
 * placeholder centred in the pack's caption face and, under it, the box size
 * in small mono. The slide's ink is used at low strength, so the frame reads on
 * every background variant.
 *
 * @param props.size - whether to print the slot name and box size (not in thumbnails).
 */
function EmptyFigure({ name, slot, size }: { name: string; slot: Slot; size: boolean }) {
  const env = useSlideEnv();
  const [, , w, h] = slot.box;
  const caption = env.pack.roles.caption;
  const textPt = Math.min(caption?.size ?? 14, h / 3);
  return (
    <div data-placeholder={placeholderOf(name, slot)} style={{ width: "100%", height: "100%", boxSizing: "border-box", border: "1px dashed color-mix(in srgb, currentColor 22%, transparent)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "3pt", padding: "4pt", overflow: "hidden", textAlign: "center", pointerEvents: "none", userSelect: "none" }}>
      <span style={{ fontFamily: caption ? fontFamilyOf(env.pack, caption) : env.pack.fontFallback, fontSize: `${textPt}pt`, lineHeight: 1.2, opacity: 0.4 }}>{placeholderOf(name, slot)}</span>
      {size && h >= 40 ? (
        <span className="num" style={{ font: "8pt var(--font-mono)", opacity: 0.45, whiteSpace: "nowrap" }}>
          {name} {w} x {h} pt
        </span>
      ) : null}
    </div>
  );
}
