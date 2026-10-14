/**
 * Elements as the editor copies, pastes and deletes them: every slot of a
 * slide, of the layout or added (spec/slides/drawing.md, "Elements: copy,
 * cut, paste, delete"). Pure: slides in, patches out.
 */
import { clearOverride, isTextRole, overridesPatch, setOverride, setSlotOp, slideLayout, type Pack, type PatchOp, type Role, type SlideSpec } from "@folio/core";
import type { Pt } from "./shapeModel";

/** A copied element: its slot definition and content, and whether it was a draft. */
export interface ElementClip {
  name: string;
  role: string;
  slot: Record<string, unknown>;
  content: unknown;
  draft: boolean;
  pack: string;
}

/** How far a paste without a point lands from the copy, right and down, pt. */
export const PASTE_OFFSET = 12;

const tree = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const rootOf = (spec: SlideSpec) => spec.elements[spec.root];
const addedSlots = (spec: SlideSpec) => tree(tree(rootOf(spec)?.props.overrides).slots);

/** Whether a slot is one the slide added, not one of its layout. */
export function isAddedSlot(pack: Pack, spec: SlideSpec, name: string): boolean {
  const root = rootOf(spec);
  return !!root && !pack.layouts[root.type]?.slots[name] && name in addedSlots(spec);
}

/** A layout slot's definition without the fields left at their defaults, so a paste writes only what matters. */
function compact(slot: Record<string, unknown>): Record<string, unknown> {
  const defaults: Record<string, unknown> = { enforce: false, padding: 0, draft: false };
  return Object.fromEntries(Object.entries(slot).filter(([k, v]) => v !== null && v !== undefined && defaults[k] !== v));
}

/**
 * Copy an element: an added slot's override and prop, or a layout slot's
 * content with its slot as this slide shows it.
 *
 * @returns the copy, or null when the slide has no such slot.
 */
export function copyElement(pack: Pack, spec: SlideSpec, name: string): ElementClip | null {
  const root = rootOf(spec);
  const slot = root ? slideLayout(pack, root.type, root.props)?.slots[name] : undefined;
  if (!root || !slot) return null;
  const raw = isAddedSlot(pack, spec, name) ? tree(addedSlots(spec)[name]) : compact({ ...slot, below: null });
  const { draft, ...definition } = raw;
  return { name, role: slot.role, slot: definition, content: root.props[name] ?? null, draft: draft === true, pack: pack.name };
}

/** Whether a copy of one role may fill a slot of another: text into text, otherwise the same role. */
export function sameKind(a: string, b: string): boolean {
  return a === b || (isTextRole(a as Role) && isTextRole(b as Role));
}

/** The name family a role's added slots take. */
function familyOf(clip: ElementClip): string {
  if (clip.role === "figure") return "fig";
  if (clip.role === "table" || clip.role === "shape") return clip.role;
  if (isTextRole(clip.role as Role)) return "text";
  return clip.name.includes(":") ? clip.name.split(":")[0]! : clip.role;
}

/** The first `<family>:<x>` free on a slide: `a` ... `z`, then `a1` ... */
export function nextElementName(family: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  for (let round = 0; ; round += 1) for (const letter of "abcdefghijklmnopqrstuvwxyz") if (!used.has(`${family}:${letter}${round || ""}`)) return `${family}:${letter}${round || ""}`;
}

/**
 * Paste a copy: onto a selected slot of the same kind it replaces the
 * content; otherwise it adds a new slot of its family at the copy's place
 * moved PASTE_OFFSET, or at a point.
 *
 * @param selected - the selected slot on the target slide, if any.
 * @param at - where a right-click asked for it, pt; null for the offset.
 * @returns the slot written and the patch.
 */
export function pasteOps(pack: Pack, spec: SlideSpec, clip: ElementClip, selected: string | null, at: Pt | null): { name: string; ops: PatchOp[] } {
  const root = rootOf(spec)!;
  const target = selected ? slideLayout(pack, root.type, root.props)?.slots[selected] : undefined;
  if (selected && target && sameKind(clip.role, target.role)) return { name: selected, ops: [setSlotOp(spec, selected, clip.content)] };
  const name = nextElementName(familyOf(clip), [...Object.keys(addedSlots(spec)), ...Object.keys(root.props), ...Object.keys(pack.layouts[root.type]?.slots ?? {})]);
  const [x, y, w, h] = clip.slot.box as number[];
  const box = at ? [at[0], at[1], w, h] : [x! + PASTE_OFFSET, y! + PASTE_OFFSET, w, h];
  const slot = { ...clip.slot, box, ...(clip.draft ? { draft: true } : {}) };
  const ops = overridesPatch(spec, setOverride(root.props.overrides, `slots.${name}`, slot));
  return { name, ops: clip.content === null ? ops : [...ops, setSlotOp(spec, name, clip.content)] };
}

/**
 * Delete an element: an added slot loses its slot and content; a layout slot
 * only its content, since the slot belongs to the layout.
 *
 * @returns the patch, and whether the slot stays (cleared) or goes.
 */
export function removeOps(pack: Pack, spec: SlideSpec, name: string): { ops: PatchOp[]; cleared: boolean } {
  const root = rootOf(spec)!;
  const content: PatchOp[] = name in root.props ? [{ op: "remove", path: setSlotOp(spec, name, null).path }] : [];
  if (!isAddedSlot(pack, spec, name)) return { ops: content, cleared: true };
  return { ops: [...overridesPatch(spec, clearOverride(root.props.overrides, `slots.${name}`)), ...content], cleared: false };
}
