/** Add editable deck slides to the pack's existing OOXML package. */
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { strToU8, strFromU8, unzipSync, zipSync } from "fflate";
import { backgroundOf, columnAlign, cssColor, parseMarkup, parseParagraphs, serializeMarkup, resolveAliases, resolveBlock, resolveShape, slideLayout, slideRoot, tableHeight, tableStyleOf, textSlots, type Box, type Pack, type SlideSpec, type TextStyle } from "@folio/core";
import { contentTypes, emu, esc, HEAD, NS, presentation, presentationRels, rels, srgb } from "./parts.js";
import { writePptx } from "./write.js";

export interface DeckSlide { id: string; spec: SlideSpec }
export interface Approximation { slide: string; slot: string; reason: string }
export interface DraftLeftOut { slide: string; slot: string }
export interface DeckPptx { bytes: Uint8Array; approximations: Approximation[]; drafts: DraftLeftOut[] }
export interface RenderedSlot { png?: Uint8Array; text?: string; box?: Box; table?: { columns: string[]; rows: string[][] } }
export type RenderedSlots = Record<string, RenderedSlot>;
interface Context { pack: Pack; deckDir: string; files: Record<string, Uint8Array>; rels: { id: string; type: string; target: string }[]; shapes: string[]; next: number; slide: string; approximations: Approximation[]; drafts: DraftLeftOut[]; rendered: RenderedSlots }
const xfrm = (b: Box) => `<a:xfrm><a:off x="${emu(b[0])}" y="${emu(b[1])}"/><a:ext cx="${emu(b[2])}" cy="${emu(b[3])}"/></a:xfrm>`;
const color = (v: string, pack?: Pack, ink = "#000000") => {
  const raw = pack ? cssColor(v, pack.colors, ink) : v;
  const hex = /^#[0-9a-f]{3}$/i.test(raw) ? `#${[...raw.slice(1)].map((x) => x + x).join("")}` : raw.slice(0, 7);
  return `<a:solidFill>${srgb(hex)}</a:solidFill>`;
};
const align = { left: "l", center: "ctr", right: "r", justify: "just" } as const;
const anchor = { top: "t", middle: "ctr", bottom: "b" } as const;

/** Every visible run has its own editable DrawingML character properties. */
export function textRuns(value: string, pack: Pack, style: TextStyle, ink: string): string {
  return parseMarkup(value).map((r) => {
    const attrs = `lang="en-US" sz="${Math.round((r.size ?? style.size) * 100)}" b="${r.bold || style.weight >= 600 ? 1 : 0}" i="${r.italic || style.italic ? 1 : 0}"${r.underline ? ' u="sng"' : ""}${r.strike ? ' strike="sngStrike"' : ""}${r.script !== "none" ? ` baseline="${r.script === "sub" ? -25000 : 30000}"` : ""}`;
    const highlight = r.highlight ? `<a:highlight>${srgb(cssColor(r.highlight, pack.colors, ink))}</a:highlight>` : "";
    const properties = `<a:rPr ${attrs}>${color(r.color ?? style.color ?? ink, pack, ink)}${highlight}<a:latin typeface="${esc(r.font ?? style.font ?? pack.fonts[0]?.family ?? "Arial")}"/></a:rPr>`;
    return r.text.split("\u2028").map((part, index) => `${index ? "<a:br/>" : ""}<a:r>${properties}<a:t xml:space="preserve">${esc(style.transform === "uppercase" ? part.toUpperCase() : part)}</a:t></a:r>`).join("");
  }).join("");
}
function textShape(c: Context, name: string, value: string, box: Box, style: TextStyle, ink: string, fill?: string | null, border?: { color: string; width: number; dash: string } | null, padding = 0, ph?: string): void {
  const id = c.next++;
  const phXml = ph === undefined ? "" : ph === "title" ? '<p:ph type="title"/>' : `<p:ph idx="${ph}"/>`;
  const paras = parseParagraphs(value).map((paragraph) => {
    const level = paragraph.level - 1;
    const indent = paragraph.kind ? ` lvl="${level}" marL="${emu(22 + level * 18)}" indent="-${emu(12)}"` : "";
    const bullet = paragraph.kind === "bullet" ? `<a:buChar char="${["•", "–", "▪"][level]}"/>` : paragraph.kind === "number" ? `<a:buAutoNum type="${["arabicPeriod", "alphaLcPeriod", "romanLcPeriod"][level]}" startAt="${paragraph.ordinal}"/>` : "";
    return `<a:p><a:pPr algn="${align[style.align]}"${indent}><a:lnSpc><a:spcPct val="${Math.round(style.lineHeight * 100000 / 1.2)}"/></a:lnSpc>${bullet}</a:pPr>${textRuns(serializeMarkup(paragraph.runs), c.pack, style, ink)}<a:endParaRPr lang="en-US"/></a:p>`;
  }).join("");
  const paint = fill ? color(fill, c.pack, ink) : "<a:noFill/>";
  const stroke = border ? `<a:ln w="${emu(border.width)}">${color(border.color, c.pack, ink)}${border.dash === "dash" ? '<a:prstDash val="dash"/>' : border.dash === "dot" ? '<a:prstDash val="dot"/>' : ""}</a:ln>` : "<a:ln><a:noFill/></a:ln>";
  c.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr>${phXml}</p:nvPr></p:nvSpPr><p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${paint}${stroke}</p:spPr><p:txBody><a:bodyPr lIns="${emu(padding)}" rIns="${emu(padding)}" tIns="${emu(padding)}" bIns="${emu(padding)}" anchor="${anchor[style.anchor]}"><a:noAutofit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`);
}
function tableShape(c: Context, name: string, value: unknown, box: Box, slot: Parameters<typeof tableStyleOf>[1], ink: string, shown?: { columns: string[]; rows: string[][] }): boolean {
  if (!value || typeof value !== "object") return false;
  let data: { columns: string[]; rows: string[][] };
  if (shown) data = shown;
  else if ("src" in value && typeof value.src === "string" && !value.src.startsWith("/") && !value.src.split(/[\\/]/).includes("..")) {
    try { data = JSON.parse(readFileSync(join(c.deckDir, value.src), "utf8")) as typeof data; } catch { return false; }
  } else data = value as typeof data;
  if (!Array.isArray(data.columns) || !Array.isArray(data.rows) || !data.columns.length) return false;
  const { style } = tableStyleOf(c.pack, slot, value);
  const rows = style.header ? [data.columns, ...data.rows] : data.rows;
  const rowH = tableHeight(style, data.rows.length) / Math.max(rows.length, 1);
  const cell = (s: string, r: number, col: number) => {
    const fill = r === 0 && style.header ? style.headerFill : r % 2 === 0 ? style.bandFill ?? style.fill : style.fill;
    const inkCell = r === 0 && style.header ? style.headerInk ?? style.ink ?? ink : style.ink ?? ink;
    const cellStyle = { ...c.pack.roles.body!, size: style.size, lineHeight: style.lineHeight, align: columnAlign(style, col), color: inkCell, font: style.font } as TextStyle;
    const edge = (side: string, enabled: boolean) => enabled && style.rule.width ? `<a:ln${side} w="${emu(style.rule.width)}">${color(style.rule.color, c.pack, ink)}</a:ln${side}>` : "";
    const border = edge("L", col === 0 && style.rule.outer) + edge("R", col === data.columns.length - 1 ? style.rule.outer : style.rule.columns) + edge("T", r === 0 && style.rule.outer) + edge("B", r === rows.length - 1 ? style.rule.outer : style.rule.rows);
    return `<a:tc><a:txBody><a:bodyPr><a:noAutofit/></a:bodyPr><a:lstStyle/><a:p><a:pPr algn="${align[cellStyle.align]}"/>${textRuns(s, c.pack, cellStyle, inkCell)}</a:p></a:txBody><a:tcPr marL="${emu(style.cellPad[3])}" marR="${emu(style.cellPad[1])}" marT="${emu(style.cellPad[0])}" marB="${emu(style.cellPad[2])}">${fill ? color(fill, c.pack, ink) : "<a:noFill/>"}${border}</a:tcPr></a:tc>`;
  };
  const widths = data.columns.map(() => `<a:gridCol w="${Math.round(emu(box[2]) / data.columns.length)}"/>`).join("");
  const body = rows.map((row, i) => `<a:tr h="${emu(rowH)}">${row.map((s, j) => cell(s, i, j)).join("")}</a:tr>`).join("");
  c.shapes.push(`<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${c.next++}" name="${esc(name)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>${xfrm(box).replace("a:xfrm", "p:xfrm").replace("/a:xfrm", "/p:xfrm")}<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr firstRow="${style.header ? 1 : 0}" bandRow="${style.bandFill ? 1 : 0}"/><a:tblGrid>${widths}</a:tblGrid>${body}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`);
  return true;
}
function imageBytes(c: Context, name: string, bytes: Uint8Array, extension: string, box: Box, description?: string): void {
  const target = `deck-${c.slide}-${c.next}${extension}`;
  c.files[`ppt/media/${target}`] = bytes;
  const rid = `rId${c.rels.length + 2}`;
  c.rels.push({ id: rid, type: "image", target: `../media/${target}` });
  c.shapes.push(`<p:pic><p:nvPicPr><p:cNvPr id="${c.next++}" name="${esc(name)}"${description === undefined ? "" : ` descr="${pictureDescription(description)}"`}/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr/></p:nvPicPr><p:blipFill><a:blip r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`);
}

/** Preserve code whitespace in an XML attribute as well as escaping markup. */
export const pictureDescription = (plainText: string): string => esc(plainText).replace(/\r/g, "&#13;").replace(/\n/g, "&#10;").replace(/\t/g, "&#9;");

/** Every BlockSlot uses browser rendering, regardless of its text or code style. */
export const isBlockPictureSlot = (slot: { role: string }): boolean => slot.role === "block";
function imageShape(c: Context, name: string, file: string, box: Box): boolean {
  const extension = extname(file).toLowerCase();
  if (![".png", ".jpg", ".jpeg", ".gif"].includes(extension) || file.startsWith("/") || file.split(/[\\/]/).includes("..")) return false;
  let bytes: Uint8Array;
  try { bytes = readFileSync(join(c.deckDir, file)); } catch { return false; }
  imageBytes(c, name, bytes, extension, box);
  return true;
}
function shapeShape(c: Context, name: string, value: unknown, slot: Parameters<typeof resolveShape>[1], ink: string): boolean {
  const s = resolveShape(c.pack, slot, value, ink);
  if (!s) return false;
  const line = s.kind === "line" || s.kind === "arrow";
  const geometry = line ? "line" : s.kind === "ellipse" ? "ellipse" : s.radius ? "roundRect" : "rect";
  const lineBox: Box = [slot.box[0] + Math.min(s.from[0], s.to[0]), slot.box[1] + Math.min(s.from[1], s.to[1]), Math.max(0.01, Math.abs(s.to[0] - s.from[0])), Math.max(0.01, Math.abs(s.to[1] - s.from[1]))];
  const flipped = (s.to[0] - s.from[0]) * (s.to[1] - s.from[1]) < 0;
  const transform = line ? xfrm(lineBox).replace("<a:xfrm>", `<a:xfrm${flipped ? ' flipV="1"' : ""}>`) : xfrm(slot.box);
  const heads = line ? `${s.heads === "start" || s.heads === "both" ? '<a:headEnd type="triangle"/>' : ""}${s.heads === "end" || s.heads === "both" ? '<a:tailEnd type="triangle"/>' : ""}` : "";
  c.shapes.push(`<p:sp><p:nvSpPr><p:cNvPr id="${c.next++}" name="${esc(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${transform}<a:prstGeom prst="${geometry}"><a:avLst/></a:prstGeom>${s.fill === "none" || line ? "<a:noFill/>" : color(s.fill)}<a:ln w="${emu(s.strokeWidth)}">${s.stroke === "none" ? "<a:noFill/>" : color(s.stroke)}${s.dash !== "solid" ? `<a:prstDash val="${s.dash === "dot" ? "dot" : "dash"}"/>` : ""}${heads}</a:ln></p:spPr></p:sp>`);
  if (s.text) textShape(c, `${name} text`, s.text, slot.box, s.textStyle, ink);
  return true;
}
function writeSlide(c: Context, slide: DeckSlide): { xml: string; layout: string } {
  const root = slideRoot(slide.spec);
  if (!root) throw new Error(`slide ${slide.id} has no root`);
  const layout = slideLayout(c.pack, root.layout, root.props);
  if (!layout) throw new Error(`slide ${slide.id} uses unknown layout ${root.layout}`);
  const props = resolveAliases(root.props, layout.aliases);
  const bg = backgroundOf(c.pack, layout, typeof props.background === "string" ? props.background : null);
  const texts = new Map(textSlots(c.pack, layout).map((t) => [t.name, t]));
  const baseSlots = c.pack.layouts[root.layout]?.slots ?? {};
  c.slide = slide.id;
  for (const [name, slot] of Object.entries(layout.slots)) {
    const value = props[name];
    if (value === null || value === undefined || value === "") continue;
    if (slot.draft) { c.drafts.push({ slide: slide.id, slot: name }); continue; }
    const rendered = c.rendered[`${slide.id}/${name}`];
    const box = rendered?.box ?? slot.box;
    const t = texts.get(name);
    const baseIndex = Object.keys(baseSlots).indexOf(name);
    const titleBefore = Object.entries(baseSlots).slice(0, baseIndex).some(([, s]) => s.role === "title");
    const ph = baseIndex < 0 ? undefined : slot.role === "title" && !titleBefore ? "title" : String(baseIndex + 10);
    if (isBlockPictureSlot(slot) && resolveBlock(c.pack, slot, value, bg.ink).kind === "text" && typeof value === "string") {
      const block = resolveBlock(c.pack, slot, value, bg.ink);
      textShape(c, name, slot.hook ? rendered?.text ?? value : value, box, block.textStyle, bg.ink, block.fill === "none" ? null : block.fill, block.border, block.padding);
    }
    else if (isBlockPictureSlot(slot)) {
      if (!rendered?.png) throw new Error(`${slide.id}/${name} has no rendered block picture`);
      const block = resolveBlock(c.pack, slot, value, bg.ink);
      imageBytes(c, name, rendered.png, ".png", box, block.kind === "code" ? block.content ?? "" : rendered.text ?? block.content ?? "");
      c.approximations.push({ slide: slide.id, slot: name, reason: "rendered block" });
    }
    else if (t && typeof value === "string") textShape(c, name, slot.hook ? rendered?.text ?? value : value, box, t.style, bg.ink, slot.fill, slot.border, slot.padding ?? 0, ph);
    else if (slot.role === "table" && tableShape(c, name, value, box, slot, bg.ink, rendered?.table)) continue;
    else if (slot.role === "shape" && shapeShape(c, name, value, { ...slot, box }, bg.ink)) continue;
    else if (slot.role === "figure" && rendered?.png) { imageBytes(c, name, rendered.png, ".png", box); if (typeof value !== "string" || value.toLowerCase().endsWith(".svg")) c.approximations.push({ slide: slide.id, slot: name, reason: "rendered figure" }); }
    else if (slot.role === "figure" && typeof value === "string" && imageShape(c, name, value, box)) continue;
    else if (rendered?.png) { imageBytes(c, name, rendered.png, ".png", box); c.approximations.push({ slide: slide.id, slot: name, reason: "rendered picture" }); }
    else throw new Error(`${slide.id}/${name} could not be rendered as a PowerPoint object or picture`);
  }
  const tree = `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${c.shapes.join("")}</p:spTree>`;
  const bgXml = `<p:bg><p:bgPr>${color(bg.fill)}<a:effectLst/></p:bgPr></p:bg>`;
  return { xml: `${HEAD}<p:sld ${NS}><p:cSld>${bgXml}${tree}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`, layout: bg.name === layout.background ? root.layout : `${root.layout} ${bg.name}` };
}
/** Reuse the pack export, adding slide parts and media in deck order. */
export function writeDeckPptx(pack: Pack, packDir: string, deckDir: string, slides: DeckSlide[], rendered: RenderedSlots = {}): DeckPptx {
  const files = unzipSync(writePptx(pack, packDir));
  const approximations: Approximation[] = [];
  const drafts: DraftLeftOut[] = [];
  const names = Object.entries(pack.layouts).flatMap(([name, l]) => [name, ...Object.keys(pack.backgrounds).filter((b) => b !== l.background).map((b) => `${name} ${b}`)]);
  for (const [i, slide] of slides.entries()) {
    const c: Context = { pack, deckDir, files, rels: [], shapes: [], next: 2, slide: slide.id, approximations, drafts, rendered };
    const part = writeSlide(c, slide);
    files[`ppt/slides/slide${i + 1}.xml`] = strToU8(part.xml);
    files[`ppt/slides/_rels/slide${i + 1}.xml.rels`] = strToU8(rels([{ id: "rId1", type: "slideLayout", target: `../slideLayouts/slideLayout${names.indexOf(part.layout) + 1}.xml` }, ...c.rels]));
  }
  const put = (path: string, s: string) => { files[path] = strToU8(s); };
  put("ppt/presentation.xml", presentation(pack.canvas.w, pack.canvas.h).replace("<p:sldSz", `<p:sldIdLst>${slides.map((_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 6}"/>`).join("")}</p:sldIdLst><p:sldSz`));
  put("ppt/_rels/presentation.xml.rels", presentationRels().replace("</Relationships>", `${slides.map((_, i) => `<Relationship Id="rId${i + 6}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("")}</Relationships>`));
  const extensions = [...new Set(Object.keys(files).filter((p) => p.startsWith("ppt/media/")).map((p) => extname(p).slice(1)))];
  put("[Content_Types].xml", contentTypes(names.length, extensions).replace("</Types>", `${slides.map((_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`));
  put("docProps/app.xml", strFromU8(files["docProps/app.xml"]!).replace("<Slides>0</Slides>", `<Slides>${slides.length}</Slides>`));
  return { bytes: zipSync(files), approximations, drafts };
}
