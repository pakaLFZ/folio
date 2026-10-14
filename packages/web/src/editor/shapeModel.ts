/**
 * Shapes as the editor reads and writes them: an added slot `shape:<x>` of
 * role `shape` in the slide's overrides, holding the box, and the slide prop
 * of the same name, holding what is drawn (spec/slides/drawing.md, "Shapes in
 * the editor"). Every length is pt on the canvas; `from` and `to` are pt from
 * the box's top-left corner.
 */
import { clearOverride, overridesPatch, setOverride, setSlotOp, type Box, type PatchOp, type SlideSpec } from "@folio/core";

export type ShapeKind = "rect" | "ellipse" | "arrow" | "line";
export type Pt = [number, number];
export type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";
export type End = "from" | "to";

export interface ShapeContent {
  kind: ShapeKind;
  style?: string;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  dash?: string;
  heads?: string;
  from?: Pt;
  to?: Pt;
  text?: string;
  [key: string]: unknown;
}

export interface Shape {
  name: string;
  box: Box;
  content: ShapeContent;
  /** A text box: moved and resized like a rectangle, its words and look kept apart. */
  text?: boolean;
}

/** The fields each kind takes besides `kind`, as the shape schema allows them (core `shapes.ts`). */
export const KIND_FIELDS: Record<ShapeKind, string[]> = {
  rect: ["style", "fill", "stroke", "strokeWidth", "dash", "radius", "text"],
  ellipse: ["style", "fill", "stroke", "strokeWidth", "dash", "text"],
  arrow: ["style", "stroke", "strokeWidth", "dash", "heads", "from", "to"],
  line: ["style", "stroke", "strokeWidth", "dash", "from", "to"],
};

/** The content with only the fields its kind takes, and none left undefined. */
export function fitted(content: ShapeContent): ShapeContent {
  const allowed = KIND_FIELDS[content.kind];
  return Object.fromEntries(Object.entries(content).filter(([key, v]) => v !== undefined && (key === "kind" || allowed.includes(key)))) as ShapeContent;
}

export const HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export const MIN_DRAG_PT = 4;
const MIN_SIDE = 1;
const KINDS: ShapeKind[] = ["rect", "ellipse", "arrow", "line"];

const tenth = (v: number) => Math.round(v * 10) / 10;
const tenths = (p: Pt): Pt => [tenth(p[0]), tenth(p[1])];
const tree = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const isLinear = (kind: ShapeKind): boolean => kind === "arrow" || kind === "line";

/** The slide's root props. */
export function propsOf(spec: SlideSpec): Record<string, unknown> {
  return spec.elements[spec.root]?.props ?? {};
}

/** Every shape on a slide, read from its overrides and props as written. */
export function shapesOf(props: Record<string, unknown>): Shape[] {
  return Object.entries(tree(tree(props.overrides).slots)).flatMap(([name, raw]) => {
    const slot = tree(raw);
    const box = slot.box;
    if (slot.role !== "shape" || !Array.isArray(box) || box.length !== 4 || !box.every((n) => typeof n === "number")) return [];
    const given = tree(props[name]);
    const kind = KINDS.includes(given.kind as ShapeKind) ? (given.kind as ShapeKind) : "rect";
    return [{ name, box: box as Box, content: { ...given, kind } }];
  });
}

/** `a`..`z`, then `aa`..`zz`. */
function letters(i: number): string {
  const a = "abcdefghijklmnopqrstuvwxyz";
  return i < 26 ? a[i]! : a[Math.floor(i / 26) - 1]! + a[i % 26]!;
}

/** The first `shape:<x>` that names neither a slot override nor a prop. */
export function nextShapeName(props: Record<string, unknown>): string {
  const taken = new Set([...Object.keys(tree(tree(props.overrides).slots)), ...Object.keys(props)]);
  for (let i = 0; ; i++) if (!taken.has(`shape:${letters(i)}`)) return `shape:${letters(i)}`;
}

/** `b` moved onto the nearest 45-degree ray from `a`, keeping its distance. */
export function snap45(a: Pt, b: Pt): Pt {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const length = Math.hypot(dx, dy);
  return tenths([a[0] + Math.cos(angle) * length, a[1] + Math.sin(angle) * length]);
}

/** The box spanned by two points, at least MIN_SIDE on each side. */
function spanBox(a: Pt, b: Pt): Box {
  const [x, y] = [Math.min(a[0], b[0]), Math.min(a[1], b[1])];
  return [tenth(x), tenth(y), tenth(Math.max(MIN_SIDE, Math.abs(b[0] - a[0]))), tenth(Math.max(MIN_SIDE, Math.abs(b[1] - a[1])))];
}

/** An arrow or line from `a` to `b`: its box and its ends inside it. */
export function linearPlacement(a: Pt, b: Pt): { box: Box; from: Pt; to: Pt } {
  const box = spanBox(a, b);
  return { box, from: tenths([a[0] - box[0], a[1] - box[1]]), to: tenths([b[0] - box[0], b[1] - box[1]]) };
}

/** The ends of an arrow or line on the canvas; across the box's middle when not given, as the renderer draws them. */
export function endpoints(shape: Shape): { from: Pt; to: Pt } {
  const [x, y, w, h] = shape.box;
  const from = shape.content.from ?? [0, h / 2];
  const to = shape.content.to ?? [w, h / 2];
  return { from: [x + from[0], y + from[1]], to: [x + to[0], y + to[1]] };
}

/**
 * The shape a drag from `a` to `b` draws.
 *
 * @param square - Shift: a square box, or a 45-degree arrow or line.
 * @returns null for a drag shorter than MIN_DRAG_PT.
 */
export function drawnShape(kind: ShapeKind, a: Pt, b: Pt, square: boolean): { box: Box; content: ShapeContent } | null {
  if (Math.hypot(b[0] - a[0], b[1] - a[1]) < MIN_DRAG_PT) return null;
  if (isLinear(kind)) {
    const { box, from, to } = linearPlacement(a, square ? snap45(a, b) : b);
    return { box, content: { kind, from, to } };
  }
  if (!square) return { box: spanBox(a, b), content: { kind } };
  const side = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]));
  return { box: spanBox(a, [a[0] + Math.sign(b[0] - a[0] || 1) * side, a[1] + Math.sign(b[1] - a[1] || 1) * side]), content: { kind } };
}

/** The shape moved by a delta. */
export function moved(shape: Shape, dx: number, dy: number): Shape {
  const [x, y, w, h] = shape.box;
  return { ...shape, box: [tenth(x + dx), tenth(y + dy), w, h] };
}

/** The ends of a resized arrow or line, scaled with its box. */
function scaledEnds(shape: Shape, box: Box): ShapeContent {
  if (!isLinear(shape.content.kind)) return shape.content;
  const [sx, sy] = [box[2] / shape.box[2], box[3] / shape.box[3]];
  const { from, to } = endpoints(shape);
  const local = (p: Pt): Pt => tenths([(p[0] - shape.box[0]) * sx, (p[1] - shape.box[1]) * sy]);
  return { ...shape.content, from: local(from), to: local(to) };
}

/**
 * The shape with one handle dragged to `p`; the opposite edges stay put.
 *
 * @param keepRatio - Shift: a corner handle keeps the box's proportions.
 */
export function resized(shape: Shape, handle: Handle, p: Pt, keepRatio: boolean): Shape {
  const [x, y, w, h] = shape.box;
  let [left, top, right, bottom] = [x, y, x + w, y + h];
  if (handle.includes("w")) left = p[0];
  if (handle.includes("e")) right = p[0];
  if (handle.includes("n")) top = p[1];
  if (handle.includes("s")) bottom = p[1];
  if (keepRatio && handle.length === 2) {
    const scale = Math.max(Math.abs(right - left) / w, Math.abs(bottom - top) / h);
    if (handle.includes("w")) left = right - Math.sign(right - left || 1) * w * scale;
    else right = left + Math.sign(right - left || 1) * w * scale;
    if (handle.includes("n")) top = bottom - Math.sign(bottom - top || 1) * h * scale;
    else bottom = top + Math.sign(bottom - top || 1) * h * scale;
  }
  const box = spanBox([left, top], [right, bottom]);
  return { ...shape, box, content: scaledEnds(shape, box) };
}

/**
 * An arrow or line with one end dragged to `p`.
 *
 * @param snap - Shift: the end snaps to 45 degrees about the other end.
 */
export function endDragged(shape: Shape, end: End, p: Pt, snap: boolean): Shape {
  const ends = endpoints(shape);
  const fixed = end === "from" ? ends.to : ends.from;
  const moving = snap ? snap45(fixed, p) : tenths(p);
  const placed = end === "from" ? linearPlacement(moving, fixed) : linearPlacement(fixed, moving);
  return { ...shape, box: placed.box, content: { ...shape.content, from: placed.from, to: placed.to } };
}

/** Insert a shape: its slot (a draft unless `draft` is false) and its content, in one patch. */
export function insertOps(spec: SlideSpec, name: string, box: Box, content: ShapeContent, draft = true): PatchOp[] {
  const overrides = setOverride(propsOf(spec).overrides, `slots.${name}`, { role: "shape", box, ...(draft ? { draft: true } : {}) });
  return [...overridesPatch(spec, overrides), setSlotOp(spec, name, fitted(content))];
}

/** Store a shape's or text box's box, and an arrow or line's ends when they changed with it. */
export function placeOps(spec: SlideSpec, shape: Shape): PatchOp[] {
  const overrides = setOverride(propsOf(spec).overrides, `slots.${shape.name}.box`, shape.box);
  const ops = overridesPatch(spec, overrides);
  const stored = propsOf(spec)[shape.name];
  const moves = !shape.text && isLinear(shape.content.kind) && JSON.stringify(stored) !== JSON.stringify(shape.content);
  return moves ? [...ops, setSlotOp(spec, shape.name, fitted(shape.content))] : ops;
}

/** Store a shape's content. */
export function contentOps(spec: SlideSpec, name: string, content: ShapeContent): PatchOp[] {
  return [setSlotOp(spec, name, fitted(content))];
}

/** Remove a shape: its slot override and its prop, in one patch. */
export function deleteOps(spec: SlideSpec, name: string): PatchOp[] {
  const ops = overridesPatch(spec, clearOverride(propsOf(spec).overrides, `slots.${name}`));
  return name in propsOf(spec) ? [...ops, { op: "remove", path: setSlotOp(spec, name, null).path }] : ops;
}

/**
 * A shape or text box as it stands on a slide, for telling whether someone
 * else changed it. A text box's words are left out: they are typed in place
 * and saved with the text slot's own conflict handling, so a save of them
 * does not make a move or a look change a conflict.
 */
export function shapeStamp(spec: SlideSpec, name: string): string {
  const props = propsOf(spec);
  return JSON.stringify([tree(tree(props.overrides).slots)[name] ?? null, name.startsWith("text:") ? null : (props[name] ?? null)]);
}
