/**
 * The shapes of one slide, layout or master (`p:spTree`), flattened into
 * one list with boxes in pt: placeholders, pictures, text boxes, tables,
 * other graphics (charts, diagrams), groups and plain drawn shapes.
 */
import type { Box } from "@folio/core";
import { all, attr, num, one, path, pt, type Pptx, type X } from "./ooxml.js";
import { plainText } from "./textstyle.js";

export type ShapeKind = "placeholder" | "picture" | "text" | "table" | "graphic" | "group" | "drawn" | "connector";

export interface Shape {
  kind: ShapeKind;
  name: string;
  /** The shape's alt text (`descr`); `folio role: <role>` there names the slot's role. */
  descr?: string;
  /** Box in pt, or null when a placeholder takes its layout's box. */
  box: Box | null;
  /** Placeholder type (`title`, `body`, `pic`, ... ; `obj` when none is given) and index. */
  ph?: { type: string; idx: string; custom: boolean };
  txBody?: X;
  text: string;
  /** Picture part path (an SVG when the picture has one). */
  image?: string;
  table?: X;
  /** Fill of a drawn shape, for the report. */
  spPr?: X;
  children?: Shape[];
}

interface Frame {
  part: string;
  pptx: Pptx;
  /** Map child coordinates (EMU) of the enclosing groups to slide coordinates. */
  map: (x: number, y: number, w: number, h: number) => [number, number, number, number];
}

const IDENTITY: Frame["map"] = (x, y, w, h) => [x, y, w, h];

/** The box of an `a:xfrm` (or `p:xfrm`), mapped through the enclosing groups. */
function boxOf(xfrm: X | undefined, frame: Frame): Box | null {
  const off = one(xfrm, "a:off");
  const ext = one(xfrm, "a:ext");
  if (!off || !ext) return null;
  const [x, y, w, h] = frame.map(num(off, "x") ?? 0, num(off, "y") ?? 0, num(ext, "cx") ?? 0, num(ext, "cy") ?? 0);
  return [pt(x), pt(y), Math.max(pt(w), 0.1), Math.max(pt(h), 0.1)];
}

/** The placeholder a shape's non-visual properties declare, if any. */
function placeholderOf(nv: X | undefined): Shape["ph"] {
  const ph = path(nv, "p:nvPr", "p:ph");
  if (!ph) return undefined;
  return { type: attr(ph, "type") ?? "obj", idx: attr(ph, "idx") ?? "0", custom: attr(ph, "hasCustomPrompt") === "1" };
}

/** The image a picture shows: its SVG when it carries one, else its bitmap. */
function imageOf(pic: X, frame: Frame): string | undefined {
  const blip = path(pic, "p:blipFill", "a:blip");
  const ext = all(one(blip, "a:extLst"), "a:ext").map((e) => Object.entries(e).find(([k]) => k.endsWith(":svgBlip"))?.[1]?.[0]).find(Boolean);
  const id = attr(ext, "r:embed") ?? attr(blip, "r:embed");
  return id ? frame.pptx.rels(frame.part).get(id)?.target : undefined;
}

/** One `p:sp`. */
function spShape(sp: X, frame: Frame): Shape {
  const nv = one(sp, "p:nvSpPr");
  const ph = placeholderOf(nv);
  const txBody = one(sp, "p:txBody");
  const text = plainText(txBody);
  const isText = attr(one(nv, "p:cNvSpPr"), "txBox") === "1" || text.length > 0;
  const kind: ShapeKind = ph ? "placeholder" : isText ? "text" : "drawn";
  return { kind, name: attr(one(nv, "p:cNvPr"), "name") ?? "", descr: attr(one(nv, "p:cNvPr"), "descr"), box: boxOf(path(sp, "p:spPr", "a:xfrm"), frame), ph, txBody, text, spPr: one(sp, "p:spPr") };
}

/** One `p:pic`. */
function picShape(pic: X, frame: Frame): Shape {
  const nv = one(pic, "p:nvPicPr");
  return { kind: "picture", name: attr(one(nv, "p:cNvPr"), "name") ?? "", box: boxOf(path(pic, "p:spPr", "a:xfrm"), frame), ph: placeholderOf(nv), text: "", image: imageOf(pic, frame) };
}

/** One `p:graphicFrame`: a table, or a chart or diagram. */
function frameShape(gf: X, frame: Frame): Shape {
  const nv = one(gf, "p:nvGraphicFramePr");
  const data = path(gf, "a:graphic", "a:graphicData");
  const table = one(data, "a:tbl");
  return { kind: table ? "table" : "graphic", name: attr(one(nv, "p:cNvPr"), "name") ?? "", box: boxOf(one(gf, "p:xfrm"), frame), ph: placeholderOf(nv), text: "", table };
}

/** One `p:grpSp`: its box, and its children mapped into slide coordinates. */
function groupShape(grp: X, frame: Frame): Shape {
  const xfrm = path(grp, "p:grpSpPr", "a:xfrm");
  const [off, ext, chOff, chExt] = ["a:off", "a:ext", "a:chOff", "a:chExt"].map((t) => one(xfrm, t));
  const sx = (num(ext, "cx") ?? 1) / (num(chExt, "cx") || 1);
  const sy = (num(ext, "cy") ?? 1) / (num(chExt, "cy") || 1);
  const inner: Frame["map"] = (x, y, w, h) => frame.map((num(off, "x") ?? 0) + (x - (num(chOff, "x") ?? 0)) * sx, (num(off, "y") ?? 0) + (y - (num(chOff, "y") ?? 0)) * sy, w * sx, h * sy);
  const name = attr(path(grp, "p:nvGrpSpPr", "p:cNvPr"), "name") ?? "";
  return { kind: "group", name, box: boxOf(xfrm, frame), text: "", children: treeShapes(grp, { ...frame, map: inner }) };
}

/** Every shape directly under a tree or group element. */
function treeShapes(tree: X, frame: Frame): Shape[] {
  return [
    ...all(tree, "p:sp").map((s) => spShape(s, frame)),
    ...all(tree, "p:pic").map((s) => picShape(s, frame)),
    ...all(tree, "p:graphicFrame").map((s) => frameShape(s, frame)),
    ...all(tree, "p:grpSp").map((s) => groupShape(s, frame)),
    ...all(tree, "p:cxnSp").map((s): Shape => ({ kind: "connector", name: attr(path(s, "p:nvCxnSpPr", "p:cNvPr"), "name") ?? "", box: boxOf(path(s, "p:spPr", "a:xfrm"), frame), text: "" })),
  ];
}

/**
 * The shapes of a part's `p:cSld/p:spTree`.
 *
 * @param pptx - the open file.
 * @param part - the slide, layout or master part path.
 */
export function shapesOf(pptx: Pptx, part: string): Shape[] {
  const tree = path(pptx.xml(part), "p:cSld", "p:spTree");
  return tree ? treeShapes(tree, { part, pptx, map: IDENTITY }) : [];
}
