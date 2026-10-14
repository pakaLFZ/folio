/**
 * Placeholders as slots, and layouts written into the draft pack with their
 * text styles registered for the style bank.
 */
import { isTextRole, type Box } from "@folio/core";
import type { Draft } from "./draft.js";
import { resolvePlaceholder, type Layout } from "./model.js";
import type { Shape } from "./shapes.js";
import { roleFromAltText, roleFromName, roleOfPlaceholder, textStyleOf, type DraftSlot } from "./slots.js";

/** A box less a text body's insets, so the text lands where PowerPoint puts it. */
export function innerBox(box: Box, insets: number[] | undefined): Box {
  const [l, t, r, b] = (insets ?? [0, 0, 0, 0]).map((v) => v ?? 0);
  const round = (v: number) => Math.round(v * 10) / 10;
  return [round(box[0] + l!), round(box[1] + t!), Math.max(round(box[2] - l! - r!), 1), Math.max(round(box[3] - t! - b!), 1)];
}

/** One placeholder as a draft slot, or null for footers and slide numbers. */
export function placeholderSlot(draft: Draft, shape: Shape, layout: Layout, onSlide: Layout | null, where: string): DraftSlot | null {
  const typeRole = roleOfPlaceholder(shape.ph!.type);
  const named = roleFromAltText(shape.descr) ?? roleFromName(shape.name);
  const role = typeRole && named && isTextRole(typeRole) === isTextRole(named) && typeRole !== "title" ? named : typeRole;
  if (!role) {
    draft.report.tally("unmapped", "footer, date and slide-number placeholders are left out; folio has no footer slots (draw a fixed footer as a text decoration if the house needs one)", `${where} "${shape.name}"`);
    return null;
  }
  const resolved = resolvePlaceholder(shape, layout.master, onSlide);
  if (!resolved.box) return null;
  if (shape.ph!.type === "obj") draft.report.tally("roles", `content placeholders became body text slots; in PowerPoint they can also hold a picture or a table. Where one holds those, add a figure or table slot in its place (folio pack edit ${draft.pack.name} set layouts.<layout>.slots.<slot>.role='"figure"')`, where);
  const slot: DraftSlot = isTextRole(role) ? { preferred: shape.name, role, box: innerBox(resolved.box, resolved.style.insets), layer: resolved.style } : { preferred: shape.name, role, box: resolved.box };
  if (role === "table") slot.tableStyle = "default";
  if (shape.ph!.custom && shape.text) slot.placeholder = shape.text.slice(0, 200);
  return slot;
}

/**
 * Write a layout into the pack, registering its text slots' styles.
 *
 * @param slots - named draft slots.
 */
export function addLayout(draft: Draft, name: string, layout: { description: string; background: string; slots: DraftSlot[]; decorations: Record<string, unknown>[]; master: Layout["master"] }): void {
  const ink = draft.pack.backgrounds[layout.background]!.ink;
  const slots: Record<string, Record<string, unknown>> = {};
  for (const s of layout.slots) {
    slots[s.name!] = { role: s.role, box: s.box, ...(s.tableStyle ? { tableStyle: s.tableStyle } : {}), ...(s.below ? { below: s.below } : {}), ...(s.placeholder ? { placeholder: s.placeholder } : {}) };
    if (s.layer) draft.styles.add(name, s.name!, s.role, textStyleOf(s.layer, ink, layout.master.ctx.minor));
  }
  draft.pack.layouts[name] = { description: layout.description, background: layout.background, slots, ...(layout.decorations.length ? { decorations: layout.decorations } : {}) };
}
