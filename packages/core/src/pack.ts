/**
 * Template packs: the portable unit that carries a theme and its layouts.
 *
 * A pack is one folder, `templates/<pack>/`, whose `pack.json` is validated by
 * `packSchema` below. Every length is in the pack's canvas unit (pt), every
 * file reference is relative to the pack folder, and nothing names a project.
 */
import { z } from "zod";
import { blockSlotProblems, blockStyleProblems, blockStyleSchema } from "./blockstyle.js";
import { colorProblem, colorsSchema, INK, isPackColor } from "./colors.js";
import { boxStyleFields, boxStyleProblems } from "./boxstyle.js";
import { ROLE_STYLE_EXAMPLE, textStyleFieldsSchema, textStyleSchema } from "./textstyle.js";

export { textStyleFieldsSchema, textStyleSchema, type TextStyle } from "./textstyle.js";

const BOX_EXAMPLE = "[40, 40, 880, 460]";

/** A box `[x, y, w, h]` in canvas units, origin at the top left. */
export const boxSchema = z.tuple(
  [z.number(), z.number(), z.number().positive(), z.number().positive()],
  { error: (issue) => (issue.input === undefined ? `is missing; a box is [x, y, w, h] in pt, e.g. ${BOX_EXAMPLE}` : `must be [x, y, w, h] in pt, e.g. ${BOX_EXAMPLE}`) },
);
export type Box = z.infer<typeof boxSchema>;

/** Generic slot roles. Text roles carry a text style; `figure` holds a picture or a hook; `table` holds rows of cells; `shape` a rectangle, ellipse, arrow or line; `block` a text box or code block in a named block style. */
export const TEXT_ROLES = ["title", "subtitle", "body", "label", "caption", "note"] as const;
const ROLE_KINDS = [...TEXT_ROLES, "figure", "table", "shape", "block"] as const;
export const roleSchema = z.enum(ROLE_KINDS, {
  error: (issue) => (issue.input === undefined ? `is missing; roles are: ${ROLE_KINDS.join(", ")}` : `"${String(issue.input)}" is not a role; roles are: ${ROLE_KINDS.join(", ")}`),
});

/** Whether a role is a text role, styled by `roles` and measured in lines. */
export const isTextRole = (role: Role): boolean => (TEXT_ROLES as readonly string[]).includes(role);
export type Role = z.infer<typeof roleSchema>;

const fontSchema = z.object(
  {
    family: z.string(),
    file: z.string(),
    weight: z.number().int().default(400),
    style: z.enum(["normal", "italic"]).default("normal"),
  },
  { error: (issue) => (issue.input === undefined ? 'is missing; a font entry is {"family": "Inter", "file": "fonts/inter-bold.ttf", "weight": 700}' : 'must be an object: {"family": "Inter", "file": "fonts/inter-bold.ttf", "weight": 700}') },
);

const BACKGROUND_EXAMPLE = '{"fill": "#ffffff", "ink": "#111111"}';

const backgroundSchema = z.object(
  {
    fill: z.string(),
    ink: z.string(),
    image: z.string().nullable().default(null),
  },
  { error: (issue) => (issue.input === undefined ? `is missing; a background is ${BACKGROUND_EXAMPLE}` : `must be an object; a background is ${BACKGROUND_EXAMPLE}`) },
);

const ALIGN = z.enum(["left", "center", "right"]);

/**
 * A named table style. Tables take every look from here, never from the slide:
 * a slide may only pick another named style of the same pack.
 */
const TABLE_STYLE_EXAMPLE = '{"size": 14, "lineHeight": 1.2, "cellPad": [4, 8, 4, 8], "rule": {"color": "#cccccc", "width": 0.5}}';

export const tableStyleSchema = z.object(
  {
    description: z.string().nullable().default(null),
    font: z.string().nullable().default(null),
    size: z.number().positive(),
    lineHeight: z.number().positive(),
    align: z.union([ALIGN, z.array(ALIGN).min(1)]).default("left").describe("One alignment for every column, or one per column (missing columns are left)."),
    header: z.boolean().default(true),
    headerWeight: z.number().int().min(100).max(900).default(700),
    headerFill: z.string().nullable().default(null),
    headerInk: z.string().nullable().default(null),
    fill: z.string().nullable().default(null).describe("Body cell fill; null leaves the slide background."),
    ink: z.string().nullable().default(null).describe("Body cell ink; null follows the background's ink."),
    bandFill: z.string().nullable().default(null).describe("Fill of every other body row, starting with the first."),
    cellPad: z
      .tuple([z.number().min(0), z.number().min(0), z.number().min(0), z.number().min(0)], { error: (issue) => (issue.input === undefined ? "is missing; cellPad is [top, right, bottom, left] in pt, e.g. [4, 8, 4, 8]" : "must be [top, right, bottom, left] in pt, e.g. [4, 8, 4, 8]") })
      .describe("[top, right, bottom, left] in pt."),
    rule: z.object(
      {
        color: z.string(),
        width: z.number().min(0),
        outer: z.boolean().default(true),
        rows: z.boolean().default(true),
        columns: z.boolean().default(false),
      },
      { error: (issue) => (issue.input === undefined ? 'is missing; write "rule": {"color": "#cccccc", "width": 0.5}' : 'must be an object: {"color": "#cccccc", "width": 0.5}') },
    ),
  },
  { error: (issue) => (issue.input === undefined ? `is missing; a table style is ${TABLE_STYLE_EXAMPLE}` : `must be an object; a table style is ${TABLE_STYLE_EXAMPLE}`) },
);
export type TableStyle = z.infer<typeof tableStyleSchema>;

const DASHES = ["solid", "dash", "dot"] as const;
const SHAPE_STYLE_EXAMPLE = '{"fill": null, "stroke": "ink", "strokeWidth": 1.5}';

/** A named shape style: the look a shape takes unless the slide gives its own fields. */
export const shapeStyleSchema = z.object(
  {
    description: z.string().nullable().default(null),
    fill: z.string().nullable().default(null).describe('A hex, "ink", a name from the pack\'s colors, or null for no fill.'),
    stroke: z.string().nullable().default(INK).describe('A hex, "ink", a name from the pack\'s colors, or null for no outline.'),
    strokeWidth: z.number().min(0).default(1.5).describe("pt"),
    dash: z.enum(DASHES).default("solid"),
    radius: z.number().min(0).default(0).describe("Corner radius of a rect, pt."),
    text: textStyleFieldsSchema.default({}),
  },
  { error: (issue) => (issue.input === undefined ? `is missing; a shape style is ${SHAPE_STYLE_EXAMPLE}` : `must be an object; a shape style is ${SHAPE_STYLE_EXAMPLE}`) },
);
export type ShapeStyle = z.infer<typeof shapeStyleSchema>;

/** folio's own neutral shape style, the implied `default` of a pack that names none. */
export const NEUTRAL_SHAPE_STYLE: ShapeStyle = shapeStyleSchema.parse({});

/** Place a slot under another slot's rendered bottom; its own box bottom stays fixed. */
const belowSchema = z.strictObject({
  slot: z.string().min(1),
  gap: z.number().default(0),
}).describe('{"slot": "<slot in this layout>", "gap": <pt>}: the top follows that slot\'s rendered bottom plus the gap; the box bottom stays fixed.');

const SLOT_EXAMPLE = '{"role": "body", "box": [40, 40, 880, 460]}';

export const slotSchema = z.object(
  {
    role: roleSchema,
    box: boxSchema,
    lines: z.number().int().positive().nullable().default(null),
    enforce: z.boolean().default(false),
    hook: z.string().nullable().default(null),
    style: z.string().nullable().default(null),
    description: z.string().nullable().default(null),
    placeholder: z
      .string({ error: "placeholder must be a string: the sample text the editor shows in the empty slot" })
      .trim()
      .min(1, { error: "placeholder is empty: write the sample text, or remove the field to show the role's default" })
      .max(200, { error: "placeholder is longer than 200 characters: shorten it to a hint of what belongs in the slot" })
      .nullable()
      .default(null),
    tableStyle: z.string().nullable().default(null).describe("Table slots: the name of one of the pack's `tables` styles."),
    below: belowSchema.nullable().default(null),
    ...boxStyleFields,
    draft: z.boolean().default(false).describe("Added slots only: the user drew this in the editor as a sketch of intent; it shows in Edit only, and folio check asks an agent to draw the real element (FOLIO-DRF-001)."),
  },
  { error: (issue) => (issue.input === undefined ? `is missing; a slot is ${SLOT_EXAMPLE}` : `must be an object; a slot is ${SLOT_EXAMPLE}`) },
);
export type Slot = z.infer<typeof slotSchema>;

export const decorationSchema = z.object(
  {
    image: z.string().nullable().default(null),
    text: z.string().nullable().default(null),
    style: z.string().nullable().default(null),
    box: boxSchema,
    backgrounds: z.array(z.string()).nullable().default(null),
  },
  { error: (issue) => (issue.input === undefined ? 'is missing; a decoration is {"image": "images/mark.svg", "box": [40, 40, 120, 120]}' : 'must be an object: {"image": "images/mark.svg", "box": [40, 40, 120, 120]}') },
);

const USAGE_SHAPE = '{"when": "...", "how": "..."}';

/**
 * A usage note: when to choose a layout (or the whole pack) and how to fill it.
 * Plain sentences, no markup: the editor shows them on the layout cards and
 * `folio prompt` prints them beside the slots.
 */
export const usageSchema = z.strictObject(
  {
    when: z.string({ error: `must be a string, one plain sentence saying when to choose this; write ${USAGE_SHAPE}` }).trim().min(1, { error: "is empty; say in one plain sentence when to choose this" }),
    how: z.string({ error: 'must be a string, plain sentences saying which slot holds what; or leave "how" out' }).trim().min(1, { error: 'is empty; say which slot holds what, or leave "how" out' }).nullable().default(null),
  },
  { error: (issue) => (issue.code === "unrecognized_keys" ? `unknown key ${issue.keys.map((k) => `"${k}"`).join(", ")}; a usage note holds only "when" and "how"` : `must be an object ${USAGE_SHAPE}`) },
).describe('Usage note: "when" is one plain sentence on when to choose this (shown under the layout card); "how" says which slot holds what (shown in the card tooltip and in folio prompt). No markup.');
export type Usage = z.infer<typeof usageSchema>;

const BACKGROUND_NEEDED = 'every layout names its background: add "background": "<name>" with one of the theme\'s backgrounds';

const SLOTS_EXAMPLE = '{"body": {"role": "body", "box": [40, 40, 880, 460]}}';
const LAYOUT_EXAMPLE = `{"description": "...", "background": "plain", "slots": ${SLOTS_EXAMPLE}}`;

export const layoutSchema = z.object(
  {
    description: z.string(),
    background: z.string({ error: (issue) => (issue.input === undefined ? `is missing; ${BACKGROUND_NEEDED}` : `must be a string; ${BACKGROUND_NEEDED}`) }),
    usage: usageSchema.nullable().default(null),
    slots: z.record(z.string(), slotSchema, { error: (issue) => (issue.input === undefined ? `is missing; write "slots": ${SLOTS_EXAMPLE}` : `must be an object of slots; write "slots": ${SLOTS_EXAMPLE}`) }),
    decorations: z.array(decorationSchema).default([]),
    aliases: z.record(z.string(), z.string()).default({}),
  },
  { error: (issue) => (issue.input === undefined ? `is missing; a layout is ${LAYOUT_EXAMPLE}` : `must be an object; a layout is ${LAYOUT_EXAMPLE}`) },
);
export type Layout = z.infer<typeof layoutSchema>;

const rulesSchema = z.object({
  maxChars: z.record(z.string(), z.number().int().positive()).default({}),
  guidance: z.array(z.string()).default([]),
});

const CANVAS_EXAMPLE = '{"w": 960, "h": 540, "unit": "pt"}';
const ROLES_EXAMPLE = `"roles": {"title": ${ROLE_STYLE_EXAMPLE}}`;
const BACKGROUNDS_EXAMPLE = `"backgrounds": {"plain": ${BACKGROUND_EXAMPLE}}`;
const LAYOUTS_EXAMPLE = `"layouts": {"title": ${LAYOUT_EXAMPLE}}`;
const NAME_RULE = "is not a pack name: lower-case letters, digits and hyphens only, e.g. \"dark\" or \"lectern\"";

/** The full `pack.json` document. */
export const packSchema = z.object({
  name: z.string({ error: (issue) => (issue.input === undefined ? `is missing; ${NAME_RULE}` : NAME_RULE) }).regex(/^[a-z0-9][a-z0-9-]*$/, { error: NAME_RULE }),
  version: z.number({ error: (issue) => (issue.input === undefined ? 'is missing; write "version": 1' : 'must be a positive integer, e.g. "version": 1') }).int().positive({ error: 'must be a positive integer, e.g. "version": 1' }),
  description: z.string().default(""),
  usage: usageSchema.nullable().default(null),
  canvas: z.object(
    { w: z.number().positive(), h: z.number().positive(), unit: z.literal("pt") },
    { error: (issue) => (issue.input === undefined ? `is missing; write "canvas": ${CANVAS_EXAMPLE}` : `must be an object; write "canvas": ${CANVAS_EXAMPLE}`) },
  ),
  fontFallback: z.string().default("sans-serif"),
  fonts: z.array(fontSchema).default([]),
  roles: z.record(z.string(), textStyleSchema, { error: (issue) => (issue.input === undefined ? `is missing; write ${ROLES_EXAMPLE}` : `must be an object of role styles; write ${ROLES_EXAMPLE}`) }),
  backgrounds: z.record(z.string(), backgroundSchema, { error: (issue) => (issue.input === undefined ? `is missing; write ${BACKGROUNDS_EXAMPLE}` : `must be an object of backgrounds; write ${BACKGROUNDS_EXAMPLE}`) }),
  tables: z.record(z.string(), tableStyleSchema).default({}),
  colors: colorsSchema,
  shapes: z.record(z.string(), shapeStyleSchema).default({}).describe('Named shape styles; "default" is implied: no fill, an ink stroke of 1.5 pt.'),
  blocks: z.record(z.string(), blockStyleSchema).default({}).describe('Named block styles (text boxes and code blocks); "default" is implied: a text block, no fill, no border, 12 pt padding, one column, grows.'),
  defaultBackground: z
    .never({ error: 'is no longer read: there is no pack-wide background. Remove it and give every layout "background": "<name>"' })
    .describe('Removed: each layout names its own "background".')
    .optional(),
  layouts: z.record(z.string(), layoutSchema, { error: (issue) => (issue.input === undefined ? `is missing; write ${LAYOUTS_EXAMPLE}` : `must be an object of layouts; write ${LAYOUTS_EXAMPLE}`) }),
  rules: rulesSchema.default({ maxChars: {}, guidance: [] }),
});
export type Pack = z.infer<typeof packSchema>;

/** Result of `loadPack`: the pack, or the problems that stop it being one. */
export type PackLoad = { ok: true; pack: Pack } | { ok: false; problems: string[] };

/**
 * Validate parsed `pack.json` content and check its internal references.
 *
 * @param json - the parsed JSON document, as read by the caller.
 * @returns `{ok: true, pack}` with defaults filled in, or `{ok: false, problems}`
 *   naming each bad path. Used by the server and CLI when a pack folder is read.
 */
export function loadPack(json: unknown): PackLoad {
  const parsed = packSchema.safeParse(json);
  if (!parsed.success) {
    const known = backgroundNames(json);
    return { ok: false, problems: parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}${i.path.at(-1) === "background" && known ? ` (${known})` : ""}`) };
  }
  const problems = packReferenceProblems(parsed.data);
  return problems.length ? { ok: false, problems } : { ok: true, pack: parsed.data };
}

/** The background names of unparsed pack JSON, for messages: `known: plain, black`. */
function backgroundNames(json: unknown): string | null {
  const backgrounds = (json as { backgrounds?: unknown } | null)?.backgrounds;
  return backgrounds && typeof backgrounds === "object" ? `known: ${Object.keys(backgrounds).join(", ")}` : null;
}

/**
 * Find references inside a pack that point at nothing.
 *
 * @param pack - a schema-valid pack.
 * @returns one message per layout whose background is not a theme background,
 *   per text slot whose role has no style, per table slot without a known
 *   table style, and per `below` that names no slot or closes a cycle.
 *   Empty when the pack is consistent.
 */
export function packReferenceProblems(pack: Pack): string[] {
  const problems: string[] = [];
  const backgrounds = Object.keys(pack.backgrounds).join(", ");
  for (const [layoutName, layout] of Object.entries(pack.layouts)) {
    if (!pack.backgrounds[layout.background]) {
      problems.push(`layouts.${layoutName}.background: "${layout.background}" is not one of the theme's backgrounds (known: ${backgrounds})`);
    }
    for (const [slotName, slot] of Object.entries(layout.slots)) {
      const at = `layouts.${layoutName}.slots.${slotName}`;
      const styleName = slot.style ?? slot.role;
      if (isTextRole(slot.role) && !pack.roles[styleName]) problems.push(`${at}: style "${styleName}" is not in roles`);
      problems.push(...tableSlotProblems(pack, at, slotName, slot), ...shapeSlotProblems(pack, at, slotName, slot), ...blockSlotProblems(pack, at, slotName, slot), ...boxStyleProblems(slot, at, isTextRole(slot.role), pack.colors));
    }
    problems.push(...belowProblems(layoutName, layout));
  }
  return [...problems, ...shapeStyleProblems(pack), ...blockStyleProblems(pack)];
}

/** The shape style names of a pack, `default` always among them. */
export function shapeStyleNames(pack: Pick<Pack, "shapes">): string[] {
  return [...new Set(["default", ...Object.keys(pack.shapes)])];
}

/** Problems of one shape slot: its name, its style and a hook it cannot take. */
function shapeSlotProblems(pack: Pack, at: string, name: string, slot: Slot): string[] {
  if (slot.role !== "shape") return [];
  const problems: string[] = [];
  if (!/^shape:[a-z0-9]+$/.test(name)) problems.push(`${at}: a shape slot is named "shape:<letter>", like "shape:a"; rename the slot`);
  if (slot.hook) problems.push(`${at}.hook: a shape slot takes no hook; remove the field`);
  if (slot.style && !shapeStyleNames(pack).includes(slot.style)) problems.push(`${at}.style: "${slot.style}" is not one of the pack's shape styles (known: ${shapeStyleNames(pack).join(", ")})`);
  return problems;
}

/** Colours of the pack's shape styles that are not a hex, `ink` or a pack colour. */
function shapeStyleProblems(pack: Pack): string[] {
  const problems: string[] = [];
  for (const [name, style] of Object.entries(pack.shapes)) {
    for (const key of ["fill", "stroke"] as const) {
      const value = style[key];
      if (value !== null && !isPackColor(value, pack.colors)) problems.push(`shapes.${name}.${key}: ${colorProblem(value, pack.colors)}`);
    }
  }
  return problems;
}

/** Problems of one slot's table fields: name, style, and a style on a slot that is not a table. */
function tableSlotProblems(pack: Pack, at: string, name: string, slot: Slot): string[] {
  const known = Object.keys(pack.tables);
  const knownNote = known.length ? `known: ${known.join(", ")}` : 'the pack declares no table styles; add "tables": {"<name>": {...}}';
  if (slot.role !== "table") return slot.tableStyle ? [`${at}.tableStyle: only a table slot names a table style; remove it or make the role "table"`] : [];
  const problems: string[] = [];
  if (!/^table:[a-z0-9]+$/.test(name)) problems.push(`${at}: a table slot is named "table:<letter>", like "table:a"; rename the slot`);
  if (!slot.tableStyle) problems.push(`${at}.tableStyle: is missing; a table slot names one of the pack's table styles (${knownNote})`);
  else if (!pack.tables[slot.tableStyle]) problems.push(`${at}.tableStyle: "${slot.tableStyle}" is not one of the pack's table styles (${knownNote})`);
  return problems;
}

/**
 * Problems of the `below` references of one layout.
 *
 * @returns one message per `below` naming a slot not in the layout, and one per
 *   slot caught in a cycle of `below` references.
 */
export function belowProblems(layoutName: string, layout: Layout): string[] {
  const problems: string[] = [];
  const names = Object.keys(layout.slots);
  for (const [slotName, slot] of Object.entries(layout.slots)) {
    if (!slot.below) continue;
    const at = `layouts.${layoutName}.slots.${slotName}.below.slot`;
    if (!layout.slots[slot.below.slot]) {
      problems.push(`${at}: "${slot.below.slot}" is not a slot of this layout (slots: ${names.join(", ")})`);
      continue;
    }
    const chain = [slotName];
    for (let next: string | undefined = slot.below.slot; next; next = layout.slots[next]?.below?.slot) {
      if (next === slotName) {
        problems.push(`${at}: the slots ${[...chain, slotName].join(" -> ")} sit below each other in a cycle; one of them must keep its own top`);
        break;
      }
      if (chain.includes(next)) break;
      chain.push(next);
    }
  }
  return problems;
}

/**
 * The JSON Schema of `pack.json`, for editors and for agents writing a pack.
 *
 * @returns a draft 2020-12 JSON Schema object. `folio pack schema` prints it.
 */
export function packJsonSchema(): object {
  return z.toJSONSchema(packSchema, { io: "input" });
}

/**
 * Split a pack reference such as `lectern@1` into name and version.
 *
 * @param ref - the `template` field of `deck.json`.
 * @returns `{name, version}`, with `version` null when none is pinned.
 */
export function parsePackRef(ref: string): { name: string; version: number | null } {
  const [name = "", version] = ref.split("@");
  return { name, version: version ? Number(version) : null };
}
