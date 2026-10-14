/**
 * Background variants and decorations. PowerPoint templates repeat a layout
 * once per background (`Title Slide`, `Title Slide Black`); folio keeps one
 * layout and lets a slide switch background. Decorations (logos, marks, a
 * wordmark) that differ between the variants are limited to theirs.
 */
import { createHash } from "node:crypto";
import { registerBackground, placeImage, type Draft } from "./draft.js";
import type { Layout } from "./model.js";
import { resolveTextBox } from "./model.js";
import { slug } from "./report.js";
import type { Shape } from "./shapes.js";
import { textStyleOf } from "./slots.js";

export interface Member {
  layout: Layout;
  /** The variant's word (`Black`), or null for the base layout. */
  word: string | null;
  background: string;
}

export interface Group {
  name: string;
  base: Layout;
  members: Member[];
}

/** The placeholders of a layout as a comparable signature: type and box. */
function signature(layout: Layout): string {
  return layout.shapes.filter((s) => s.ph).map((s) => `${s.ph!.type}@${(s.box ?? []).map((v) => Math.round(v)).join(",")}`).sort().join("|");
}

/**
 * Group layouts into a base and its variants: `<Base> <Word>` with the same
 * placeholders as `<Base>`.
 *
 * @returns one group per base layout, in the master's order; backgrounds are named when the group is registered.
 */
export function groupLayouts(layouts: Layout[]): { groups: { name: string; base: Layout; variants: { layout: Layout; word: string }[] }[]; nearMisses: [Layout, Layout][] } {
  const byName = new Map(layouts.map((l) => [l.name, l]));
  const variantOf = new Map<Layout, { base: Layout; word: string }>();
  const nearMisses: [Layout, Layout][] = [];
  for (const layout of layouts) {
    const match = /^(.*\S)\s+(\S+)$/.exec(layout.name);
    const base = match ? byName.get(match[1]!) : undefined;
    if (!base || base === layout) continue;
    if (signature(base) === signature(layout)) variantOf.set(layout, { base, word: match![2]! });
    else nearMisses.push([layout, base]);
  }
  const groups = layouts.filter((l) => !variantOf.has(l)).map((base) => ({
    name: base.name,
    base,
    variants: layouts.filter((l) => variantOf.get(l)?.base === base).map((l) => ({ layout: l, word: variantOf.get(l)!.word })),
  }));
  return { groups, nearMisses };
}

/** Name each member's background in the pack. */
export function registerGroup(draft: Draft, raw: ReturnType<typeof groupLayouts>["groups"][number]): Group {
  const members: Member[] = [{ layout: raw.base, word: null, background: "" }, ...raw.variants.map((v) => ({ layout: v.layout, word: v.word, background: "" }))];
  for (const m of members) {
    const fill = m.layout.background ?? m.layout.master.background ?? { color: "#FFFFFF" };
    m.background = registerBackground(draft, fill, m.word, `layout "${m.layout.name}"`);
  }
  return { name: raw.name, base: raw.base, members };
}

/** The shapes a layout shows that are not placeholders, groups flattened, the master's included unless hidden. */
function decorationShapes(layout: Layout): Shape[] {
  const flat = (shapes: Shape[]): Shape[] => shapes.flatMap((s) => (s.kind === "group" ? flat(s.children ?? []) : s.ph ? [] : [s]));
  return [...(layout.showMasterShapes ? flat(layout.master.shapes) : []), ...flat(layout.shapes)];
}

/** One decoration as pack JSON with a key that compares equal across variants, or null when folio cannot draw it. */
function decorationOf(draft: Draft, shape: Shape, member: Member): { key: string; value: Record<string, unknown> } | null {
  if (!shape.box) return null;
  const box = shape.box.map((v) => Math.round(v * 10) / 10);
  if (shape.kind === "picture" && shape.image) {
    const hash = createHash("sha256").update(draft.pptx.bytes(shape.image)).digest("hex");
    const hint = member.word ? `${shape.name} on ${member.word}` : shape.name;
    return { key: `pic ${box} ${hash}`, value: { image: placeImage(draft, shape.image, hint), box } };
  }
  if (shape.kind === "text" && shape.text) {
    const ink = draft.pack.backgrounds[member.background]!.ink;
    const style = textStyleOf(resolveTextBox(shape, member.layout.master), ink, member.layout.master.ctx.minor);
    const name = draft.styles.decoration(slug(shape.name), style);
    return { key: `text ${box} ${shape.text} ${name}`, value: { text: shape.text, style: name, box } };
  }
  return null;
}

/**
 * The decorations of a group: each distinct one once, limited to the
 * backgrounds of the variants that show it.
 */
export function groupDecorations(draft: Draft, group: Group, layoutName: string): Record<string, unknown>[] {
  const found = new Map<string, { value: Record<string, unknown>; backgrounds: Set<string> }>();
  for (const member of group.members) {
    for (const shape of decorationShapes(member.layout)) {
      const deco = decorationOf(draft, shape, member);
      if (!deco) {
        draft.report.add("unmapped", `layout "${member.layout.name}": ${shape.kind === "picture" ? "picture" : `a ${shape.kind} shape`} "${shape.name}"${shape.box ? ` at [${shape.box.join(", ")}]` : ""} has no folio counterpart and is not drawn; export it as an image and add it to layouts.${layoutName}.decorations if it matters`);
        continue;
      }
      const entry = found.get(deco.key) ?? { value: deco.value, backgrounds: new Set<string>() };
      entry.backgrounds.add(member.background);
      found.set(deco.key, entry);
    }
  }
  const all = new Set(group.members.map((m) => m.background));
  return [...found.values()].map(({ value, backgrounds }) => (backgrounds.size === all.size ? value : { ...value, backgrounds: [...backgrounds] }));
}
