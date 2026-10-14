/**
 * A text box's effective style, gathered the way PowerPoint inherits it: the
 * master's text styles, the master placeholder, the layout placeholder and
 * the shape itself, each layer overriding the one before.
 */
import { colorIn, type ColorContext } from "./color.js";
import { all, attr, num, one, path, type X } from "./ooxml.js";

/** What one layer says about a text box; absent fields inherit. */
export interface TextLayer {
  size?: number;
  bold?: boolean;
  italic?: boolean;
  caps?: boolean;
  color?: string;
  font?: string;
  align?: "left" | "center" | "right" | "justify";
  anchor?: "top" | "middle" | "bottom";
  lineHeight?: number;
  /** An exact line pitch in pt, which a later percentage replaces. */
  linePts?: number;
  wrap?: boolean;
  insets?: [number, number, number, number];
}

export interface FontContext extends ColorContext {
  major: string;
  minor: string;
}

const ALIGN: Record<string, TextLayer["align"]> = { l: "left", ctr: "center", r: "right", just: "justify", dist: "justify" };
const ANCHOR: Record<string, TextLayer["anchor"]> = { t: "top", ctr: "middle", b: "bottom" };

const drop = (layer: TextLayer): TextLayer => Object.fromEntries(Object.entries(layer).filter(([, v]) => v !== undefined)) as TextLayer;

/** Character properties (`a:defRPr`, `a:rPr`). */
function runLayer(rPr: X | undefined, ctx: FontContext): TextLayer {
  if (!rPr) return {};
  const typeface = attr(one(rPr, "a:latin"), "typeface");
  const font = typeface === "+mj-lt" ? ctx.major : typeface === "+mn-lt" ? ctx.minor : typeface || undefined;
  const flag = (name: string) => (attr(rPr, name) === undefined ? undefined : ["1", "true", "on"].includes(attr(rPr, name)!));
  return drop({
    size: num(rPr, "sz") === undefined ? undefined : num(rPr, "sz")! / 100,
    bold: flag("b"),
    italic: flag("i"),
    caps: attr(rPr, "cap") === undefined ? undefined : attr(rPr, "cap") === "all",
    color: colorIn(one(rPr, "a:solidFill"), ctx) ?? undefined,
    font,
  });
}

/** Paragraph properties (`a:lvl1pPr`, `a:pPr`), with their default run. */
export function paraLayer(pPr: X | undefined, ctx: FontContext): TextLayer {
  if (!pPr) return {};
  const pct = num(path(pPr, "a:lnSpc", "a:spcPct"), "val");
  const pts = num(path(pPr, "a:lnSpc", "a:spcPts"), "val");
  const own = drop({
    align: ALIGN[attr(pPr, "algn") ?? ""],
    lineHeight: pct !== undefined ? Math.round((pct / 100000) * 1.2 * 100) / 100 : undefined,
    linePts: pts !== undefined ? pts / 100 : undefined,
  });
  return { ...runLayer(one(pPr, "a:defRPr"), ctx), ...own };
}

/** Body properties (`a:bodyPr`): anchor, wrap and insets in pt. */
export function bodyLayer(bodyPr: X | undefined): TextLayer {
  if (!bodyPr) return {};
  const inset = (name: string) => (num(bodyPr, name) === undefined ? undefined : num(bodyPr, name)! / 12700);
  const sides = [inset("lIns"), inset("tIns"), inset("rIns"), inset("bIns")];
  return drop({
    anchor: ANCHOR[attr(bodyPr, "anchor") ?? ""],
    wrap: attr(bodyPr, "wrap") === undefined ? undefined : attr(bodyPr, "wrap") !== "none",
    insets: sides.some((s) => s !== undefined) ? (sides as [number, number, number, number]) : undefined,
  });
}

/** The layer a text body (`p:txBody`) gives: its bodyPr, its list style's first level. */
export function textBodyLayer(txBody: X | undefined, ctx: FontContext): TextLayer {
  return merge(bodyLayer(one(txBody, "a:bodyPr")), paraLayer(path(txBody, "a:lstStyle", "a:lvl1pPr"), ctx));
}

/** The layer a shape's own first paragraph and first run give (slides only). */
export function contentLayer(txBody: X | undefined, ctx: FontContext): TextLayer {
  const para = all(txBody, "a:p")[0];
  const run = all(para, "a:r")[0];
  return merge(paraLayer(one(para, "a:pPr"), ctx), runLayer(one(run, "a:rPr"), ctx));
}

/** Merge layers, later ones winning; insets merge side by side. */
export function merge(...layers: TextLayer[]): TextLayer {
  const out: TextLayer = {};
  for (const layer of layers) {
    const insets = layer.insets && out.insets ? (layer.insets.map((v, i) => v ?? out.insets![i]) as TextLayer["insets"]) : layer.insets ?? out.insets;
    if (layer.lineHeight !== undefined) delete out.linePts;
    if (layer.linePts !== undefined) delete out.lineHeight;
    Object.assign(out, layer, insets ? { insets } : {});
  }
  return out;
}

/** The text and the plain sizes of a text body, for reports and guesses. */
export function plainText(txBody: X | undefined): string {
  return all(txBody, "a:p").map((p) => all(p, "a:r").map((r) => {
    const t = one(r, "a:t");
    return typeof t === "string" ? t : (t?.["#text"] ?? "");
  }).join("")).join("\n").trim();
}

/** PowerPoint's defaults beneath every layer. */
export const BASE_LAYER: TextLayer = { size: 18, bold: false, italic: false, caps: false, align: "left", anchor: "top", lineHeight: 1.2, wrap: true, insets: [7.2, 3.6, 7.2, 3.6] };
