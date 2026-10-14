/**
 * What the shape layer draws: the hit areas that take a press on a shape or a
 * text box's edge, the outline of a drag, the selection frame with its
 * handles, and the alignment guides. Every size is screen px at any zoom
 * (`unit` is one screen px in pt).
 */
import type { PointerEvent as ReactPointerEvent } from "react";
import { endpoints, HANDLES, isLinear, type End, type Handle, type Pt, type Shape } from "./shapeModel";
import type { Guide } from "./snap";

const FRAME_INK = "#111111";
const HALO = "#ffffff";
const GUIDE_INK = "#0a84ff";
const HANDLE_PX = 8;
const HIT_PX = 12;
const EDGE_PX = 6;
/** How far outside the box a handle's pointer area reaches. */
const OUTSIDE_PX = 8;
const CURSORS: Record<Handle, string> = { nw: "nwse-resize", se: "nwse-resize", ne: "nesw-resize", sw: "nesw-resize", n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize" };

/** The invisible body that takes a press on a shape. */
export function HitArea({ shape, unit, onDown }: { shape: Shape; unit: number; onDown: (e: ReactPointerEvent) => void }) {
  const [x, y, w, h] = shape.box;
  const common = { "data-shape-hit": shape.name, onPointerDown: onDown, style: { cursor: "move" } };
  if (isLinear(shape.content.kind)) {
    const { from, to } = endpoints(shape);
    return <line {...common} x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke="transparent" strokeWidth={HIT_PX * unit} pointerEvents="stroke" />;
  }
  if (shape.content.kind === "ellipse") return <ellipse {...common} cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="transparent" pointerEvents="all" />;
  return <rect {...common} x={x} y={y} width={w} height={h} fill="transparent" pointerEvents="all" />;
}

/**
 * The outline of a shape being drawn, inverting whatever colour lies under
 * each part of it (`mix-blend-mode: difference` on a white stroke), so it
 * reads on any background without a fixed colour. *(Superseded 2026-10-14: a
 * fixed white halo under the ink dash.)*
 */
export function Outline({ shape, unit }: { shape: Shape; unit: number }) {
  const [x, y, w, h] = shape.box;
  const stroke = { stroke: "#ffffff", strokeWidth: unit, strokeDasharray: `${4 * unit} ${3 * unit}`, fill: "none", style: { mixBlendMode: "difference" as const } };
  if (isLinear(shape.content.kind)) {
    const { from, to } = endpoints(shape);
    return <line data-shape-outline="" x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} {...stroke} />;
  }
  if (shape.content.kind === "ellipse") return <ellipse data-shape-outline="" cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} {...stroke} />;
  return <rect data-shape-outline="" x={x} y={y} width={w} height={h} {...stroke} />;
}

/** One square handle, a white fill in an ink ring, the same size at any zoom. */
function Grip({ at, unit, name, cursor, onDown }: { at: Pt; unit: number; name: string; cursor: string; onDown: (e: ReactPointerEvent) => void }) {
  const side = HANDLE_PX * unit;
  return <rect data-shape-handle={name} x={at[0] - side / 2} y={at[1] - side / 2} width={side} height={side} fill={HALO} stroke={FRAME_INK} strokeWidth={unit} pointerEvents="all" style={{ cursor }} onPointerDown={onDown} />;
}

/** Where each box handle sits: on the box's corners and edge midpoints. */
function handleAt(handle: Handle, [x, y, w, h]: Shape["box"]): Pt {
  const hx = handle.includes("w") ? x : handle.includes("e") ? x + w : x + w / 2;
  const hy = handle.includes("n") ? y : handle.includes("s") ? y + h : y + h / 2;
  return [hx, hy];
}

/**
 * Where a box handle takes the pointer: only outside the box, OUTSIDE_PX
 * deep, so the inside of the box (a text's first character) stays the
 * content's. A corner takes the square beyond its corner, a side a strip
 * 1.5 handles wide beyond its edge.
 */
function handleHit(handle: Handle, box: Shape["box"], unit: number): Shape["box"] {
  const [hx, hy] = handleAt(handle, box);
  const [depth, side] = [OUTSIDE_PX * unit, 1.5 * HANDLE_PX * unit];
  const x = handle.includes("w") ? hx - depth : handle.includes("e") ? hx : hx - side / 2;
  const y = handle.includes("n") ? hy - depth : handle.includes("s") ? hy : hy - side / 2;
  return [x, y, handle.includes("w") || handle.includes("e") ? depth : side, handle.includes("n") || handle.includes("s") ? depth : side];
}

/** A box handle: its square drawn centred on the edge, as PowerPoint draws it, and its pointer area outside the box. */
function BoxGrip({ handle, box, unit, onDown }: { handle: Handle; box: Shape["box"]; unit: number; onDown: (e: ReactPointerEvent) => void }) {
  const [at, side] = [handleAt(handle, box), HANDLE_PX * unit];
  const [x, y, w, h] = handleHit(handle, box, unit);
  return (
    <>
      <rect data-shape-grip={handle} x={at[0] - side / 2} y={at[1] - side / 2} width={side} height={side} fill={HALO} stroke={FRAME_INK} strokeWidth={unit} pointerEvents="none" />
      <rect data-shape-handle={handle} x={x} y={y} width={w} height={h} fill="transparent" pointerEvents="all" style={{ cursor: CURSORS[handle] }} onPointerDown={onDown} />
    </>
  );
}

/** The selected shape's frame and handles, on its box itself: eight on a box, one at each end of an arrow or line. */
export function Selection({ shape, unit, onHandle, onEnd }: { shape: Shape; unit: number; onHandle: (e: ReactPointerEvent, h: Handle) => void; onEnd: (e: ReactPointerEvent, end: End) => void }) {
  const [x, y, w, h] = shape.box;
  if (isLinear(shape.content.kind)) {
    const { from, to } = endpoints(shape);
    return (
      <g data-shape-selected={shape.name}>
        <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} stroke={FRAME_INK} strokeWidth={unit} strokeDasharray={`${4 * unit} ${3 * unit}`} pointerEvents="none" />
        <Grip at={from} unit={unit} name="from" cursor="crosshair" onDown={(e) => onEnd(e, "from")} />
        <Grip at={to} unit={unit} name="to" cursor="crosshair" onDown={(e) => onEnd(e, "to")} />
      </g>
    );
  }
  return (
    <g data-shape-selected={shape.name}>
      <rect x={x} y={y} width={w} height={Math.max(0, h)} fill="none" stroke={HALO} strokeWidth={3 * unit} pointerEvents="none" />
      <rect data-shape-frame="" x={x} y={y} width={w} height={Math.max(0, h)} fill="none" stroke={FRAME_INK} strokeWidth={unit} pointerEvents="none" />
      {HANDLES.map((handle) => <BoxGrip key={handle} handle={handle} box={shape.box} unit={unit} onDown={(e) => onHandle(e, handle)} />)}
    </g>
  );
}

/**
 * The edge band of a text box: a strip EDGE_PX wide just outside its
 * outline, which moves the box. It never reaches inside, so a press on the
 * text (even its first character, flush with the box) is the text's, for
 * typing and selecting.
 */
export function EdgeBand({ shape, unit, onDown, onDouble }: { shape: Shape; unit: number; onDown: (e: ReactPointerEvent) => void; onDouble?: () => void }) {
  const [x, y, w, h] = shape.box;
  const band = EDGE_PX * unit;
  return <rect data-shape-hit={shape.name} data-edge="" x={x - band / 2} y={y - band / 2} width={w + band} height={Math.max(0, h) + band} fill="none" stroke="transparent" strokeWidth={band} pointerEvents="stroke" style={{ cursor: "move" }} onPointerDown={onDown} onDoubleClick={onDouble} />;
}

/** The guides a drag snapped to: thin lines across the canvas. */
export function Guides({ guides, canvas, unit }: { guides: Guide[]; canvas: { w: number; h: number }; unit: number }) {
  return (
    <g data-guides={guides.length} pointerEvents="none">
      {guides.map((g, i) => (g.axis === "x" ? <line key={i} data-guide="x" x1={g.at} x2={g.at} y1={0} y2={canvas.h} stroke={GUIDE_INK} strokeWidth={unit} /> : <line key={i} data-guide="y" x1={0} x2={canvas.w} y1={g.at} y2={g.at} stroke={GUIDE_INK} strokeWidth={unit} />))}
    </g>
  );
}

/** The frame of a selected element that does not move: a template slot, a figure, a table. */
export function ElementFrame({ name, box, unit }: { name: string; box: Shape["box"]; unit: number }) {
  const [x, y, w, h] = box;
  return (
    <g data-element-selected={name} pointerEvents="none">
      <rect x={x} y={y} width={w} height={Math.max(0, h)} fill="none" stroke={HALO} strokeWidth={3 * unit} />
      <rect x={x} y={y} width={w} height={Math.max(0, h)} fill="none" stroke={FRAME_INK} strokeWidth={unit} />
    </g>
  );
}
