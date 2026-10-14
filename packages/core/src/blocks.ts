/**
 * Block slots: what a slide puts in one (text, or code with its language) and
 * the block as drawn, every field filled in from its named style, the slide's
 * `block` fields and the background (spec/slides/blocks.md).
 */
import { z } from "zod";
import { CODE_LANGUAGES, refinedBlockStyle, SYNTAX_TOKENS, type BlockStyle, type CodeLanguage, type SyntaxToken } from "./blockstyle.js";
import { cssColor } from "./colors.js";
import type { RefinedSlot } from "./overrides.js";
import type { Pack, TextStyle } from "./pack.js";

const CODE_EXAMPLE = '{"code": "print(42)", "language": "python"}';

/** Light-fill and dark-fill syntax palettes, used for every token a style leaves out. */
export const SYNTAX_DEFAULTS: Record<"light" | "dark", Record<SyntaxToken, string>> = {
  light: { keyword: "#0033B3", string: "#067D17", comment: "#8C8C8C", number: "#1750EB", function: "#00627A", type: "#871094", meta: "#9E880D" },
  dark: { keyword: "#CC7832", string: "#6A8759", comment: "#808080", number: "#6897BB", function: "#FFC66D", type: "#9876AA", meta: "#BBB529" },
};

/** One problem of a block's value: its path under the slot's prop, and what is allowed. */
export interface BlockValueProblem {
  path: (string | number)[];
  message: string;
}

/**
 * Why a slide's value does not fit a block.
 *
 * @param kind - the block's kind, from its style.
 * @param styleName - the style's name, for the message.
 * @param codeStyles - the pack's code styles, named when code is given to a text block.
 * @returns empty for null, text on a text block, and code (a string, or
 *   `{code, language}` with a known language) on a code block.
 */
export function blockValueProblems(kind: BlockStyle["kind"], styleName: string, value: unknown, codeStyles: string[] = []): BlockValueProblem[] {
  if (value === null || value === undefined || typeof value === "string") return [];
  if (kind === "text") {
    const where = codeStyles.length ? `a style of kind code (${codeStyles.join(", ")})` : "a style of kind code";
    return [{ path: [], message: `a text block (style ${styleName}) holds text with markup, e.g. "**Key point**: ..."; code goes in a block of ${where}` }];
  }
  if (typeof value !== "object" || Array.isArray(value)) return [{ path: [], message: `a code block holds a string of code or ${CODE_EXAMPLE}` }];
  const out: BlockValueProblem[] = [];
  const { code, language, ...rest } = value as Record<string, unknown>;
  for (const key of Object.keys(rest)) out.push({ path: [key], message: `unknown key "${key}"; a code block holds ${CODE_EXAMPLE}` });
  if (typeof code !== "string") out.push({ path: ["code"], message: `${code === undefined ? "is missing" : "must be a string"}; a code block holds ${CODE_EXAMPLE}` });
  if (language !== undefined && !(CODE_LANGUAGES as readonly unknown[]).includes(language)) out.push({ path: ["language"], message: `"${String(language)}" is not a code language; languages: ${CODE_LANGUAGES.join(", ")}` });
  return out;
}

/**
 * The slide value schema of one block slot.
 *
 * @param pack - the pack, for its block styles.
 * @param slot - the block slot after the slide's overrides.
 * @returns a schema accepting what `blockValueProblems` accepts, its issues at their paths.
 */
export function blockValueSchema(pack: Pick<Pack, "blocks">, slot: RefinedSlot) {
  const { name, style } = refinedBlockStyle(pack, slot);
  const codeStyles = Object.entries(pack.blocks).filter(([, s]) => s.kind === "code").map(([n]) => n);
  return z.unknown().superRefine((value, ctx) => {
    for (const p of blockValueProblems(style.kind, name, value, codeStyles)) ctx.addIssue({ code: "custom", path: p.path, message: p.message });
  });
}

/** A block as drawn: colours as CSS (`none` for no paint), every field filled in. */
export interface ResolvedBlock {
  styleName: string;
  kind: BlockStyle["kind"];
  fill: string;
  border: { color: string; width: number; dash: "solid" | "dash" | "dot"; side: "all" | "left" | "top" | "right" | "bottom" } | null;
  radius: number;
  padding: number;
  columns: number;
  columnGap: number;
  grow: boolean;
  textStyle: TextStyle;
  /** Text: the markup; code: the source. Null when the slot is empty. */
  content: string | null;
  language: CodeLanguage;
  lineNumbers: boolean;
  syntax: Record<SyntaxToken, string>;
}

/** Whether a CSS hex colour is light (relative luminance above one half). */
export function isLight(hex: string): boolean {
  const m = /^#([0-9a-f]{6}|[0-9a-f]{3})(?:[0-9a-f]{2})?$/i.exec(hex);
  if (!m) return true;
  const h = m[1]!.length === 3 ? [...m[1]!].map((c) => c + c).join("") : m[1]!;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b! > 0.5;
}

/** The text and code of a value: a string, or `{code, language}`. */
function contentOf(value: unknown): { content: string | null; language?: CodeLanguage } {
  if (typeof value === "string") return { content: value };
  if (!value || typeof value !== "object") return { content: null };
  const v = value as { code?: unknown; language?: unknown };
  const language = (CODE_LANGUAGES as readonly unknown[]).includes(v.language) ? (v.language as CodeLanguage) : undefined;
  return { content: typeof v.code === "string" ? v.code : null, language };
}

/**
 * The text style of a block: the pack's `body` role (the first role when
 * there is none), the style's `text`, then the slot's `text` override. A
 * block with a fill and no text colour takes near-black or white, whichever
 * reads on the fill; without a fill, the background's ink.
 */
export function blockTextStyle(pack: Pick<Pack, "roles" | "colors">, style: BlockStyle, slot: RefinedSlot, fill: string, ink: string): TextStyle {
  const base = pack.roles.body ?? Object.values(pack.roles)[0]!;
  const merged: TextStyle = { ...base, color: null, ...style.text, ...slot.text };
  const readable = fill === "none" ? ink : isLight(fill) ? "#111111" : "#FFFFFF";
  return { ...merged, color: merged.color ? cssColor(merged.color, pack.colors, ink) : readable };
}

/**
 * Resolve a block slot for drawing.
 *
 * @param pack - the pack.
 * @param slot - the block slot after overrides.
 * @param value - the slide's value (text, code, or `{code, language}`), or null.
 * @param ink - the background's ink.
 * @returns the block with every field filled in.
 */
export function resolveBlock(pack: Pick<Pack, "blocks" | "roles" | "colors">, slot: RefinedSlot, value: unknown, ink: string): ResolvedBlock {
  const { name, style } = refinedBlockStyle(pack, slot);
  const paint = (c: string | null | undefined) => cssColor(c ?? null, pack.colors, ink);
  const fill = paint(style.fill);
  const palette = SYNTAX_DEFAULTS[fill === "none" ? (isLight(ink) ? "dark" : "light") : isLight(fill) ? "light" : "dark"];
  const { content, language } = contentOf(value);
  return {
    styleName: name,
    kind: style.kind,
    fill,
    border: style.border ? { ...style.border, color: paint(style.border.color) } : null,
    radius: style.radius,
    padding: style.padding,
    columns: style.columns,
    columnGap: style.columnGap,
    grow: style.grow,
    textStyle: blockTextStyle(pack, style, slot, fill, ink),
    content: content === "" ? null : content,
    language: language ?? style.language,
    lineNumbers: style.lineNumbers,
    syntax: Object.fromEntries(SYNTAX_TOKENS.map((t) => [t, style.syntax[t] ? paint(style.syntax[t]) : palette[t]])) as Record<SyntaxToken, string>,
  };
}

/** The width of a block's border on one side, pt. */
export function borderWidth(block: Pick<ResolvedBlock, "border">, side: "left" | "top" | "right" | "bottom"): number {
  const b = block.border;
  return b && (b.side === "all" || b.side === side) ? b.width : 0;
}

/**
 * The value a code block stores.
 *
 * @param code - the source.
 * @param language - the language asked for, or undefined for the style's.
 * @param styleLanguage - the style's language.
 * @returns the plain string when the language is the style's, else `{code, language}`.
 */
export function codeValue(code: string, language: CodeLanguage | undefined, styleLanguage: CodeLanguage): string | { code: string; language: CodeLanguage } {
  return !language || language === styleLanguage ? code : { code, language };
}

/**
 * How many code lines each column of a code block holds, in order.
 *
 * @param lines - the code's line count.
 * @param columns - the block's columns.
 * @param rowsFit - the lines one column holds in a block that does not grow,
 *   or null for a growing block.
 * @returns one count per column. A growing block balances them, ceil(lines /
 *   columns) to a column; a fixed one fills each column to `rowsFit` before
 *   the next, and its last column takes whatever is left (and overflows).
 */
export function codeColumnSizes(lines: number, columns: number, rowsFit: number | null): number[] {
  const per = rowsFit === null ? Math.ceil(lines / columns) : Math.max(1, rowsFit);
  const sizes = Array.from({ length: columns }, (_, i) => Math.max(0, Math.min(per, lines - i * per)));
  if (rowsFit !== null) sizes[columns - 1]! += Math.max(0, lines - per * columns);
  return sizes;
}
