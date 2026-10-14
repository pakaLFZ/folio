/**
 * Per-slide overrides: a slide may override any value its layout gives it, as
 * long as the result is still a value of the template's own types.
 *
 * The override type is `DeepPartial` of the layout's types, and its zod schema
 * is derived from the very schemas `pack.json` is validated with (defaults
 * removed, every field optional, unknown keys refused). Overrides are deep
 * merged over the layout (objects merge, arrays and scalars replace) and the
 * merged layout is validated again as the pack would validate it.
 */
import { z } from "zod";
import { blockRefinementProblems, blockStyleSchema, type BlockStyle } from "./blockstyle.js";
import { deepMerge, isPlainObject } from "./merge.js";

export { deepMerge } from "./merge.js";
import { isTextRole, layoutSchema, packReferenceProblems, slotSchema, tableStyleSchema, textStyleSchema, type Layout, type Pack, type Slot, type TableStyle, type TextStyle } from "./pack.js";

/** Every field optional, all the way down; arrays (a box, a list) are replaced whole, never merged. */
export type DeepPartial<T> = T extends readonly unknown[] ? T : T extends object ? { [K in keyof T]?: DeepPartial<T[K]> } : T;

/** What a slide may lay over a slot's role style (`text`), its table style (`table`) or its block style (`block`). */
export interface SlotRefinement {
  text?: Partial<TextStyle>;
  table?: DeepPartial<TableStyle>;
  block?: DeepPartial<BlockStyle>;
}

/** One slot's override: any slot field, plus text and table style fields. */
export type SlotOverride = DeepPartial<Slot> & SlotRefinement;

/** A slide's `overrides` prop. */
export interface SlideOverrides {
  background?: string;
  decorations?: z.input<typeof layoutSchema>["decorations"];
  slots?: Record<string, SlotOverride>;
}

/** A slot after its overrides: the slot's own fields, and the style refinements it carries. */
export type RefinedSlot = Slot & SlotRefinement;

/** A layout after a slide's overrides. A plain `Layout` is one with no refinements. */
export type ResolvedLayout = Omit<Layout, "slots"> & { slots: Record<string, RefinedSlot> };

/** One reason an override is refused: its JSON path under `overrides` and what was expected. */
export interface OverrideProblem {
  path: (string | number)[];
  message: string;
}

const unknownKeys = (known: string[]) => (issue: { code?: string; keys?: string[] }) =>
  issue.code === "unrecognized_keys" ? `unknown key ${(issue.keys ?? []).map((k) => `"${k}"`).join(", ")}; an override uses the template's own fields (known: ${known.join(", ")})` : undefined;

/** A schema's override form: defaults removed, objects strict with every field optional. */
function loosen(schema: z.ZodType): z.ZodType {
  if (schema instanceof z.ZodDefault || schema instanceof z.ZodOptional) return loosen(schema.unwrap() as z.ZodType);
  if (schema instanceof z.ZodNullable) return loosen(schema.unwrap() as z.ZodType).nullable();
  if (schema instanceof z.ZodObject) return loosenObject(schema.shape as Record<string, z.ZodType>);
  return schema;
}

function loosenObject(shape: Record<string, z.ZodType>, extra: Record<string, z.ZodType> = {}) {
  const fields = { ...Object.fromEntries(Object.entries(shape).map(([k, v]) => [k, loosen(v).optional()])), ...extra };
  return z.strictObject(fields, { error: unknownKeys(Object.keys(fields)) });
}

const slotOverrideSchema = loosenObject(slotSchema.shape, {
  text: loosen(textStyleSchema).optional().describe("Fields of the slot's role style: font, size, weight, italic, lineHeight, align, transform, color, wrap, anchor."),
  table: loosen(tableStyleSchema).optional().describe("Fields of the table's named style, laid over it."),
  block: loosen(blockStyleSchema).optional().describe("Fields of the block's named style, laid over it."),
});

/** The zod schema of a slide's `overrides`, derived from the pack's own schemas. */
export const slideOverridesSchema = z
  .strictObject(
    {
      background: loosen(layoutSchema.shape.background).optional(),
      decorations: loosen(layoutSchema.shape.decorations).optional(),
      slots: z.record(z.string(), slotOverrideSchema).optional(),
    },
    { error: unknownKeys(["background", "decorations", "slots"]) },
  )
  .describe("Per-slide overrides of the layout: background, decorations, and per slot any slot field plus text and table style fields.") as unknown as z.ZodType<SlideOverrides>;

/** The raw `overrides` prop of a slide's props, or undefined. */
export function overridesOf(props: Record<string, unknown>): unknown {
  return props.overrides ?? undefined;
}

/**
 * Lay validated overrides over a layout, without checking the result.
 *
 * @returns the merged layout; `text` and `table` are carried on their slots.
 */
export function mergeOverrides(layout: Layout, overrides: SlideOverrides): ResolvedLayout {
  const slots: Record<string, RefinedSlot> = {};
  for (const [name, slot] of Object.entries(layout.slots)) {
    const { text, table, block, ...fields } = overrides.slots?.[name] ?? {};
    slots[name] = { ...deepMerge(slot, fields), ...refinements(text, table, block) };
  }
  for (const [name, over] of Object.entries(overrides.slots ?? {})) {
    if (layout.slots[name]) continue;
    const { text, table, block, ...fields } = over;
    const added = slotSchema.safeParse(fields);
    if (added.success) slots[name] = { ...added.data, ...refinements(text, table, block) };
  }
  return { ...deepMerge({ ...layout, slots: {} }, { background: overrides.background, decorations: overrides.decorations }), slots };
}

/** The refinements a slot carries, leaving out those not given. */
function refinements(text: SlotRefinement["text"], table: SlotRefinement["table"], block: SlotRefinement["block"]): SlotRefinement {
  return { ...(text ? { text } : {}), ...(table ? { table } : {}), ...(block ? { block } : {}) };
}

/** Problem strings from the pack's own checks (`layouts.L.x: msg`) as override problems. */
function fromPackProblem(layoutName: string, text: string): OverrideProblem {
  const prefix = `layouts.${layoutName}.`;
  const at = text.indexOf(": ");
  const path = text.slice(0, at).startsWith(prefix) ? text.slice(prefix.length, at).split(".") : [];
  return { path, message: text.slice(at + 2) };
}

const TEXT_SLOT_NAME = /^[a-z][a-z0-9-]*(:[a-z0-9]+)?$/;

/** Why an added slot's name does not fit its role, or null: `fig:<x>`, `table:<x>`, or a lower-case name. */
function addedNameProblem(name: string, role: string): string | null {
  if (role === "figure") return /^fig:[a-z0-9]+$/.test(name) ? null : `an added figure slot is named "fig:<x>", like "fig:a"; rename it`;
  if (role === "table") return null;
  if (role === "shape") return /^shape:[a-z0-9]+$/.test(name) ? null : `an added shape slot is named "shape:<x>", like "shape:a"; rename it`;
  if (role === "block") return /^block:[a-z0-9]+$/.test(name) ? null : `an added block slot is named "block:<x>", like "block:a"; rename it`;
  if (TEXT_SLOT_NAME.test(name) && !/^(fig|table|shape|block):/.test(name)) return null;
  return `an added ${role} slot has a lower-case name, optionally with ":<x>" (like "headline" or "label:c"); "fig:", "table:", "shape:" and "block:" are kept for figures, tables, shapes and blocks; rename it`;
}

/** Problems of a slot the layout lacks: it must be a full slot, named for its role. */
function addedSlotProblems(layoutName: string, layout: Layout, name: string, over: SlotOverride): OverrideProblem[] {
  const { text: _text, table: _table, block: _block, ...fields } = over;
  const parsed = slotSchema.safeParse(fields);
  if (parsed.success) {
    const problem = addedNameProblem(name, parsed.data.role);
    return problem ? [{ path: ["slots", name], message: problem }] : [];
  }
  const names = Object.keys(layout.slots).join(", ");
  const missing = (path: PropertyKey[]) => path.length === 1 && (fields as Record<string, unknown>)[path[0] as string] === undefined;
  return parsed.error.issues.map((issue) => ({
    path: ["slots", name, ...(issue.path as (string | number)[])],
    message: missing(issue.path) ? `"${name}" is not a slot of layout ${layoutName} (slots: ${names}); to add it as a new slot give its full definition, at least "role" and "box"` : issue.message,
  }));
}

/** Slots the layout lacks that are not full slots, and refinements on a slot of the wrong role. */
function slotProblems(pack: Pack, layoutName: string, layout: Layout, merged: ResolvedLayout | null, overrides: SlideOverrides): OverrideProblem[] {
  const out: OverrideProblem[] = [];
  for (const [name, over] of Object.entries(overrides.slots ?? {})) {
    if (!layout.slots[name] && !merged) {
      out.push(...addedSlotProblems(layoutName, layout, name, over));
      continue;
    }
    if (layout.slots[name] && over.draft !== undefined) out.push({ path: ["slots", name, "draft"], message: `only an added slot can be a draft; ${name} is a slot of layout ${layoutName}` });
    const role = merged?.slots[name]?.role ?? layout.slots[name]?.role;
    if (!role) continue;
    if (over.text && !isTextRole(role) && role !== "shape" && role !== "block") out.push({ path: ["slots", name, "text"], message: `only a text, shape or block slot takes text style fields; slot ${name} is a ${role}` });
    if (over.table && role !== "table") out.push({ path: ["slots", name, "table"], message: `only a table slot takes table style fields; slot ${name} is a ${role}` });
    if (over.block && role !== "block") out.push({ path: ["slots", name, "block"], message: `only a block slot takes block style fields; slot ${name} is a ${role}` });
    else if (over.block && merged?.slots[name]) out.push(...blockRefinementProblems(pack, merged.slots[name]).map((p) => ({ path: ["slots", name, "block", ...p.path], message: p.message })));
  }
  return out;
}

/**
 * Validate a slide's overrides and lay them over its layout.
 *
 * @param pack - the deck's pack.
 * @param layoutName - the slide's layout.
 * @param raw - the slide's `overrides` prop, as stored.
 * @returns the merged layout and no problems; or the problems and no layout,
 *   each naming its path under `overrides`. Without overrides, the layout as is.
 *   Undefined layout when the pack has no such layout.
 */
export function resolveOverrides(pack: Pack, layoutName: string, raw: unknown): { layout: ResolvedLayout | null; problems: OverrideProblem[] } {
  const layout = pack.layouts[layoutName];
  if (!layout) return { layout: null, problems: [] };
  if (raw === undefined || raw === null) return { layout, problems: [] };
  const parsed = slideOverridesSchema.safeParse(raw);
  if (!parsed.success) return { layout: null, problems: parsed.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })) };
  const named = slotProblems(pack, layoutName, layout, null, parsed.data);
  if (named.length) return { layout: null, problems: named };
  const merged = mergeOverrides(layout, parsed.data);
  const reparsed = layoutSchema.safeParse(merged);
  if (!reparsed.success) return { layout: null, problems: reparsed.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message })) };
  const problems = [
    ...packReferenceProblems({ ...pack, layouts: { [layoutName]: reparsed.data } }).map((p) => fromPackProblem(layoutName, p)),
    ...slotProblems(pack, layoutName, layout, merged, parsed.data),
  ];
  return problems.length ? { layout: null, problems } : { layout: merged, problems: [] };
}

/**
 * The layout a slide renders, measures and checks with.
 *
 * @param pack - the deck's pack.
 * @param layoutName - the slide's layout.
 * @param props - the slide's props, which may carry `overrides`.
 * @returns the layout with the slide's overrides laid over it; the template's
 *   layout when the overrides are invalid (each problem is a FOLIO-SPEC-001
 *   warning); undefined when the pack has no such layout.
 */
export function slideLayout(pack: Pack, layoutName: string, props: Record<string, unknown>): ResolvedLayout | undefined {
  return resolveOverrides(pack, layoutName, overridesOf(props)).layout ?? pack.layouts[layoutName];
}

/**
 * The background a slide asks for: its override when its overrides are valid,
 * else its `background` prop.
 *
 * @returns the requested name for `backgroundOf`, or null for the layout's.
 */
export function requestedBackground(pack: Pack, layoutName: string, props: Record<string, unknown>): string | null {
  const over = overridesOf(props);
  const applied = isPlainObject(over) && typeof over.background === "string" && resolveOverrides(pack, layoutName, over).layout;
  return applied ? (over.background as string) : typeof props.background === "string" ? props.background : null;
}

/** `overrides.slots.note.box.2: message`. */
export function formatOverrideProblem(problem: OverrideProblem): string {
  return `${["overrides", ...problem.path].join(".")}: ${problem.message}`;
}
