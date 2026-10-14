/**
 * Text-role resolution against a pack theme.
 *
 * The role fixes font, size, line height and colour once, in the pack. Nothing
 * here ever changes a size to make text fit; the line limit is what is checked.
 */
import type { RefinedSlot, ResolvedLayout } from "./overrides.js";
import { isTextRole, type Layout, type Pack, type Role, type Slot, type TextStyle } from "./pack.js";

/** A text slot after its role has been resolved: style, box and line limit. */
export interface ResolvedTextSlot {
  name: string;
  slot: RefinedSlot;
  style: TextStyle;
  lineLimit: number;
}

/**
 * Line pitch of a text style in canvas units.
 *
 * @param style - a resolved text style.
 * @returns `size * lineHeight`, the distance between two baselines.
 */
export function linePitch(style: TextStyle): number {
  return style.size * style.lineHeight;
}

/**
 * The line limit of a text slot.
 *
 * @param slot - the slot as declared in the layout.
 * @param style - the style of its role.
 * @param heightPt - the box height as laid out; a slot placed `below` another
 *   is shorter or taller than declared. Defaults to the declared height.
 * @returns the declared `lines`, or the number of whole lines the box height
 *   holds at the role's pitch (at least 1) when `lines` is not declared.
 */
export function lineLimitOf(slot: Slot, style: TextStyle, heightPt: number = slot.box[3]): number {
  if (slot.lines !== null) return slot.lines;
  return Math.max(1, Math.floor((heightPt - 2 * (slot.padding ?? 0) + 0.5) / linePitch(style)));
}

/**
 * Resolve every text slot of a layout.
 *
 * @param pack - the pack the layout belongs to.
 * @param layout - one of `pack.layouts`, or one with a slide's overrides laid over it.
 * @returns the text slots in declaration order with style and line limit (a
 *   slot's `text` override laid over its role style); figure
 *   and table slots are skipped. Used by the renderer, by `check` and by `catalog.prompt()`.
 */
export function textSlots(pack: Pack, layout: ResolvedLayout): ResolvedTextSlot[] {
  const out: ResolvedTextSlot[] = [];
  for (const [name, slot] of Object.entries(layout.slots)) {
    const role = isTextRole(slot.role) ? pack.roles[slot.style ?? slot.role] : undefined;
    const style = role && slot.text ? { ...role, ...slot.text } : role;
    if (style) out.push({ name, slot, style, lineLimit: lineLimitOf(slot, style) });
  }
  return out;
}

/**
 * The background variant a slide uses: the slide's own `background` prop wins
 * over its layout's `background`. There is no pack-wide fallback.
 *
 * @param pack - the slide's pack.
 * @param layout - the slide's layout.
 * @param requested - the slide's `background` prop, or null.
 * @returns the variant name and its fill and ink; a null or unknown request
 *   gives the layout's background.
 */
export function backgroundOf(pack: Pack, layout: Layout, requested: string | null | undefined) {
  const name = requested && pack.backgrounds[requested] ? requested : layout.background;
  const variant = pack.backgrounds[name]!;
  return { name, ...variant };
}

/**
 * The CSS font-family list for a text style.
 *
 * @param pack - the pack, for its fallback family.
 * @param style - the role style; `font` null means the pack's first font.
 * @returns a quoted CSS family list ending with the pack fallback.
 */
export function fontFamilyOf(pack: Pack, style: { font: string | null }): string {
  const family = style.font ?? pack.fonts[0]?.family;
  return family ? `"${family}", ${pack.fontFallback}` : pack.fontFallback;
}

/** The sample text of an empty slot that declares no `placeholder`, by role. */
export const DEFAULT_PLACEHOLDERS: Record<Role, string> = {
  title: "Title",
  subtitle: "Subtitle",
  body: "Text",
  note: "Text",
  label: "Label",
  caption: "Caption",
  figure: "Figure",
  table: "Table",
  shape: "Shape",
  block: "Text",
};

/**
 * The sample text the editor shows in an empty slot.
 *
 * @param name - the slot name; a slot named `author` defaults to "Author".
 * @param slot - the slot declaration.
 * @returns the slot's own `placeholder`, else the default of its name or role.
 *   It is a hint for the editor and for agents, never slide content.
 */
export function placeholderOf(name: string, slot: Slot): string {
  if (slot.placeholder) return slot.placeholder;
  return name.split(":")[0] === "author" ? "Author" : DEFAULT_PLACEHOLDERS[slot.role];
}
