/**
 * `folio pack export --pptx`: a PowerPoint file with no slides whose slide
 * master and layouts reproduce a pack. Each pack layout becomes a PowerPoint
 * layout on its own background, plus one variant per other background
 * (`note-figure black`), as PowerPoint templates switch backgrounds; each
 * slot a placeholder named after the slot, its role in the alt text, at its
 * box, with its role's text style; decorations become pictures and text
 * boxes; table styles go into `tableStyles.xml`. Importing the file gives
 * back the same layouts, boxes, backgrounds and table styles.
 */
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { zipSync, strToU8 } from "fflate";
import { isTextRole, type Box, type Layout, type Pack, type Slot, type TextStyle } from "@folio/core";
import { contentTypes, docProps, emu, esc, HEAD, NS, presentation, presentationRels, presProps, rels, rootRels, srgb, theme, viewProps } from "./parts.js";
import { tableStylesPart } from "./tablexml.js";

interface Part {
  xml: string[];
  rels: { id: string; type: string; target: string }[];
  nextId: number;
}

const ALGN = { left: "l", center: "ctr", right: "r", justify: "just" } as const;
const ANCHOR = { top: "t", middle: "ctr", bottom: "b" } as const;
const PH_TYPE: Record<string, string> = { title: "title", subtitle: "subTitle", figure: "pic", table: "tbl" };

const xfrm = (box: Box) => `<a:xfrm><a:off x="${emu(box[0])}" y="${emu(box[1])}"/><a:ext cx="${emu(box[2])}" cy="${emu(box[3])}"/></a:xfrm>`;
const fontOf = (pack: Pack, style: TextStyle) => style.font ?? pack.fonts[0]?.family ?? pack.fontFallback.split(",")[0]!.trim().replace(/^["']|["']$/g, "");

/** Character properties of a text style. */
function runProps(pack: Pack, style: TextStyle, ink: string, tag: string): string {
  const attrs = `sz="${Math.round(style.size * 100)}" b="${style.weight >= 600 ? 1 : 0}" i="${style.italic ? 1 : 0}"${style.transform === "uppercase" ? ' cap="all"' : ""}`;
  return `<a:${tag} lang="en-US" ${attrs}><a:solidFill>${srgb(style.color ?? ink)}</a:solidFill><a:latin typeface="${esc(fontOf(pack, style))}"/></a:${tag}>`;
}

/** Paragraph properties of a text style: alignment, line spacing, no bullet. */
function paraProps(style: TextStyle, inner: string, tag = "a:lvl1pPr"): string {
  const pct = Math.round((style.lineHeight / 1.2) * 100000);
  return `<${tag} marL="0" indent="0" algn="${ALGN[style.align]}"><a:lnSpc><a:spcPct val="${pct}"/></a:lnSpc><a:spcBef><a:spcPts val="0"/></a:spcBef><a:buNone/>${inner}</${tag}>`;
}

const bodyPr = (style: TextStyle | null) => `<a:bodyPr lIns="0" tIns="0" rIns="0" bIns="0" anchor="${ANCHOR[style?.anchor ?? "top"]}" wrap="${style?.wrap === false ? "none" : "square"}" rtlCol="0"><a:noAutofit/></a:bodyPr>`;

/** One slot as a placeholder shape named after the slot. */
function slotShape(pack: Pack, part: Part, name: string, slot: Slot, ink: string, idx: number, titleTaken: boolean): string {
  const type = slot.role === "title" && titleTaken ? "body" : PH_TYPE[slot.role] ?? "body";
  const ph = `<p:ph type="${type}"${type === "title" ? "" : ` idx="${idx}"`}${slot.placeholder ? ' hasCustomPrompt="1"' : ""}/>`;
  const style = isTextRole(slot.role) ? pack.roles[slot.style ?? slot.role] ?? null : null;
  const tableSize = slot.tableStyle ? pack.tables[slot.tableStyle]?.size : undefined;
  const list = style ? `<a:lstStyle>${paraProps(style, runProps(pack, style, ink, "defRPr"))}</a:lstStyle>` : tableSize ? `<a:lstStyle><a:lvl1pPr><a:defRPr sz="${Math.round(tableSize * 100)}"/></a:lvl1pPr></a:lstStyle>` : "<a:lstStyle/>";
  const prompt = esc(slot.placeholder ?? name);
  const id = part.nextId++;
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(name)}" descr="folio role: ${slot.role}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr><p:nvPr>${ph}</p:nvPr></p:nvSpPr><p:spPr>${xfrm(slot.box)}</p:spPr><p:txBody>${bodyPr(style)}${list}<a:p><a:r><a:rPr lang="en-US"/><a:t>${prompt}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

/** A picture decoration, its file added to the package once. */
function pictureShape(part: Part, media: Map<string, string>, image: string, box: Box): string {
  let target = media.get(image);
  if (!target) media.set(image, (target = `image${media.size + 1}${extname(image).toLowerCase()}`));
  const rid = `rId${part.rels.length + 2}`;
  part.rels.push({ id: rid, type: "image", target: `../media/${target}` });
  const blip = extname(image).toLowerCase() === ".svg"
    ? `<a:blip><a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main" r:embed="${rid}"/></a:ext></a:extLst></a:blip>`
    : `<a:blip r:embed="${rid}"/>`;
  const id = part.nextId++;
  return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="${esc(image.replace(/.*\//, ""))}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr><p:blipFill>${blip}<a:stretch><a:fillRect/></a:stretch></p:blipFill><p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;
}

/** A text decoration as a text box. */
function textShape(pack: Pack, part: Part, text: string, styleName: string | null, box: Box, ink: string): string {
  const style = pack.roles[styleName ?? "body"] ?? Object.values(pack.roles)[0]!;
  const id = part.nextId++;
  const paras = text.split("\n").map((line) => `<a:p>${paraProps(style, "", "a:pPr")}<a:r>${runProps(pack, style, ink, "rPr")}<a:t>${esc(line)}</a:t></a:r></a:p>`).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${esc(styleName ?? "text")}"/><p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr><p:spPr>${xfrm(box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody>${bodyPr(style)}<a:lstStyle/>${paras}</p:txBody></p:sp>`;
}

const background = (fill: string) => `<p:bg><p:bgPr><a:solidFill>${srgb(fill)}</a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
const tree = (shapes: string) => `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>${shapes}</p:spTree>`;

/** One pack layout as a PowerPoint layout part. */
function layoutPart(pack: Pack, name: string, layout: Layout, media: Map<string, string>): Part {
  const part: Part = { xml: [], rels: [{ id: "rId1", type: "slideMaster", target: "../slideMasters/slideMaster1.xml" }], nextId: 2 };
  const bg = pack.backgrounds[layout.background]!;
  const shown = layout.decorations.filter((d) => !d.backgrounds || d.backgrounds.includes(layout.background));
  const decorations = shown.map((d) => (d.image ? pictureShape(part, media, d.image, d.box) : d.text ? textShape(pack, part, d.text, d.style, d.box, bg.ink) : "")).join("");
  let titleTaken = false;
  const slots = Object.entries(layout.slots).map(([slotName, slot], i) => {
    const xml = slotShape(pack, part, slotName, slot, bg.ink, 10 + i, titleTaken);
    titleTaken ||= slot.role === "title";
    return xml;
  }).join("");
  part.xml.push(`${HEAD}<p:sldLayout ${NS} showMasterSp="0" preserve="1" userDrawn="1"><p:cSld name="${esc(name)}">${background(bg.fill)}${tree(decorations + slots)}</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  return part;
}

/** The slide master: the pack's first background, title and body placeholders, text styles from the title and body roles. */
function masterPart(pack: Pack, count: number): string {
  const first = Object.values(pack.layouts)[0]!;
  const bg = pack.backgrounds[first.background]!;
  const title = pack.roles.title ?? Object.values(pack.roles)[0]!;
  const body = pack.roles.body ?? pack.roles.note ?? title;
  const box = (role: string, fallback: Box) => Object.values(pack.layouts).flatMap((l) => Object.values(l.slots)).find((s) => s.role === role)?.box ?? fallback;
  const part: Part = { xml: [], rels: [], nextId: 2 };
  const shapes = slotShape(pack, part, "Title", { role: "title", box: box("title", [36, 20, pack.canvas.w - 72, 40]) } as Slot, bg.ink, 0, false) + slotShape(pack, part, "Text", { role: "body", box: box("body", [36, 100, pack.canvas.w - 72, pack.canvas.h - 140]) } as Slot, bg.ink, 1, true);
  const ids = Array.from({ length: count }, (_, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="rId${i + 1}"/>`).join("");
  const style = (tag: string, s: TextStyle) => `<p:${tag}>${paraProps(s, runProps(pack, s, bg.ink, "defRPr"))}</p:${tag}>`;
  const clrMap = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';
  return `${HEAD}<p:sldMaster ${NS}><p:cSld>${background(bg.fill)}${tree(shapes)}</p:cSld>${clrMap}<p:sldLayoutIdLst>${ids}</p:sldLayoutIdLst><p:txStyles>${style("titleStyle", title)}${style("bodyStyle", body)}${style("otherStyle", body)}</p:txStyles></p:sldMaster>`;
}

/**
 * Write a pack as a pptx.
 *
 * @param pack - the loaded pack.
 * @param dir - its folder, for the decoration images.
 * @returns the pptx bytes.
 */
export function writePptx(pack: Pack, dir: string): Uint8Array {
  const media = new Map<string, string>();
  const layouts = Object.entries(pack.layouts).flatMap(([name, layout]) => [
    layoutPart(pack, name, layout, media),
    ...Object.keys(pack.backgrounds).filter((b) => b !== layout.background).map((b) => layoutPart(pack, `${name} ${b}`, { ...layout, background: b }, media)),
  ]);
  const firstBg = pack.backgrounds[Object.values(pack.layouts)[0]!.background]!;
  const files: Record<string, Uint8Array> = {};
  const put = (path: string, text: string) => (files[path] = strToU8(text));
  put("[Content_Types].xml", contentTypes(layouts.length, [...media.values()].map((m) => extname(m).slice(1))));
  put("_rels/.rels", rootRels());
  for (const [path, text] of Object.entries(docProps(pack.name))) put(path, text);
  put("ppt/presentation.xml", presentation(pack.canvas.w, pack.canvas.h));
  put("ppt/_rels/presentation.xml.rels", presentationRels());
  put("ppt/presProps.xml", presProps());
  put("ppt/viewProps.xml", viewProps());
  put("ppt/tableStyles.xml", tableStylesPart(pack));
  put("ppt/theme/theme1.xml", theme(pack.name, firstBg.ink, firstBg.fill, fontOf(pack, pack.roles.body ?? Object.values(pack.roles)[0]!)));
  put("ppt/slideMasters/slideMaster1.xml", masterPart(pack, layouts.length));
  put("ppt/slideMasters/_rels/slideMaster1.xml.rels", rels([...layouts.map((_, i) => ({ id: `rId${i + 1}`, type: "slideLayout", target: `../slideLayouts/slideLayout${i + 1}.xml` })), { id: `rId${layouts.length + 1}`, type: "theme", target: "../theme/theme1.xml" }]));
  layouts.forEach((part, i) => {
    put(`ppt/slideLayouts/slideLayout${i + 1}.xml`, part.xml[0]!);
    put(`ppt/slideLayouts/_rels/slideLayout${i + 1}.xml.rels`, rels(part.rels));
  });
  for (const [image, target] of media) files[`ppt/media/${target}`] = readFileSync(join(dir, image));
  return zipSync(files);
}
