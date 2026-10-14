/**
 * The shape layer over the slide in Edit, in canvas pt: with the Shape or
 * Text tool a drag draws a shape or a text box; with the Cursor tool a shape
 * takes a press on its body and a text box on its edge (its inside is for
 * typing), and the selected one shows its frame and handles. Every slot of
 * the layout is such a box too (slotBoxes.ts): a text slot or block by its
 * edge, a figure, table or layout shape by its body. Drags snap to
 * the slide's other slots, its edges and its centre lines unless Alt is held,
 * with guides showing what they snapped to. Pointer positions go through the
 * canvas's own transform, so zoom and pan never shift them. The slide
 * renderer draws the shapes and text; this layer draws only the drag's
 * outline, the selection, the guides and the hit areas.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { slideLayout, type Box, type Pack } from "@folio/core";
import { useSlideEnv } from "../slide/env";
import { PX_PER_PT } from "../slide/measure";
import type { DeckState, DeckStore } from "./deckState";
import { applyDrag, drawn, preview, type Drag, type SnapContext } from "./shapeDrag";
import { EdgeBand, ElementFrame, Guides, HitArea, Outline, Selection } from "./shapeMarks";
import { fitted, insertOps, nextShapeName, propsOf, type Pt, type Shape } from "./shapeModel";
import { editText } from "./ShapeTools";
import { allItems, boxOps, drawnBox } from "./slotBoxes";
import { writeBox, writeShape } from "./shapeWrites";
import { clearPreview, showPreview } from "./boxPreview";
import { SNAP_PX, snapTargets } from "./snap";
import { insertTextOps, nextTextBoxName } from "./textBoxModel";
import { insertBlockOps, nextBlockName } from "./blockModel";
import { holdTyping, type HeldTyping } from "./typeAhead";

/** A pointer position in canvas pt. */
function toCanvas(svg: SVGSVGElement, e: { clientX: number; clientY: number }): Pt {
  const m = svg.getScreenCTM();
  if (!m) return [0, 0];
  const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
  return [Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10];
}

/** Put the caret in a slot of the slide in view once it is drawn, typing into it what was held meanwhile. */
function caretInto(name: string, held: HeldTyping, frames = 60): void {
  requestAnimationFrame(() => {
    const el = document.querySelector(`main [data-slot="${CSS.escape(name)}"] .folio-text`) as HTMLElement | null;
    if (el || frames <= 0) held.release(el);
    else caretInto(name, held, frames - 1);
  });
}

/** Write a new shape or text box from a draw drag, select it, and drop the tool. */
function finishDraw(store: DeckStore, pack: Pack, id: string, drag: Extract<Drag, { kind: "draw" }>, ctx: SnapContext): void {
  const made = drawn(drag, ctx);
  const spec = store.get().slides[id]?.spec;
  if (!made || !spec) return;
  const block = drag.tool === "text" ? store.get().blockNext : null;
  if (block) {
    const name = nextBlockName(spec, pack);
    const held = holdTyping();
    const draft = !store.get().nextFinal;
    void writeShape(store, id, name, (now) => insertBlockOps(now, pack, made.box, block, draft)).then(() => caretInto(name, held));
    return store.set((s) => ({ ...s, textTool: false, selectedSlot: name }));
  }
  if (drag.tool === "text") {
    const name = nextTextBoxName(spec);
    const held = holdTyping();
    const look = store.get().textNext ?? {};
    const draft = !store.get().nextFinal;
    void writeShape(store, id, name, (now) => insertTextOps(now, pack, name, made.box, look, draft)).then(() => caretInto(name, held));
    return store.set((s) => ({ ...s, textTool: false, selectedSlot: name }));
  }
  const name = nextShapeName(propsOf(spec));
  const content = fitted({ ...store.get().shapeNext, ...made.content });
  const draft = !store.get().nextFinal;
  void writeShape(store, id, name, (now) => insertOps(now, name, made.box, content, draft));
  store.set((s) => ({ ...s, shapeTool: false, selectedSlot: name }));
}

/** Write what a finished drag made: a new item, or an item's new place. */
function finish(store: DeckStore, pack: Pack, id: string, drag: Drag, ctx: SnapContext): Promise<void> {
  if (drag.kind === "draw") return finishDraw(store, pack, id, drag, ctx), Promise.resolve();
  if (drag.kind === "move" && Math.hypot(drag.b[0] - drag.a[0], drag.b[1] - drag.a[1]) < 0.5) return Promise.resolve();
  return writeBox(store, id, drag.name, (now) => {
    const item = allItems(pack, now, drawnBox).find((s) => s.name === drag.name);
    return item ? boxOps(pack, now, applyDrag(drag, item, ctx).shape) : [];
  });
}

/**
 * The drag in progress, followed on the window so it survives leaving the slide.
 *
 * @param context - where the drag may snap, read when it moves and ends.
 * @returns the drag and a way to start one.
 */
function useShapeDrag(svg: RefObject<SVGSVGElement | null>, store: DeckStore, pack: Pack, id: string | null, context: (drag: Drag) => SnapContext) {
  const [drag, setDrag] = useState<Drag | null>(null);
  const latest = useRef({ drag, context });
  latest.current = { drag, context };
  const active = drag !== null;
  useEffect(() => {
    if (!active) return;
    const move = (e: PointerEvent) => {
      const d = latest.current.drag;
      if (d && svg.current) setDrag({ ...d, b: toCanvas(svg.current, e), shift: e.shiftKey, free: e.altKey } as Drag);
    };
    const up = () => {
      const d = latest.current.drag;
      setDrag(null);
      const shown = store.get().preview;
      if (d && id) void finish(store, pack, id, d, latest.current.context(d)).finally(() => clearPreview(store, shown));
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setDrag(null);
      clearPreview(store);
    };
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
    addEventListener("keydown", escape, true);
    return () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      removeEventListener("keydown", escape, true);
    };
  }, [active, id, store, pack, svg]);
  const begin = (e: ReactPointerEvent, start: (p: Pt) => Drag) => {
    if (e.button !== 0 || !svg.current) return;
    e.stopPropagation();
    e.preventDefault();
    (document.activeElement as HTMLElement | null)?.blur?.();
    setDrag(start(toCanvas(svg.current, e)));
  };
  return { drag, begin };
}

/** While a box is dragged, draw the slide with the box where the drag has it (boxPreview.ts). */
function useLivePreview(store: DeckStore, pack: Pack, id: string | null, moving: Shape | null): void {
  const key = moving ? JSON.stringify([moving.name, moving.box, moving.content]) : "";
  const latest = useRef(moving);
  latest.current = moving;
  useLayoutEffect(() => {
    if (key && id && latest.current) showPreview(store, pack, id, latest.current);
  }, [key, id, store, pack]);
}

/** Every slot box of the current slide with its name, template and added, to snap to. */
function useSlotBoxes(pack: Pack, state: DeckState): [string, Box][] {
  const root = state.current ? state.slides[state.current]?.spec : null;
  return useMemo(() => {
    const element = root?.elements[root.root];
    const layout = element ? slideLayout(pack, element.type, element.props) : undefined;
    return layout ? Object.entries(layout.slots).map(([name, slot]) => [name, slot.box] as [string, Box]) : [];
  }, [pack, root]);
}

/**
 * The layer.
 *
 * @param props.store - the deck store.
 * @param props.state - the deck state.
 */
export function ShapeLayer({ store, state }: { store: DeckStore; state: DeckState }) {
  const env = useSlideEnv();
  const svg = useRef<SVGSVGElement>(null);
  const id = state.current;
  const spec = id ? state.slides[id]?.spec : null;
  const items = useMemo(() => (spec ? allItems(env.pack, spec, drawnBox) : []), [env.pack, spec]);
  const boxes = useSlotBoxes(env.pack, state);
  const unit = 1 / ((env.scale ?? 1) * PX_PER_PT);
  const context = (drag: Drag): SnapContext => ({ targets: snapTargets(boxes.filter(([name]) => drag.kind === "draw" || name !== drag.name).map(([, b]) => b), env.pack.canvas), tol: SNAP_PX * unit });
  const { drag, begin } = useShapeDrag(svg, store, env.pack, id, context);
  useDeselectOutside(store, state.selectedSlot !== null);
  const shown = drag ? preview(drag, items, context(drag)) : null;
  useLivePreview(store, env.pack, id, drag && drag.kind !== "draw" ? (shown?.shape ?? null) : null);
  if (state.mode !== "edit" || !id) return null;
  const tool = state.shapeTool ? (state.shapeNext?.kind ?? "rect") : state.textTool ? "text" : null;
  const selected = (drag && drag.kind !== "draw" ? shown?.shape : null) ?? items.find((s) => s.name === state.selectedSlot);
  const select = (name: string) => store.set((s) => ({ ...s, selectedSlot: name }));
  const moveFrom = (s: Shape) => (e: ReactPointerEvent) => (select(s.name), begin(e, (p) => ({ kind: "move", name: s.name, a: p, b: p, free: e.altKey })));
  return (
    <svg ref={svg} data-shape-layer="" data-shape-tool={tool ?? undefined} viewBox={`0 0 ${env.pack.canvas.w} ${env.pack.canvas.h}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: tool ? "all" : "none", cursor: tool ? "crosshair" : undefined }} onPointerDown={(e) => tool && begin(e, (p) => ({ kind: "draw", tool, a: p, b: p, shift: e.shiftKey, free: e.altKey }))}>
      {tool ? null : items.map((s) => (s.text ? <EdgeBand key={s.name} shape={s} unit={unit} onDown={moveFrom(s)} onDouble={() => editText(s.name)} /> : <HitArea key={s.name} shape={s} unit={unit} onDown={moveFrom(s)} />))}
      {drag?.kind === "draw" && shown ? <Outline shape={shown.shape} unit={unit} /> : null}
      {selected ? <Selection shape={selected} unit={unit} onHandle={(e, handle) => begin(e, (p) => ({ kind: "resize", name: selected.name, handle, a: p, b: p, shift: e.shiftKey, free: e.altKey }))} onEnd={(e, end) => begin(e, (p) => ({ kind: "end", name: selected.name, end, b: p, shift: e.shiftKey, free: e.altKey }))} /> : null}
      {!selected && state.selectedSlot ? <SlotFrame name={state.selectedSlot} boxes={boxes} unit={unit} /> : null}
      {shown?.guides.length ? <Guides guides={shown.guides} canvas={env.pack.canvas} unit={unit} /> : null}
    </svg>
  );
}

/**
 * A left press on the slide outside every element (no slot, shape hit area
 * or handle) deselects the selected element. A press inside an element
 * leaves the selection to that element: a click inside a text box that
 * already holds the caret keeps it selected, since no new focus selects it
 * again (the bug of 2026-10-13, spec/slides/drawing.md).
 */
function useDeselectOutside(store: DeckStore, selected: boolean): void {
  useEffect(() => {
    if (!selected) return;
    const down = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (e.button === 0 && target?.closest("main .folio-slide") && !target.closest("[data-slot],[data-shape-hit],[data-shape-handle]")) store.set((s) => ({ ...s, selectedSlot: null }));
    };
    addEventListener("pointerdown", down, true);
    return () => removeEventListener("pointerdown", down, true);
  }, [store, selected]);
}

/** The frame of a selected slot that is not a shape or text box. */
function SlotFrame({ name, boxes, unit }: { name: string; boxes: [string, Box][]; unit: number }) {
  const box = boxes.find(([n]) => n === name)?.[1];
  return box ? <ElementFrame name={name} box={box} unit={unit} /> : null;
}
