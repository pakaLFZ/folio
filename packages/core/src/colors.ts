/**
 * Colours a pack names once and slides refer to: a hex, `ink` (the slide
 * background's ink), or a name from the pack's `colors`.
 */
import { z } from "zod";

/** The reserved colour name for the ink of the slide's background. */
export const INK = "ink";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** A hex colour: `#c00`, `#cc0000` or `#cc000080`. */
export const hexColorSchema = z.string().regex(HEX, { error: (issue) => `"${String(issue.input)}" is not a hex colour; write "#cc0000"` });

/** The pack's named colours: lower-case names, hex values, `ink` reserved. */
export const colorsSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9-]*$/, { error: 'a colour name is lower-case letters, digits and hyphens, like "accent" or "brand-blue"' }).refine((name) => name !== INK, { error: '"ink" is reserved for the background\'s ink; choose another name' }),
    hexColorSchema,
  )
  .default({})
  .describe('Named colours, {"red": "#FF0000"}: a shape may name one instead of a hex.');

/**
 * Whether a value is a colour of this pack.
 *
 * @param value - a colour as written in a pack or a slide.
 * @param palette - the pack's `colors`.
 */
export function isPackColor(value: string, palette: Record<string, string>): boolean {
  return HEX.test(value) || value === INK || value in palette;
}

/**
 * Why a value is not a colour of this pack.
 *
 * @returns a sentence naming what is accepted, with the pack's colour names.
 */
export function colorProblem(value: string, palette: Record<string, string>): string {
  const names = Object.keys(palette);
  return `"${value}" is not a colour: write a hex like "#cc0000", "ink" for the background's ink, or one of the pack's colours (${names.length ? names.join(", ") : "the pack names none"})`;
}

/**
 * The CSS colour a pack colour stands for.
 *
 * @param value - a pack colour, or null for none.
 * @param palette - the pack's `colors`.
 * @param ink - the slide background's ink.
 * @returns the hex, or `none` for null; an unknown name falls back to the ink.
 */
export function cssColor(value: string | null, palette: Record<string, string>, ink: string): string {
  if (value === null) return "none";
  if (HEX.test(value)) return value;
  return palette[value] ?? ink;
}
