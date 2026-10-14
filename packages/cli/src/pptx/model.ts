/**
 * A pptx read into what the importer needs: the canvas, each master with its
 * theme, its layouts and their placeholders (box and text style resolved
 * through the master), the slides in order, the table styles and the
 * embedded fonts.
 */
import type { Box } from "@folio/core";
import { colorIn, colorMap, themeColors } from "./color.js";
import { all, attr, num, one, path, Pptx, pt, type X } from "./ooxml.js";
import { shapesOf, type Shape } from "./shapes.js";
import { BASE_LAYER, contentLayer, merge, paraLayer, textBodyLayer, type FontContext, type TextLayer } from "./textstyle.js";

export interface Fill {
  color: string;
  /** Why the colour is only an approximation (a gradient, a picture). */
  approx?: string;
  image?: string;
}

export interface Master {
  part: string;
  ctx: FontContext;
  background: Fill | null;
  shapes: Shape[];
  txStyles: { title?: X; body?: X; other?: X };
}

export interface Layout {
  part: string;
  name: string;
  master: Master;
  /** Its own background, or null to show the master's. */
  background: Fill | null;
  showMasterShapes: boolean;
  shapes: Shape[];
}

export interface Slide {
  part: string;
  number: number;
  layout: Layout;
  background: Fill | null;
  shapes: Shape[];
}

export interface Model {
  canvas: { w: number; h: number };
  masters: Master[];
  layouts: Layout[];
  slides: Slide[];
  tableStyles: X | undefined;
  embeddedFonts: { typeface: string; variant: string; part: string }[];
}

/** A background (`p:cSld/p:bg`) as one colour, noting what had to be approximated. */
function fillOf(bg: X | undefined, ctx: FontContext, pptx: Pptx, part: string): Fill | null {
  if (!bg) return null;
  const bgPr = one(bg, "p:bgPr");
  if (!bgPr) return { color: colorIn(one(bg, "p:bgRef"), ctx) ?? "#FFFFFF", approx: "a theme background style (bgRef), read as its colour" };
  const solid = colorIn(one(bgPr, "a:solidFill"), ctx);
  if (solid) return { color: solid };
  const stop = path(bgPr, "a:gradFill", "a:gsLst", "a:gs");
  if (stop) return { color: colorIn(stop, ctx) ?? "#FFFFFF", approx: "a gradient, read as its first stop" };
  const blipId = attr(path(bgPr, "a:blipFill", "a:blip"), "r:embed");
  if (blipId) return { color: "#FFFFFF", approx: "a picture background", image: pptx.rels(part).get(blipId)?.target };
  return { color: "#FFFFFF", approx: "a fill this reader does not know, read as white" };
}

/** Read one master, its theme and colour map. */
function readMaster(pptx: Pptx, part: string): Master {
  const xml = pptx.xml(part);
  const theme = pptx.xml(pptx.related(part, "theme")!);
  const fonts = path(theme, "a:themeElements", "a:fontScheme");
  const ctx: FontContext = {
    scheme: themeColors(theme),
    map: colorMap(one(xml, "p:clrMap")),
    major: attr(path(fonts, "a:majorFont", "a:latin"), "typeface") ?? "Arial",
    minor: attr(path(fonts, "a:minorFont", "a:latin"), "typeface") ?? "Arial",
  };
  const tx = one(xml, "p:txStyles");
  return { part, ctx, background: fillOf(path(xml, "p:cSld", "p:bg"), ctx, pptx, part), shapes: shapesOf(pptx, part), txStyles: { title: one(tx, "p:titleStyle"), body: one(tx, "p:bodyStyle"), other: one(tx, "p:otherStyle") } };
}

/** Read one layout of a master. */
function readLayout(pptx: Pptx, part: string, master: Master): Layout {
  const xml = pptx.xml(part);
  return {
    part,
    name: attr(one(xml, "p:cSld"), "name") ?? part.replace(/.*\//, "").replace(/\.xml$/, ""),
    master,
    background: fillOf(path(xml, "p:cSld", "p:bg"), master.ctx, pptx, part),
    showMasterShapes: attr(xml, "showMasterSp") !== "0",
    shapes: shapesOf(pptx, part),
  };
}

const TITLE_TYPES = ["title", "ctrTitle"];

/** The placeholder of a list that a placeholder inherits from: by index, then by type. */
export function parentPlaceholder(ph: NonNullable<Shape["ph"]>, shapes: Shape[], master = false): Shape | undefined {
  const phs = shapes.filter((s) => s.ph);
  if (master) {
    const type = TITLE_TYPES.includes(ph.type) ? "title" : ["dt", "ftr", "sldNum", "hdr"].includes(ph.type) ? ph.type : "body";
    return phs.find((s) => s.ph!.type === type);
  }
  return (ph.idx !== "0" ? phs.find((s) => s.ph!.idx === ph.idx) : undefined) ?? phs.find((s) => s.ph!.type === ph.type || (TITLE_TYPES.includes(ph.type) && TITLE_TYPES.includes(s.ph!.type)));
}

export interface Resolved {
  box: Box | null;
  style: TextLayer;
}

/**
 * A placeholder's box and text style, inherited through its layout and master.
 *
 * @param shape - the placeholder on a slide or a layout.
 * @param layout - its layout, or null when the shape is on the layout itself.
 */
export function resolvePlaceholder(shape: Shape, master: Master, layout: Layout | null): Resolved {
  const ph = shape.ph!;
  const fromLayout = layout ? parentPlaceholder(ph, layout.shapes) : undefined;
  const fromMaster = parentPlaceholder(fromLayout?.ph ?? ph, master.shapes, true);
  const txStyle = TITLE_TYPES.includes(ph.type) ? master.txStyles.title : master.txStyles.body;
  const layers = [BASE_LAYER, paraLayer(one(txStyle, "a:lvl1pPr"), master.ctx), textBodyLayer(fromMaster?.txBody, master.ctx), textBodyLayer(fromLayout?.txBody, master.ctx), textBodyLayer(shape.txBody, master.ctx)];
  if (layout) layers.push(contentLayer(shape.txBody, master.ctx));
  return { box: shape.box ?? fromLayout?.box ?? fromMaster?.box ?? null, style: merge(...layers) };
}

/** A text box's style: the master's other-text style, then its own body and first run. */
export function resolveTextBox(shape: Shape, master: Master): TextLayer {
  return merge(BASE_LAYER, paraLayer(one(master.txStyles.other, "a:lvl1pPr"), master.ctx), textBodyLayer(shape.txBody, master.ctx), contentLayer(shape.txBody, master.ctx));
}

/** Read the slides in presentation order. */
function readSlides(pptx: Pptx, layouts: Layout[]): Slide[] {
  const rels = pptx.rels("ppt/presentation.xml");
  const ids = all(path(pptx.xml("ppt/presentation.xml"), "p:sldIdLst"), "p:sldId");
  return ids.flatMap((id, i) => {
    const part = rels.get(attr(id, "r:id") ?? "")?.target;
    const layout = part && layouts.find((l) => l.part === pptx.related(part, "slideLayout"));
    if (!part || !layout) return [];
    const background = fillOf(path(pptx.xml(part), "p:cSld", "p:bg"), layout.master.ctx, pptx, part);
    return [{ part, number: i + 1, layout, background, shapes: shapesOf(pptx, part) }];
  });
}

/**
 * Read a pptx.
 *
 * @throws when it has no slide master.
 */
export function readModel(pptx: Pptx): Model {
  const pres = pptx.xml("ppt/presentation.xml");
  const rels = pptx.rels("ppt/presentation.xml");
  const masterParts = all(path(pres, "p:sldMasterIdLst"), "p:sldMasterId").map((m) => rels.get(attr(m, "r:id") ?? "")?.target).filter((p): p is string => Boolean(p));
  if (!masterParts.length) throw new Error("the pptx has no slide master; save it from PowerPoint (View > Slide Master shows it)");
  const masters = masterParts.map((p) => readMaster(pptx, p));
  const layouts = masters.flatMap((m) => all(path(pptx.xml(m.part), "p:sldLayoutIdLst"), "p:sldLayoutId").map((l) => pptx.rels(m.part).get(attr(l, "r:id") ?? "")?.target).filter((p): p is string => Boolean(p)).map((p) => readLayout(pptx, p, m)));
  const size = one(pres, "p:sldSz");
  const embeddedFonts = all(path(pres, "p:embeddedFontLst"), "p:embeddedFont").flatMap((f) => {
    const typeface = attr(one(f, "p:font"), "typeface") ?? "";
    return ["p:regular", "p:bold", "p:italic", "p:boldItalic"].flatMap((t) => {
      const target = rels.get(attr(one(f, t), "r:id") ?? "")?.target;
      return target ? [{ typeface, variant: t.slice(2), part: target }] : [];
    });
  });
  return {
    canvas: { w: pt(num(size, "cx") ?? 12192000), h: pt(num(size, "cy") ?? 6858000) },
    masters,
    layouts,
    slides: readSlides(pptx, layouts),
    tableStyles: pptx.has("ppt/tableStyles.xml") ? pptx.xml("ppt/tableStyles.xml") : undefined,
    embeddedFonts,
  };
}
