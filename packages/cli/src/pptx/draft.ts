/**
 * The pack being built by an import: its JSON, the files to write beside it,
 * the report, the text styles met, and the registries that give images and
 * backgrounds stable names.
 */
import { createHash } from "node:crypto";
import { posix } from "node:path";
import { luminance } from "./color.js";
import type { Fill, Model } from "./model.js";
import type { Pptx } from "./ooxml.js";
import { Report, slug, unique } from "./report.js";
import { StyleBank } from "./slots.js";

export interface DraftPack {
  name: string;
  version: number;
  description: string;
  canvas: { w: number; h: number; unit: "pt" };
  fontFallback: string;
  fonts: Record<string, unknown>[];
  roles: Record<string, unknown>;
  backgrounds: Record<string, { fill: string; ink: string; image?: string }>;
  tables: Record<string, unknown>;
  layouts: Record<string, any>;
  rules: { maxChars: Record<string, number>; guidance: string[] };
}

export interface Draft {
  pptx: Pptx;
  model: Model;
  source: string;
  pack: DraftPack;
  files: Map<string, Uint8Array>;
  report: Report;
  styles: StyleBank;
  /** Image part -> pack path, and content hash -> pack path. */
  images: Map<string, string>;
  /** Layout part -> the folio layout and background it became. */
  layoutOf: Map<string, { layout: string; background: string }>;
}

/** Start an empty draft. */
export function newDraft(pptx: Pptx, model: Model, name: string, source: string): Draft {
  const minor = model.masters[0]!.ctx.minor;
  const generic = /serif|times|georgia|cambria|garamond|minion/i.test(minor) && !/sans/i.test(minor) ? "serif" : "sans-serif";
  const pack: DraftPack = {
    name,
    version: 1,
    description: "",
    canvas: { w: model.canvas.w, h: model.canvas.h, unit: "pt" },
    fontFallback: `${minor}, ${generic}`,
    fonts: [],
    roles: {},
    backgrounds: {},
    tables: {},
    layouts: {},
    rules: { maxChars: {}, guidance: [] },
  };
  return { pptx, model, source, pack, files: new Map(), report: new Report(), styles: new StyleBank(), images: new Map(), layoutOf: new Map() };
}

/**
 * Copy an image part into `images/`, once per distinct content.
 *
 * @param hint - a name for the file (the shape's name), made lower case.
 * @returns the pack-relative path.
 */
export function placeImage(draft: Draft, part: string, hint: string): string {
  const known = draft.images.get(part);
  if (known) return known;
  const bytes = draft.pptx.bytes(part);
  const hash = createHash("sha256").update(bytes).digest("hex");
  const same = draft.images.get(hash);
  if (same) return (draft.images.set(part, same), same);
  const ext = posix.extname(part).toLowerCase() || ".png";
  const taken = new Set([...draft.files.keys()].map((p) => posix.basename(p, posix.extname(p))));
  const path = `images/${unique(slug(hint), taken)}${ext}`;
  draft.files.set(path, bytes);
  draft.images.set(part, path).set(hash, path);
  return path;
}

/** The ink that reads on a fill: the theme's light or dark text colour, or white or black. */
function inkFor(draft: Draft, fill: string): string {
  const { scheme, map } = draft.model.masters[0]!.ctx;
  const light = `#${scheme[map.bg1 ?? "lt1"] ?? "FFFFFF"}`;
  const dark = `#${scheme[map.tx1 ?? "dk1"] ?? "000000"}`;
  if (luminance(fill) < 0.4) return luminance(light) > 0.6 ? light : "#FFFFFF";
  return luminance(dark) < 0.2 ? dark : "#000000";
}

/**
 * Name a background fill: `word` for a variant (`black`), `plain` for a white
 * base, otherwise a name that already has this colour, or `bg-<hex>`.
 *
 * @returns the background's name in the pack.
 */
export function registerBackground(draft: Draft, fill: Fill, word: string | null, where: string): string {
  const backgrounds = draft.pack.backgrounds;
  const sameFill = (name: string) => backgrounds[name]?.fill.toUpperCase() === fill.color.toUpperCase() && (backgrounds[name]?.image ?? null) === (fill.image ? placeImage(draft, fill.image, `${word ?? "background"}-background`) : null);
  const hex = fill.color.slice(1).toLowerCase();
  let name = word ? slug(word) : fill.color.toUpperCase() === "#FFFFFF" && !fill.image ? "plain" : Object.keys(backgrounds).find(sameFill) ?? `bg-${hex}`;
  if (backgrounds[name] && !sameFill(name)) name = unique(`${name}-${hex}`, backgrounds);
  if (!backgrounds[name]) {
    backgrounds[name] = { fill: fill.color.toUpperCase(), ink: inkFor(draft, fill.color) };
    if (fill.image) backgrounds[name]!.image = placeImage(draft, fill.image, `${name}-background`);
  }
  if (fill.approx) draft.report.tally("backgrounds", `${fill.approx}; it became background "${name}" (${backgrounds[name]!.fill}). Check it against the pptx: folio pack edit ${draft.pack.name} set backgrounds.${name}.fill='"#RRGGBB"'`, where);
  return name;
}
