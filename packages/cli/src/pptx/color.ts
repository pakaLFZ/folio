/**
 * DrawingML colours to `#RRGGBB`: literal, system, preset and theme colours
 * (through the master's colour map), with the luminance, tint and shade
 * modifiers PowerPoint applies.
 */
import { all, attr, num, one, type X } from "./ooxml.js";

export interface ColorContext {
  /** Theme colours by scheme name (`dk1`, `accent1`, ...), as `RRGGBB`. */
  scheme: Record<string, string>;
  /** The master's colour map (`bg1` -> `lt1`). */
  map: Record<string, string>;
}

const PRESET: Record<string, string> = { black: "000000", white: "FFFFFF", red: "FF0000", green: "008000", blue: "0000FF", gray: "808080", grey: "808080" };
const KINDS = ["a:srgbClr", "a:schemeClr", "a:sysClr", "a:prstClr", "a:scrgbClr"];

const hexOf = (rgb: number[]) => rgb.map((c) => Math.round(Math.min(255, Math.max(0, c))).toString(16).padStart(2, "0")).join("").toUpperCase();
const rgbOf = (hex: string) => [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));

function toHsl([r, g, b]: number[]): number[] {
  const [rr, gg, bb] = [r! / 255, g! / 255, b! / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === rr ? (gg - bb) / d + (gg < bb ? 6 : 0) : max === gg ? (bb - rr) / d + 2 : (rr - gg) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: number[]): number[] {
  if (s === 0) return [l! * 255, l! * 255, l! * 255];
  const q = l! < 0.5 ? l! * (1 + s!) : l! + s! - l! * s!;
  const p = 2 * l! - q;
  const hue = (t: number) => {
    const u = t < 0 ? t + 1 : t > 1 ? t - 1 : t;
    return u < 1 / 6 ? p + (q - p) * 6 * u : u < 1 / 2 ? q : u < 2 / 3 ? p + (q - p) * (2 / 3 - u) * 6 : p;
  };
  return [hue(h! + 1 / 3) * 255, hue(h!) * 255, hue(h! - 1 / 3) * 255];
}

/** Apply lumMod, lumOff, tint and shade, in document order. */
function modified(hex: string, node: X): string {
  let rgb = rgbOf(hex);
  const mods = Object.keys(node).filter((k) => !k.startsWith("@"));
  for (const tag of mods) {
    const value = (num(one(node, tag), "val") ?? 100000) / 100000;
    if (tag === "a:lumMod" || tag === "a:lumOff") {
      const [h, s, l] = toHsl(rgb);
      rgb = fromHsl([h!, s!, Math.min(1, Math.max(0, tag === "a:lumMod" ? l! * value : l! + value))]);
    } else if (tag === "a:tint") rgb = rgb.map((c) => c + (255 - c) * (1 - value));
    else if (tag === "a:shade") rgb = rgb.map((c) => c * value);
  }
  return hexOf(rgb);
}

/** The base colour of one colour element, before modifiers. */
function baseOf(kind: string, node: X, ctx: ColorContext): string | null {
  if (kind === "a:srgbClr") return (attr(node, "val") ?? "000000").toUpperCase();
  if (kind === "a:sysClr") return (attr(node, "lastClr") ?? (attr(node, "val") === "window" ? "FFFFFF" : "000000")).toUpperCase();
  if (kind === "a:prstClr") return PRESET[attr(node, "val") ?? ""] ?? null;
  if (kind === "a:scrgbClr") return hexOf(["r", "g", "b"].map((c) => ((num(node, c) ?? 0) / 100000) * 255));
  const name = attr(node, "val") ?? "";
  return ctx.scheme[ctx.map[name] ?? name] ?? null;
}

/**
 * The colour held by an element that contains one colour child
 * (`a:solidFill`, `a:fontRef`, `a:lnRef`).
 *
 * @returns `#RRGGBB`, or null when it holds no colour this reader knows.
 */
export function colorIn(holder: X | undefined, ctx: ColorContext): string | null {
  for (const kind of KINDS) {
    const node = one(holder, kind);
    if (!node) continue;
    const base = baseOf(kind, node, ctx);
    return base ? `#${modified(base, node)}` : null;
  }
  return null;
}

/** Read a theme's colour scheme. */
export function themeColors(theme: X): Record<string, string> {
  const scheme = one(one(theme, "a:themeElements"), "a:clrScheme");
  const out: Record<string, string> = {};
  for (const [tag, list] of Object.entries(scheme ?? {})) {
    if (tag.startsWith("@") || !Array.isArray(list)) continue;
    const color = colorIn(list[0], { scheme: {}, map: {} });
    if (color) out[tag.replace(/^a:/, "")] = color.slice(1);
  }
  return out;
}

/** Read a master's colour map. */
export function colorMap(clrMap: X | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(clrMap ?? {})) if (k.startsWith("@")) out[k.slice(1)] = v as string;
  return out;
}

/** Relative luminance of `#RRGGBB`, 0 black to 1 white. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex.slice(1)).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

/** Whether a fill element holds no paint (`a:noFill`). */
export const isNoFill = (holder: X | undefined): boolean => all(holder, "a:noFill").length > 0;
