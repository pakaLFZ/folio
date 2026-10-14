/**
 * From pptx shapes to folio slots: the role a placeholder type or a shape
 * name implies, slot names in reading order, and text styles collected into
 * one base style per role plus named styles for the slots that differ.
 */
import { TEXT_ROLES, type Box, type Role } from "@folio/core";
import { slug, unique } from "./report.js";
import type { TextLayer } from "./textstyle.js";

export interface DraftSlot {
  /** A name the shape already carries, kept when it is a valid slot name. */
  preferred?: string;
  name?: string;
  role: Role;
  box: Box;
  layer?: TextLayer;
  tableStyle?: string;
  placeholder?: string;
  below?: { slot: string; gap: number };
}

const TEXT_NAME = /^(title|subtitle|body|label|caption|note)(:[a-z0-9]+)?$/;
const OTHER_NAME = /^[a-z][a-z0-9-]*(:[a-z0-9]+)?$/;

/** The role a shape's name implies (`label:a` -> label, `fig:b` -> figure), or null. */
export function roleFromName(name: string): Role | null {
  if (/^fig:[a-z0-9]+$/.test(name)) return "figure";
  if (/^table:[a-z0-9]+$/.test(name)) return "table";
  const text = TEXT_NAME.exec(name);
  return text ? (text[1] as Role) : null;
}

/** The role a shape's alt text names (`folio role: label`), as `folio pack export --pptx` writes it. */
export function roleFromAltText(descr: string | undefined): Role | null {
  const role = /^folio role: (\w+)$/.exec(descr ?? "")?.[1];
  return role && [...TEXT_ROLES, "figure", "table"].includes(role) ? (role as Role) : null;
}

/** Whether a shape name can be kept as a slot name of this role. */
export function keepsName(name: string, role: Role): boolean {
  if (role === "figure") return /^fig:[a-z0-9]+$/.test(name);
  if (role === "table") return /^table:[a-z0-9]+$/.test(name);
  return OTHER_NAME.test(name) && !/^(fig|table):/.test(name);
}

/** The role of a placeholder type; null for footers, dates and slide numbers. */
export function roleOfPlaceholder(type: string): Role | null {
  if (type === "title" || type === "ctrTitle") return "title";
  if (type === "subTitle") return "subtitle";
  if (type === "pic" || type === "chart" || type === "dgm" || type === "clipArt" || type === "media") return "figure";
  if (type === "tbl") return "table";
  if (["dt", "ftr", "sldNum", "hdr", "sldImg"].includes(type)) return null;
  return "body";
}

const ROLE_PREFIX: Partial<Record<Role, string>> = { figure: "fig", table: "table" };

/** Give every slot a name: its own when valid and free, else its role (and a letter when several share it), in reading order. */
export function nameSlots(slots: DraftSlot[]): DraftSlot[] {
  const taken = new Set<string>();
  for (const s of slots) if (s.preferred && keepsName(s.preferred, s.role) && !taken.has(s.preferred)) taken.add((s.name = s.preferred));
  const order = [...slots].sort((a, b) => Math.round(a.box[1] / 4) - Math.round(b.box[1] / 4) || a.box[0] - b.box[0]);
  for (const role of new Set(order.filter((s) => !s.name).map((s) => s.role))) {
    const group = order.filter((s) => !s.name && s.role === role);
    const prefix = ROLE_PREFIX[role] ?? role;
    if (group.length === 1 && !ROLE_PREFIX[role] && !taken.has(role)) {
      taken.add((group[0]!.name = role));
      continue;
    }
    let letter = 0;
    for (const s of group) {
      let name: string;
      do name = `${prefix}:${String.fromCharCode(97 + letter++)}`;
      while (taken.has(name));
      taken.add((s.name = name));
    }
  }
  return slots;
}

/** A folio text style from a resolved layer, leaving out what equals the defaults. */
export function textStyleOf(layer: TextLayer, ink: string, baseFont: string): Record<string, unknown> {
  const size = layer.size ?? 18;
  const lineHeight = layer.linePts ? Math.round((layer.linePts / size) * 100) / 100 : layer.lineHeight ?? 1.2;
  const style: Record<string, unknown> = { size, lineHeight };
  if (layer.font && layer.font !== baseFont) style.font = layer.font;
  if (layer.bold) style.weight = 700;
  if (layer.italic) style.italic = true;
  if (layer.align && layer.align !== "left") style.align = layer.align;
  if (layer.caps) style.transform = "uppercase";
  if (layer.color && layer.color.toUpperCase() !== ink.toUpperCase()) style.color = layer.color;
  if (layer.wrap === false) style.wrap = false;
  if (layer.anchor && layer.anchor !== "top") style.anchor = layer.anchor;
  return style;
}

/** A descriptive name for a style that differs from its role's base. */
function styleName(role: string, style: Record<string, unknown>): string {
  const parts = [role, String(style.size).replace(".", "-")];
  if (style.weight === 700) parts.push("bold");
  if (style.italic) parts.push("italic");
  if (style.align) parts.push(String(style.align));
  if (style.anchor) parts.push(String(style.anchor));
  if (style.transform) parts.push("upper");
  if (style.font) parts.push(slug(String(style.font)));
  return parts.join("-");
}

interface Use {
  layout: string;
  slot: string;
  role: string;
  style: Record<string, unknown>;
}

/** Every text style the import meets; `finish` decides the base styles and the named ones. */
export class StyleBank {
  private readonly uses: Use[] = [];
  private readonly named = new Map<string, Record<string, unknown>>();

  add(layout: string, slot: string, role: string, style: Record<string, unknown>): void {
    this.uses.push({ layout, slot, role, style });
  }

  /** Register a decoration's text style under its own name; returns the name. */
  decoration(name: string, style: Record<string, unknown>): string {
    const existing = [...this.named].find(([, s]) => JSON.stringify(s) === JSON.stringify(style));
    if (existing) return existing[0];
    const unused = unique(name, new Set([...this.named.keys(), ...TEXT_ROLES]));
    this.named.set(unused, style);
    return unused;
  }

  /** Write `roles` and each differing slot's `style` into the pack's layouts. */
  finish(roles: Record<string, unknown>, layouts: Record<string, { slots: Record<string, Record<string, unknown>> }>): void {
    for (const role of new Set(this.uses.map((u) => u.role))) {
      const counts = new Map<string, number>();
      for (const u of this.uses.filter((x) => x.role === role)) counts.set(JSON.stringify(u.style), (counts.get(JSON.stringify(u.style)) ?? 0) + 1);
      const base = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
      roles[role] = JSON.parse(base);
      for (const u of this.uses.filter((x) => x.role === role && JSON.stringify(x.style) !== base)) {
        layouts[u.layout]!.slots[u.slot]!.style = this.decoration(styleName(role, u.style), u.style);
      }
    }
    for (const [name, style] of this.named) roles[name] = style;
  }
}
