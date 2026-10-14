/**
 * Adding and removing a shape as one slide patch: the added slot in the
 * slide's overrides and its content in the slide's props, written together.
 * Validation of the result is the write check's (`slideWriteRefusal`).
 */
import { clearOverride, overridesPatch, setOverride } from "./overridepaths.js";
import { slideLayout } from "./overrides.js";
import type { Box, Pack } from "./pack.js";
import { pointerToken, type PatchOp } from "./patch.js";
import { slideRoot, type SlideSpec } from "./schema.js";
import type { Point } from "./shapegeometry.js";
import { nextShapeName, type ShapeKind, type ShapeValue } from "./shapes.js";

/** The margin round an arrow or line placed by its end points alone, pt. */
export const ARROW_BOX_MARGIN = 12;

/** What an agent asks for: a kind (or `circle`), a box or two end points, and the shape's own fields. */
export interface ShapeRequest {
  kind: ShapeKind | "circle";
  box?: number[];
  from?: Point;
  to?: Point;
  fields?: Omit<ShapeValue, "kind" | "from" | "to">;
}

export type ShapeEdit = { ok: true; name: string; ops: PatchOp[] } | { ok: false; reason: string };

/**
 * The box and end points of a request.
 *
 * @returns the box (`x,y,d` for a circle grows to a square), the end points
 *   relative to it, or why the request has no box: an arrow or line given only
 *   end points gets a box round them with a 12 pt margin, the points in slide pt.
 */
export function shapePlacement(req: ShapeRequest): { box: Box; from?: Point; to?: Point } | { reason: string } {
  const linear = req.kind === "arrow" || req.kind === "line";
  if (!req.box) {
    if (!linear || !req.from || !req.to) return { reason: `a ${req.kind} needs --box x,y,w,h${linear ? ", or --from x,y and --to x,y in slide pt" : ""}` };
    const [x, y] = [Math.min(req.from[0], req.to[0]) - ARROW_BOX_MARGIN, Math.min(req.from[1], req.to[1]) - ARROW_BOX_MARGIN];
    const box: Box = [x, y, Math.abs(req.to[0] - req.from[0]) + 2 * ARROW_BOX_MARGIN, Math.abs(req.to[1] - req.from[1]) + 2 * ARROW_BOX_MARGIN];
    return { box, from: [req.from[0] - x, req.from[1] - y], to: [req.to[0] - x, req.to[1] - y] };
  }
  const square = req.kind === "circle" && req.box.length === 3;
  const box = (square ? [...req.box, req.box[2]] : req.box) as number[];
  if (box.length !== 4 || box.some((n) => !Number.isFinite(n))) return { reason: `--box is x,y,w,h in pt${req.kind === "circle" ? " (or x,y,d for a circle)" : ""}, e.g. 100,120,200,80` };
  if (req.kind === "circle" && box[2] !== box[3]) return { reason: `a circle is an ellipse in a square box; give --box x,y,d or equal w and h (got ${box[2]} x ${box[3]}), or use ellipse` };
  return { box: box as Box, from: req.from, to: req.to };
}

/**
 * The patch that adds a shape as the slide's next free `shape:<letter>` slot.
 *
 * @param spec - the slide as stored.
 * @param pack - the deck's pack.
 * @returns the slot name and the patch (overrides and content in one write),
 *   or why the request cannot be placed.
 */
export function shapeAdd(spec: SlideSpec, pack: Pack, req: ShapeRequest): ShapeEdit {
  const root = slideRoot(spec);
  const layout = root && pack.layouts[root.layout] ? slideLayout(pack, root.layout, root.props) : undefined;
  if (!root || !layout) return { ok: false, reason: "the slide has no layout of its pack" };
  const placed = shapePlacement(req);
  if ("reason" in placed) return { ok: false, reason: placed.reason };
  const overrides = root.props.overrides as { slots?: Record<string, unknown> } | undefined;
  const name = nextShapeName([...Object.keys(layout.slots), ...Object.keys(overrides?.slots ?? {}), ...Object.keys(root.props)]);
  const value: ShapeValue = { kind: req.kind === "circle" ? "ellipse" : req.kind, ...req.fields, ...(placed.from ? { from: placed.from } : {}), ...(placed.to ? { to: placed.to } : {}) };
  const ops = overridesPatch(spec, setOverride(overrides, `slots.${name}`, { role: "shape", box: placed.box }));
  ops.push({ op: "add", path: `/elements/${pointerToken(spec.root)}/props/${pointerToken(name)}`, value });
  return { ok: true, name, ops };
}

/**
 * The patch that removes a shape: its added slot and its content; a shape
 * slot of the layout keeps its slot and loses its content.
 *
 * @returns the patch, or why there is no such shape.
 */
export function shapeRemove(spec: SlideSpec, pack: Pack, name: string): ShapeEdit {
  const root = slideRoot(spec);
  const base = root && pack.layouts[root.layout];
  if (!root || !base) return { ok: false, reason: "the slide has no layout of its pack" };
  const layout = slideLayout(pack, root.layout, root.props)!;
  const shapes = Object.entries(layout.slots).filter(([, s]) => s.role === "shape").map(([n]) => n);
  if (!shapes.includes(name)) return { ok: false, reason: `"${name}" is not a shape slot of this slide (shapes: ${shapes.join(", ") || "none"})` };
  const ops = base.slots[name] ? [] : overridesPatch(spec, clearOverride(root.props.overrides, `slots.${name}`));
  if (name in root.props) ops.push({ op: "remove", path: `/elements/${pointerToken(spec.root)}/props/${pointerToken(name)}` });
  return ops.length ? { ok: true, name, ops } : { ok: false, reason: `${name} is a shape slot of the layout and already empty` };
}
