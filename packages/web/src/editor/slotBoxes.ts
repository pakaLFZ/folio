/**
 * Every slot of a slide as a box the shape layer moves and resizes, as
 * PowerPoint treats a placeholder (spec/slides/drawing.md, "Layout slots as
 * boxes"): the added shapes, text boxes and blocks, and every other slot of
 * the slide's layout with its overrides laid over it. A move or resize is the
 * slot's `overrides.slots.<name>.box`; a slot the layout flows `below`
 * another also gets `below: null`, so it stays where it was put. Resetting
 * clears exactly those two paths.
 */
import { clearOverride, isTextRole, overridesPatch, setOverride, setSlotOp, slideLayout, type Box, type Pack, type PatchOp, type Role, type SlideSpec } from "@folio/core";
import { blocksOf } from "./blockModel";
import { placeOps, propsOf, shapesOf, type Pt, type Shape } from "./shapeModel";
import { textBoxesOf } from "./textBoxModel";

/** Where a slot that flows below another is drawn now, or null to use its declared box. */
export type FlowedBox = (name: string) => Box | null;

const tree = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const overrideOf = (spec: SlideSpec, name: string) => tree(tree(tree(propsOf(spec).overrides).slots)[name]);
const noFlow: FlowedBox = () => null;

/** The shapes, text boxes and blocks a slide added: moved by their own rules (a shape by its body, a text by its edge). */
export function addedItems(props: Record<string, unknown>): Shape[] {
  return [...shapesOf(props), ...textBoxesOf(props), ...blocksOf(props)];
}

/** The slot as the slide's layout declares it, before this slide's overrides; undefined for an added slot. */
function baseSlot(pack: Pack, spec: SlideSpec, name: string) {
  const root = spec.elements[spec.root];
  return root ? pack.layouts[root.type]?.slots[name] : undefined;
}

/**
 * Every slot of a slide as a box: the layout's slots (and any other added
 * slot, a figure or table) first, then the added shapes, text boxes and
 * blocks, so these lie on top for the pointer as they do on the slide.
 *
 * @param flowed - the drawn box of a slot placed `below` another.
 */
export function allItems(pack: Pack, spec: SlideSpec, flowed: FlowedBox = noFlow): Shape[] {
  const root = spec.elements[spec.root];
  const layout = root ? slideLayout(pack, root.type, root.props) : undefined;
  const added = addedItems(propsOf(spec));
  const taken = new Set(added.map((s) => s.name));
  const slots = Object.entries(layout?.slots ?? {}).filter(([name]) => !taken.has(name));
  const boxes = slots.map(([name, slot]): Shape => ({
    name,
    box: (slot.below ? flowed(name) : null) ?? slot.box,
    content: { kind: "rect" },
    text: isTextRole(slot.role as Role) || slot.role === "block",
  }));
  return [...boxes, ...added];
}

/** The box a slot is drawn at on the slide in view, read from its element's pt position; null when it is not drawn. */
export const drawnBox: FlowedBox = (name) => {
  const el = typeof document === "undefined" ? null : (document.querySelector(`main [data-slot="${CSS.escape(name)}"]`) as HTMLElement | null);
  const pt = el ? ["left", "top", "width", "height"].map((k) => parseFloat(el.style.getPropertyValue(k))) : [];
  return pt.length === 4 && pt.every(Number.isFinite) ? (pt as Box) : null;
};

/** The ops that store a box where a drag or nudge left it. */
export function boxOps(pack: Pack, spec: SlideSpec, shape: Shape): PatchOp[] {
  if (!baseSlot(pack, spec, shape.name)?.below) return placeOps(spec, shape);
  const placed = setOverride(propsOf(spec).overrides, `slots.${shape.name}.box`, shape.box);
  return overridesPatch(spec, setOverride(placed, `slots.${shape.name}.below`, null));
}

/** Whether a slot of the layout has a box this slide moved: what "Reset position and size" undoes. */
export function boxOverridden(pack: Pack, spec: SlideSpec, name: string): boolean {
  const own = overrideOf(spec, name);
  return !!baseSlot(pack, spec, name) && (own.box !== undefined || own.below === null);
}

/** Put a layout slot back at the layout's box: its `box` override, and a `below: null` set with it, removed; nothing else. */
export function resetBoxOps(spec: SlideSpec, name: string): PatchOp[] {
  let overrides: unknown = clearOverride(propsOf(spec).overrides, `slots.${name}.box`);
  if (overrideOf(spec, name).below === null) overrides = clearOverride(overrides, `slots.${name}.below`);
  return overridesPatch(spec, overrides as Record<string, unknown>);
}

/** What a box edit changes, so it can be undone: the override's box and `below`, and an arrow or line's ends. */
export interface Geometry {
  box?: unknown;
  below?: unknown;
  ends?: { from?: Pt; to?: Pt };
}

/** A slot's geometry as stored on a slide. */
export function geometryOf(spec: SlideSpec, name: string): Geometry {
  const own = overrideOf(spec, name);
  const prop = tree(propsOf(spec)[name]);
  const ends = name.startsWith("shape:") ? { from: prop.from as Pt | undefined, to: prop.to as Pt | undefined } : undefined;
  return { box: own.box, below: own.below, ...(ends ? { ends } : {}) };
}

/** The ops that store a geometry back: each field set, or cleared when it was absent. */
export function restoreOps(spec: SlideSpec, name: string, geometry: Geometry): PatchOp[] {
  let overrides: unknown = propsOf(spec).overrides;
  for (const key of ["box", "below"] as const) overrides = geometry[key] === undefined ? clearOverride(overrides, `slots.${name}.${key}`) : setOverride(overrides, `slots.${name}.${key}`, geometry[key]);
  const ops = overridesPatch(spec, overrides as Record<string, unknown>);
  const prop = tree(propsOf(spec)[name]);
  if (!geometry.ends || !Object.keys(prop).length) return ops;
  const { from: _from, to: _to, ...rest } = prop;
  const ends = Object.fromEntries(Object.entries(geometry.ends).filter(([, v]) => v !== undefined));
  return [...ops, setSlotOp(spec, name, { ...rest, ...ends })];
}
