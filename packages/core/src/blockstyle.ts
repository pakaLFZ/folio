/**
 * Block styles: the named looks a pack gives its `block` slots (spec/slides/blocks.md).
 * A block style is declarative JSON (fill, border, padding, columns, grow, text
 * fields, and for code a language, line numbers and syntax colours); a pack adds
 * its own "components" by adding a named style, and nothing it declares runs.
 */
import { z } from "zod";
import { borderSchema } from "./boxstyle.js";
import { colorProblem, isPackColor } from "./colors.js";
import { deepMerge } from "./merge.js";
import type { Pack, Slot } from "./pack.js";
import { textStyleFieldsSchema } from "./textstyle.js";

/** The languages a code block highlights; `text` is plain, unhighlighted. */
export const CODE_LANGUAGES = ["python", "bash", "shell", "javascript", "typescript", "json", "toml", "yaml", "c", "cpp", "rust", "go", "java", "sql", "r", "julia", "fortran", "latex", "markdown", "text"] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/** The token classes a code style colours. */
export const SYNTAX_TOKENS = ["keyword", "string", "comment", "number", "function", "type", "meta"] as const;
export type SyntaxToken = (typeof SYNTAX_TOKENS)[number];

export const BLOCK_KINDS = ["text", "code"] as const;
export const BORDER_SIDES = ["all", "left", "top", "right", "bottom"] as const;

const BLOCK_STYLE_EXAMPLE = '{"kind": "text", "fill": "#ffffff", "border": {"color": "#cccccc", "width": 0.75}, "padding": 12, "columns": 2, "grow": true}';

const unknownKey = (example: string, what: string) => (issue: { code?: string; keys?: string[]; input?: unknown }) =>
  issue.code === "unrecognized_keys" ? `unknown key ${(issue.keys ?? []).map((k) => `"${k}"`).join(", ")}; ${what} is ${example}` : `must be an object; ${what} is ${example}`;

/** A language name, refused with the list. */
export const codeLanguageSchema = z.enum(CODE_LANGUAGES, { error: (issue) => `${issue.input === undefined ? "is missing" : `"${String(issue.input)}" is not a code language`}; languages: ${CODE_LANGUAGES.join(", ")}` });

/** The text slot's border (`boxstyle.ts`), plus the side it is drawn on. */
const blockBorderSchema = borderSchema.extend({
  side: z.enum(BORDER_SIDES).default("all").describe('"left" draws a bar down the left edge only, as on a callout.'),
});

const syntaxSchema = z
  .strictObject(Object.fromEntries(SYNTAX_TOKENS.map((t) => [t, z.string().optional()])) as Record<SyntaxToken, z.ZodOptional<z.ZodString>>, { error: unknownKey('{"keyword": "#0033b3", "string": "#067d17", "comment": "#8c8c8c"}', `syntax holds ${SYNTAX_TOKENS.join(", ")}; an example`) })
  .describe("Code: token colours; a token left out takes a colour readable on the fill.");

/** A named block style. Every field has a default, so `{}` is folio's neutral text block. */
export const blockStyleSchema = z.strictObject(
  {
    description: z.string().nullable().default(null),
    kind: z.enum(BLOCK_KINDS, { error: `kind is "text" or "code"` }).default("text"),
    fill: z.string().nullable().default(null).describe('A hex, "ink", a name from the pack\'s colors, or null for none.'),
    border: blockBorderSchema.nullable().default(null),
    radius: z.number().min(0).default(0).describe("pt"),
    padding: z.number().min(0).default(12).describe("Inside the border, every side, pt."),
    columns: z.number({ error: "columns is a whole number from 1 to 4" }).int({ error: "columns is a whole number from 1 to 4" }).min(1, { error: "columns is a whole number from 1 to 4" }).max(4, { error: "columns is a whole number from 1 to 4" }).default(1),
    columnGap: z.number().min(0).default(18).describe("pt"),
    grow: z.boolean().default(true).describe("true: the height follows the content, the slot's box height is the maximum."),
    text: textStyleFieldsSchema.default({}),
    language: codeLanguageSchema.default("python"),
    lineNumbers: z.boolean().default(false),
    syntax: syntaxSchema.default({}),
  },
  { error: unknownKey(BLOCK_STYLE_EXAMPLE, "a block style") },
);
export type BlockStyle = z.infer<typeof blockStyleSchema>;

/** folio's neutral block style, the implied `default` of a pack that names none. */
export const NEUTRAL_BLOCK_STYLE: BlockStyle = blockStyleSchema.parse({});

/** The block style names of a pack, `default` always among them. */
export function blockStyleNames(pack: Pick<Pack, "blocks">): string[] {
  return [...new Set(["default", ...Object.keys(pack.blocks)])];
}

/** The colours a block style names, each with its path under the style. */
function styleColors(style: BlockStyle): [string, string | null | undefined][] {
  return [["fill", style.fill], ["border.color", style.border?.color], ["text.color", style.text.color], ...SYNTAX_TOKENS.map((t) => [`syntax.${t}`, style.syntax[t]] as [string, string | undefined])];
}

/**
 * Problems of one block style that its schema cannot see.
 *
 * @param at - the style's path, e.g. `blocks.code`.
 * @returns a colour that is not a hex, `ink` or a pack colour; a code style
 *   without a font the pack ships.
 */
export function blockStyleProblemsOf(pack: Pick<Pack, "colors" | "fonts">, at: string, style: BlockStyle): string[] {
  const problems = styleColors(style).flatMap(([key, value]) => (value && !isPackColor(value, pack.colors) ? [`${at}.${key}: ${colorProblem(value, pack.colors)}`] : []));
  if (style.kind !== "code") return problems;
  const families = [...new Set(pack.fonts.map((f) => f.family))];
  if (!style.text.font || !families.includes(style.text.font)) problems.push(`${at}.text.font: a code style names a monospace font the pack ships in "fonts" (fonts: ${families.join(", ") || "none"}), e.g. "text": {"font": "Liberation Mono"}`);
  return problems;
}

/** Problems of every block style of a pack. */
export function blockStyleProblems(pack: Pick<Pack, "blocks" | "colors" | "fonts">): string[] {
  return Object.entries(pack.blocks).flatMap(([name, style]) => blockStyleProblemsOf(pack, `blocks.${name}`, style));
}

/**
 * Problems of one block slot: its name, its style, and a hook on a code block.
 *
 * @param at - the slot's path, e.g. `layouts.L.slots.block:a`.
 */
export function blockSlotProblems(pack: Pick<Pack, "blocks">, at: string, name: string, slot: Slot): string[] {
  if (slot.role !== "block") return [];
  const problems: string[] = [];
  const names = blockStyleNames(pack);
  if (!/^block:[a-z0-9]+$/.test(name)) problems.push(`${at}: a block slot is named "block:<letter>", like "block:a"; rename the slot`);
  if (slot.style && !names.includes(slot.style)) problems.push(`${at}.style: "${slot.style}" is not one of the pack's block styles (known: ${names.join(", ")})`);
  const style = pack.blocks[slot.style ?? "default"];
  if (slot.hook && style?.kind === "code") problems.push(`${at}.hook: a code block takes no hook (code is shown exactly as written); remove the field`);
  return problems;
}

/** The name of the style a block slot names, `default` when it names none the pack has. */
function styleNameOf(pack: Pick<Pack, "blocks">, slot: { style: string | null }): string {
  return slot.style && pack.blocks[slot.style] ? slot.style : "default";
}

/**
 * The style a block is drawn with: the slot's named style with the slide's
 * `block` fields laid over it.
 *
 * @param slot - the block slot after overrides; `block` is the slide's partial style.
 * @returns the style name and the style, every field filled in; a refinement
 *   the schema refuses leaves the named style (the write check names it).
 */
export function refinedBlockStyle(pack: Pick<Pack, "blocks">, slot: { style: string | null; block?: unknown }): { name: string; style: BlockStyle } {
  const name = styleNameOf(pack, slot);
  const base = pack.blocks[name] ?? NEUTRAL_BLOCK_STYLE;
  if (!slot.block) return { name, style: base };
  const merged = blockStyleSchema.safeParse(deepMerge(base, slot.block));
  return { name, style: merged.success ? merged.data : base };
}

/**
 * Problems of a slide's `block` fields laid over a slot's style.
 *
 * @returns each problem with its path under the slot's `block` override.
 */
export function blockRefinementProblems(pack: Pick<Pack, "blocks" | "colors" | "fonts">, slot: { style: string | null; block?: unknown }): { path: (string | number)[]; message: string }[] {
  if (!slot.block) return [];
  const merged = blockStyleSchema.safeParse(deepMerge(pack.blocks[styleNameOf(pack, slot)] ?? NEUTRAL_BLOCK_STYLE, slot.block));
  if (!merged.success) return merged.error.issues.map((i) => ({ path: i.path as (string | number)[], message: i.message }));
  return blockStyleProblemsOf(pack, "", merged.data).map((p) => ({ path: p.slice(1, p.indexOf(": ")).split("."), message: p.slice(p.indexOf(": ") + 2) }));
}
