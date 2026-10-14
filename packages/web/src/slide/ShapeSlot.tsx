/**
 * A shape slot: a rect, ellipse, arrow or line drawn as SVG at exact pt in its
 * box, the same in the live view, thumbnails, shots and print. A rect or
 * ellipse may hold text, centred in its text box and measured like a text
 * slot; the font never changes to make it fit.
 */
import { useLayoutEffect, useRef } from "react";
import { arrowParts, dashArray, fontFamilyOf, linePitch, placeholderOf, resolveShape, shapeTextBox, type Box, type RefinedSlot, type ResolvedShape } from "@folio/core";
import { useSlideEnv } from "./env";
import { markupToHtml } from "./markupDom";
import { measureText } from "./measure";
import { textStyle } from "./TextSlot";

const JUSTIFY = { top: "flex-start", middle: "center", bottom: "flex-end" } as const;

/**
 * Render a shape slot.
 *
 * @param props.name - the slot name, e.g. `shape:a`.
 * @param props.slot - the slot after the slide's overrides.
 * @param props.box - the box as laid out.
 * @param props.value - the slide's shape, or null.
 * @param props.ink - the background's ink, for `ink` and for text without a colour.
 */
export function ShapeSlot({ name, slot, box, value, ink }: { name: string; slot: RefinedSlot; box: Box; value: unknown; ink: string }) {
  const env = useSlideEnv();
  const [x, y, w, h] = box;
  const shape = resolveShape(env.pack, { ...slot, box }, value, ink);
  const chrome = env.mode === "edit";
  const over = env.overflow[name];
  const limit = env.limits[name];
  const overflowing = !!over && limit !== undefined && over.lines > limit;
  const outline = chrome && (overflowing || env.selectedSlot === name) ? `1px solid ${overflowing ? "var(--color-danger)" : "rgb(0 0 0 / 0.35)"}` : undefined;
  return (
    <div className="folio-slot" data-slot={name} data-shape={shape?.kind} data-overflow={overflowing ? "lines" : undefined} onClick={() => chrome && env.onSelectSlot?.(name)} style={{ left: `${x}pt`, top: `${y}pt`, width: `${w}pt`, height: `${h}pt`, outline, outlineOffset: -1 }}>
      {shape ? <ShapeSvg shape={shape} w={w} h={h} /> : chrome ? <EmptyShape name={name} slot={slot} /> : null}
      {shape?.text && (shape.kind === "rect" || shape.kind === "ellipse") ? <ShapeText name={name} shape={shape} w={w} h={h} ink={ink} /> : null}
    </div>
  );
}

/** The shape's outline and fill, in the box's own pt coordinates. */
function ShapeSvg({ shape, w, h }: { shape: ResolvedShape; w: number; h: number }) {
  const sw = shape.strokeWidth;
  const paint = { fill: shape.fill, stroke: shape.stroke === "none" || sw === 0 ? "none" : shape.stroke, strokeWidth: sw, strokeDasharray: dashArray(shape.dash, sw), strokeLinecap: shape.dash === "dot" ? ("round" as const) : ("butt" as const) };
  return (
    <svg width={`${w}pt`} height={`${h}pt`} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }} aria-hidden>
      {shape.kind === "rect" ? <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, h - sw)} rx={shape.radius} ry={shape.radius} {...paint} /> : null}
      {shape.kind === "ellipse" ? <ellipse cx={w / 2} cy={h / 2} rx={Math.max(0, (w - sw) / 2)} ry={Math.max(0, (h - sw) / 2)} {...paint} /> : null}
      {shape.kind === "arrow" || shape.kind === "line" ? <Arrow shape={shape} paint={paint} /> : null}
    </svg>
  );
}

/** A line or an arrow: the stroked segment, and a filled triangle per head in the stroke colour. */
function Arrow({ shape, paint }: { shape: ResolvedShape; paint: Record<string, unknown> }) {
  const { line, heads } = arrowParts(shape.from, shape.to, shape.strokeWidth, shape.heads);
  return (
    <>
      <line x1={line[0][0]} y1={line[0][1]} x2={line[1][0]} y2={line[1][1]} {...paint} fill="none" />
      {heads.map((points, i) => (
        <polygon key={i} points={points.map((p) => p.join(",")).join(" ")} fill={shape.stroke} stroke="none" />
      ))}
    </>
  );
}

/** The text of a rect or ellipse: centred in its text box, measured after every layout. */
function ShapeText({ name, shape, w, h, ink }: { name: string; shape: ResolvedShape; w: number; h: number; ink: string }) {
  const env = useSlideEnv();
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [tx, ty, tw, th] = shapeTextBox(shape.kind as "rect" | "ellipse", w, h, shape.strokeWidth);
  const style = shape.textStyle;
  useLayoutEffect(() => {
    if (!textRef.current || !boxRef.current) return;
    textRef.current.innerHTML = markupToHtml(shape.text ?? "", env.pack.colors, ink);
    env.onSlotMeasured?.(measureText(name, textRef.current, boxRef.current, linePitch(style), true));
  });
  const css = textStyle({ name, slot: {} as RefinedSlot, style, lineLimit: 0 }, fontFamilyOf(env.pack, style), ink, env.pack.colors);
  return (
    <div ref={boxRef} data-shape-text="" style={{ position: "absolute", left: `${tx}pt`, top: `${ty}pt`, width: `${tw}pt`, height: `${th}pt`, display: "flex", flexDirection: "column", justifyContent: JUSTIFY[style.anchor], pointerEvents: "none" }}>
      <div ref={textRef} className="folio-text" style={{ ...css, flexShrink: 0 }} />
    </div>
  );
}

/** An empty shape slot in the editor: a faint dashed frame with its placeholder. */
function EmptyShape({ name, slot }: { name: string; slot: RefinedSlot }) {
  return (
    <div data-placeholder={placeholderOf(name, slot)} style={{ width: "100%", height: "100%", boxSizing: "border-box", border: "1px dashed color-mix(in srgb, currentColor 22%, transparent)", display: "grid", placeItems: "center", opacity: 0.6, pointerEvents: "none", userSelect: "none", fontSize: "10pt" }}>
      <span style={{ opacity: 0.6 }}>{placeholderOf(name, slot)}</span>
    </div>
  );
}
