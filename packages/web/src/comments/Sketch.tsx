/**
 * The comment layer over the slide, in canvas units, drawn only in Edit.
 * Which tool is chosen decides what a press on the slide does: with the Cursor
 * tool the layer takes no pointer at all, so text slots get every press; with
 * Region a drag sets the region (a click takes the slot under the pointer,
 * the topmost one where slots overlap), and Pen, Rectangle and Arrow draw
 * marks. Of the existing comments only
 * the selected one shows, with its region and marks, or one of its earlier
 * screenshots when a "then" step is chosen; with none selected nothing of
 * them is drawn. No pins.
 */
import { useRef, useState, type PointerEvent, type RefObject } from "react";
import { slideLayout, type Box, type Layout, type Mark, type Pack } from "@folio/core";
import type { DeckState } from "../editor/deckState";
import { MarkShape, MarksLayer, RegionOverlay } from "./marks";
import { eraseDraft } from "./erase";
import eraserCursor from "./eraser-cursor.svg?url";
import selectCursor from "./select-cursor.svg?url";
import penCursor from "./pen-cursor.svg?url";
import rectCursor from "./rect-cursor.svg?url";
import arrowCursor from "./arrow-cursor.svg?url";

/** The pointer each comment tool shows over a slide; the Cursor tool keeps the browser's own. */
export function toolCursor(tool: Tool): string {
  return { cursor: "auto", region: `url("${selectCursor}") 8 8, crosshair`, pen: `url("${penCursor}") 7 25, crosshair`, rect: `url("${rectCursor}") 6 6, crosshair`, arrow: `url("${arrowCursor}") 7 25, crosshair`, eraser: `url("${eraserCursor}") 6 25, auto` }[tool];
}
import type { Tool, CommentsModel } from "./useComments";

/**
 * Convert a pointer position to canvas units.
 *
 * @returns `[x, y]` in pt on the pack canvas.
 */
function toCanvas(svg: SVGSVGElement, e: PointerEvent): [number, number] {
  const m = svg.getScreenCTM();
  if (!m) return [0, 0];
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
}

/** The box spanned by two points. */
function spanBox(a: [number, number], b: [number, number]): Box {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])];
}

/** The slot under a point, picking the one painted last (topmost) where slots overlap. */
function topmostSlotAt(layout: Layout, [x, y]: [number, number]) {
  const slots = Object.values(layout.slots);
  for (let i = slots.length - 1; i >= 0; i--) {
    const s = slots[i]!;
    if (x >= s.box[0] && x <= s.box[0] + s.box[2] && y >= s.box[1] && y <= s.box[1] + s.box[3]) return s;
  }
  return undefined;
}

/**
 * The layer.
 *
 * @param props.model - the comments model.
 * @param props.state - the deck state, for the current slide and mode.
 * @param props.pack - the deck's pack, for the canvas and slot boxes.
 */
export function Sketch({ model, state, pack }: { model: CommentsModel; state: DeckState; pack: Pack }) {
  const svg = useRef<SVGSVGElement>(null);
  const slide = state.current;
  const active = state.mode === "edit";
  const sketching = active && model.tool !== "cursor";
  const focused = model.comments.find((c) => c.id === model.focus && c.slide === slide);
  const draft = model.draft?.slide === slide ? model.draft : null;
  const record = slide ? state.slides[slide] : undefined;
  const root = record?.spec ? record.spec.elements[record.spec.root] : undefined;
  const layout = root ? slideLayout(pack, root.type, root.props) : undefined;
  const { live, setLive, down, move, up } = usePointerSketch(svg, model, sketching, layout, !!draft);
  const cursor = toolCursor(model.tool);
  if (!active) return null;
  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: sketching ? undefined : "none", cursor }}>
      {focused ? <MarksLayer canvas={pack.canvas} region={focused.region} marks={focused.marks} /> : null}
      {draft ? <MarksLayer canvas={pack.canvas} region={draft.region} marks={draft.marks} /> : null}
      <svg ref={svg} data-sketch-input={sketching || undefined} viewBox={`0 0 ${pack.canvas.w} ${pack.canvas.h}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible" }} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => setLive(null)}>
        {live && live.tool !== "region" && live.tool !== "eraser" ? <MarkShape mark={{ tool: live.tool as Mark["tool"], points: live.points }} /> : null}
      </svg>
      {live && live.tool === "region" && live.points.length > 1 ? <RegionOverlay canvas={pack.canvas} region={spanBox(live.points[0]!, live.points[live.points.length - 1]!)} /> : null}
    </div>
  );
}

/**
 * Drawing with the pointer: a drag sets the region (a click takes the slot
 * under it), and the pen, rectangle and arrow tools add marks to the draft.
 *
 * @returns the stroke in progress and the pointer handlers.
 */
function usePointerSketch(svg: RefObject<SVGSVGElement | null>, model: CommentsModel, active: boolean, layout: Layout | undefined, hasDraft: boolean) {
  const [live, setLive] = useState<{ tool: string; points: [number, number][] } | null>(null);
  const down = (e: PointerEvent<SVGSVGElement>) => {
    if (!active || !svg.current || e.button !== 0 || (model.tool === "eraser" && !hasDraft)) return;
    svg.current.setPointerCapture(e.pointerId);
    setLive({ tool: model.tool, points: [toCanvas(svg.current, e)] });
  };
  const move = (e: PointerEvent<SVGSVGElement>) => {
    if (!live || !svg.current) return;
    const p = toCanvas(svg.current, e);
    setLive({ ...live, points: live.tool === "pen" || live.tool === "eraser" ? [...live.points, p] : [live.points[0]!, p] });
  };
  const up = () => {
    if (!live) return;
    const [a, b] = [live.points[0]!, live.points[live.points.length - 1]!];
    const tiny = Math.hypot(b[0] - a[0], b[1] - a[1]) < 4;
    setLive(null);
    if (live.tool === "eraser") {
      model.editDraft((d) => eraseDraft(d, live.points));
    } else if (live.tool === "region") {
      const hit = tiny && layout ? topmostSlotAt(layout, a) : undefined;
      const region = tiny ? (hit ? hit.box : null) : spanBox(a, b);
      if (region) model.editDraft((d) => ({ ...d, region: [...region] as Box }));
    } else if (!tiny || live.tool === "pen") model.editDraft((d) => ({ ...d, marks: [...d.marks, { tool: live.tool as Mark["tool"], points: live.points }] }));
  };
  return { live, setLive, down, move, up };
}
