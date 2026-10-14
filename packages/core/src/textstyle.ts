/**
 * Role styles: how a text role sets its font, size, line height and colour,
 * and the same fields all optional, which shape and block styles lay over a role.
 */
import { z } from "zod";

export const ROLE_STYLE_EXAMPLE = '{"size": 26, "lineHeight": 1.2, "weight": 700}';

export const textStyleSchema = z.object(
  {
    font: z.string().nullable().default(null),
    size: z.number().positive(),
    weight: z.number().int().min(100).max(900).default(400),
    italic: z.boolean().default(false),
    lineHeight: z.number().positive(),
    align: z.enum(["left", "center", "right", "justify"]).default("left"),
    transform: z.enum(["none", "uppercase"]).default("none"),
    color: z.string().nullable().default(null),
    wrap: z.boolean().default(true),
    anchor: z.enum(["top", "middle", "bottom"]).default("top"),
  },
  { error: (issue) => (issue.input === undefined ? `is missing; a role style is ${ROLE_STYLE_EXAMPLE}` : `must be an object; a role style is ${ROLE_STYLE_EXAMPLE}`) },
);
export type TextStyle = z.infer<typeof textStyleSchema>;

/** Every field of a role style, none required: what a shape style lays over the body style of its text. */
export const textStyleFieldsSchema = z
  .strictObject(Object.fromEntries(Object.entries(textStyleSchema.shape).map(([key, field]) => [key, (field instanceof z.ZodDefault ? (field.unwrap() as z.ZodType) : field).optional()])) as { [K in keyof TextStyle]: z.ZodOptional<z.ZodType<TextStyle[K]>> })
  .describe("Role style fields (font, size, weight, italic, lineHeight, align, transform, color, wrap, anchor), each optional.");
