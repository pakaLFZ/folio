/**
 * Shape slots: the shape a slide gives (`{"kind": "rect", ...}`), the named
 * style the pack gives, and the text a rect or ellipse holds. The slide's
 * fields win over the style it names, which wins over the slot's style, which
 * wins over `default`.
 */
import { z } from "zod";
import { colorProblem, cssColor, isPackColor } from "./colors.js";
import type { RefinedSlot, ResolvedLayout } from "./overrides.js";
import { NEUTRAL_SHAPE_STYLE, shapeStyleNames, type Pack, type ShapeStyle, type TextStyle } from "./pack.js";
import { shapeTextBox, type Dash, type Heads, type Point } from "./shapegeometry.js";
import { lineLimitOf, type ResolvedTextSlot } from "./theme.js";

export const SHAPE_KINDS = ["rect", "ellipse", "arrow", "line"] as const;
export type ShapeKind = (typeof SHAPE_KINDS)[number];

/** The fields each kind takes besides `kind`. */
const KIND_FIELDS: Record<ShapeKind, string[]> = {
  rect: ["style", "fill", "stroke", "strokeWidth", "dash", "radius", "text"],
  ellipse: ["style", "fill", "stroke", "strokeWidth", "dash", "text"],
  arrow: ["style", "stroke", "strokeWidth", "dash", "heads", "from", "to"],
  line: ["style", "stroke", "strokeWidth", "dash", "from", "to"],
};

const KIND_EXAMPLES: Record<ShapeKind, string> = {
  rect: '{"kind": "rect", "fill": "#f5f5f5", "radius": 6, "text": "Step 1"}',
  ellipse: '{"kind": "ellipse", "stroke": "#cc0000", "strokeWidth": 2}',
  arrow: '{"kind": "arrow", "from": [0, 40], "to": [200, 40], "heads": "end"}',
  line: '{"kind": "line", "dash": "dash"}',
};

const pointSchema = z.tuple([z.number(), z.number()], { error: "must be [x, y] in pt from the box's top-left, e.g. [0, 40]" });

/** The value of a shape slot, as a slide stores it. */
export interface ShapeValue {
  kind: ShapeKind;
  style?: string;
  fill?: string | null;
  stroke?: string | null;
  strokeWidth?: number;
  dash?: Dash;
  radius?: number;
  heads?: Heads;
  from?: Point;
  to?: Point;
  text?: string;
}

/**
 * The slide value of a shape slot.
 *
 * @param pack - the pack, for its shape style names and colours.
 * @returns a strict object refusing fields its kind does not take, unknown
 *   style names and colours that are not a hex, `ink` or a pack colour; or null.
 */
export function shapeValueSchema(pack: Pick<Pack, "shapes" | "colors">) {
  const color = z.string().refine((c) => isPackColor(c, pack.colors), { error: (issue) => colorProblem(String(issue.input), pack.colors) }).nullable();
  const styles = shapeStyleNames(pack);
  return z
    .strictObject({
      kind: z.enum(SHAPE_KINDS, { error: (issue) => `${issue.input === undefined ? "is missing" : `"${String(issue.input)}" is not a shape kind`}; kind is ${SHAPE_KINDS.join(", ")} (a circle is an ellipse in a square box), e.g. ${KIND_EXAMPLES.rect}` }),
      style: z.string().refine((s) => styles.includes(s), { error: (issue) => `"${String(issue.input)}" is not one of the pack's shape styles (known: ${styles.join(", ")})` }).optional(),
      fill: color.optional(),
      stroke: color.optional(),
      strokeWidth: z.number().min(0).optional(),
      dash: z.enum(["solid", "dash", "dot"]).optional(),
      radius: z.number().min(0).optional(),
      heads: z.enum(["end", "start", "both", "none"]).optional(),
      from: pointSchema.optional(),
      to: pointSchema.optional(),
      text: z.string().optional(),
    }, { error: (issue) => (issue.code === "unrecognized_keys" ? `unknown key ${(issue.keys ?? []).map((k) => `"${k}"`).join(", ")}; a shape is ${KIND_EXAMPLES.rect}` : `a shape is an object like ${KIND_EXAMPLES.rect}`) })
    .superRefine((shape, ctx) => {
      const allowed = KIND_FIELDS[shape.kind];
      for (const key of Object.keys(shape)) {
        if (key !== "kind" && !allowed.includes(key)) ctx.addIssue({ code: "custom", path: [key], message: `${shape.kind === "arrow" || shape.kind === "ellipse" ? "an" : "a"} ${shape.kind} takes no "${key}"; its fields are ${allowed.join(", ")}, e.g. ${KIND_EXAMPLES[shape.kind]}` });
      }
    })
    .nullable();
}

/** A shape as drawn: every field filled in, colours as CSS (`none` for no paint). */
export interface ResolvedShape {
  kind: ShapeKind;
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: Dash;
  radius: number;
  heads: Heads;
  from: Point;
  to: Point;
  text: string | null;
  textStyle: TextStyle;
}

/** The style a shape takes before its own fields: the slide's pick, else the slot's, else `default`. */
function namedStyle(pack: Pack, slot: RefinedSlot, value: ShapeValue): ShapeStyle {
  const name = [value.style, slot.style, "default"].find((n) => n && (pack.shapes[n] || n === "default"))!;
  return pack.shapes[name] ?? NEUTRAL_SHAPE_STYLE;
}

/**
 * The text style of a shape's text: the pack's `body` role (the first role
 * when there is none), centred and anchored in the middle, then the shape
 * style's `text`, then the slot's `text` override.
 */
export function shapeTextStyle(pack: Pack, style: ShapeStyle, slot: RefinedSlot): TextStyle {
  const base = pack.roles.body ?? Object.values(pack.roles)[0]!;
  return { ...base, align: "center", anchor: "middle", ...style.text, ...slot.text };
}

/**
 * Resolve a shape slot's value for drawing.
 *
 * @param pack - the pack.
 * @param slot - the shape slot after overrides; `box` gives the default `from` and `to`.
 * @param value - the slide's value; a value the schema refuses draws nothing.
 * @param ink - the background's ink, for `ink` and for an unknown colour name.
 * @returns the shape with every field filled in, or null.
 */
export function resolveShape(pack: Pack, slot: RefinedSlot, value: unknown, ink: string): ResolvedShape | null {
  const parsed = shapeValueSchema(pack).safeParse(value);
  if (!parsed.success || !parsed.data) return null;
  const v = parsed.data as ShapeValue;
  const style = namedStyle(pack, slot, v);
  const [, , w, h] = slot.box;
  const paint = (c: string | null) => cssColor(c, pack.colors, ink);
  return {
    kind: v.kind,
    fill: paint(v.kind === "rect" || v.kind === "ellipse" ? (v.fill === undefined ? style.fill : v.fill) : null),
    stroke: paint(v.stroke === undefined ? style.stroke : v.stroke),
    strokeWidth: v.strokeWidth ?? style.strokeWidth,
    dash: v.dash ?? style.dash,
    radius: v.radius ?? style.radius,
    heads: v.kind === "arrow" ? (v.heads ?? "end") : "none",
    from: v.from ?? [0, h / 2],
    to: v.to ?? [w, h / 2],
    text: v.text ?? null,
    textStyle: shapeTextStyle(pack, style, slot),
  };
}

/**
 * The text of every shape slot that holds some, as text slots to measure.
 *
 * @param pack - the pack.
 * @param layout - the slide's layout with its overrides.
 * @param props - the slide's props, which hold each shape.
 * @returns one entry per rect or ellipse with text: its style and the line
 *   limit of its text box (the slot's `lines` when declared).
 */
export function shapeTextSlots(pack: Pack, layout: ResolvedLayout, props: Record<string, unknown>): ResolvedTextSlot[] {
  const out: ResolvedTextSlot[] = [];
  for (const [name, slot] of Object.entries(layout.slots)) {
    if (slot.role !== "shape") continue;
    const shape = resolveShape(pack, slot, props[name], "#000000");
    if (!shape?.text || (shape.kind !== "rect" && shape.kind !== "ellipse")) continue;
    const [, , tw, th] = shapeTextBox(shape.kind, slot.box[2], slot.box[3], shape.strokeWidth);
    out.push({ name, slot: { ...slot, box: [0, 0, tw, th] }, style: shape.textStyle, lineLimit: lineLimitOf(slot, shape.textStyle, th) });
  }
  return out;
}

/**
 * The next free shape slot name.
 *
 * @param taken - the names in use: the layout's slots, the slide's overrides and props.
 * @returns `shape:a`, `shape:b`, ... `shape:z`, then `shape:a1`, ...
 */
export function nextShapeName(taken: Iterable<string>): string {
  const used = new Set(taken);
  const letters = "abcdefghijklmnopqrstuvwxyz";
  for (let round = 0; ; round += 1) {
    for (const letter of letters) {
      const name = `shape:${letter}${round ? round : ""}`;
      if (!used.has(name)) return name;
    }
  }
}
