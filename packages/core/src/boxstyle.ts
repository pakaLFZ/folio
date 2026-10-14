/**
 * A slot's box style: `fill` (a background), `border` (colour, width, dash)
 * and `padding` (pt between the box's edge and its text). The background and
 * border are drawn inside the box, the text inside the padding, and the line
 * limit and overflow are taken from the padded box (spec/slides/overrides.md,
 * "A text slot's box style"). Text slots take them; other roles that draw a
 * box may reuse the same fields.
 */
import { z } from "zod";
import { colorProblem, INK, isPackColor } from "./colors.js";

export const BORDER_DASHES = ["solid", "dash", "dot"] as const;
const BORDER_EXAMPLE = '{"color": "ink", "width": 1, "dash": "solid"}';

export const borderSchema = z.strictObject(
  {
    color: z.string().default(INK).describe('A hex, "ink" or a name from the pack\'s colors.'),
    width: z.number().min(0).default(1).describe("pt"),
    dash: z.enum(BORDER_DASHES).default("solid"),
  },
  { error: (issue) => (issue.code === "unrecognized_keys" ? `unknown key ${(issue.keys ?? []).map((k) => `"${k}"`).join(", ")}; a border is ${BORDER_EXAMPLE}` : `must be an object: ${BORDER_EXAMPLE}`) },
);
export type Border = z.infer<typeof borderSchema>;

/** The box style fields of a slot, as `slotSchema` carries them. */
export const boxStyleFields = {
  fill: z.string().nullable().default(null).describe('Text slots: the background, a hex, "ink" or a name from the pack\'s colors; null for none.'),
  border: borderSchema.nullable().default(null).describe(`Text slots: the border drawn inside the box, e.g. ${BORDER_EXAMPLE}; null for none.`),
  padding: z.number().min(0).default(0).describe("Text slots: pt between the box's edge and its text; the line limit counts from the padded box."),
};

export interface BoxStyle {
  fill: string | null;
  border: Border | null;
  padding: number;
}

/**
 * Why a slot's box style cannot stand.
 *
 * @param at - the slot's path, e.g. `layouts.canvas.slots.text:a`.
 * @param takesBoxStyle - whether the slot's role takes a box style (a text slot).
 * @returns one message per problem, each naming its path.
 */
export function boxStyleProblems(slot: BoxStyle, at: string, takesBoxStyle: boolean, palette: Record<string, string>): string[] {
  const given = (["fill", "border", "padding"] as const).filter((k) => (k === "padding" ? slot.padding > 0 : slot[k] !== null));
  if (!takesBoxStyle) return given.map((k) => `${at}.${k}: only a text slot takes a ${k}; remove it`);
  const colors: [string, string | null | undefined][] = [["fill", slot.fill], ["border.color", slot.border?.color]];
  return colors.flatMap(([key, value]) => (value && !isPackColor(value, palette) ? [`${at}.${key}: ${colorProblem(value, palette)}`] : []));
}
