/**
 * The fixed parts of a pptx that holds a slide master, its layouts and no
 * slides: content types, package relationships, the presentation, its
 * properties and a theme built from the pack's fonts and colours.
 */

export const NS = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
const REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const CT = "application/vnd.openxmlformats-officedocument";

/** Escape text for XML content and attribute values. */
export const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** pt to EMU. */
export const emu = (pt: number): number => Math.round(pt * 12700);

/** A relationships part. */
export function rels(list: { id: string; type: string; target: string }[]): string {
  const items = list.map((r) => `<Relationship Id="${r.id}" Type="${r.type.startsWith("http") ? r.type : `${REL}/${r.type}`}" Target="${esc(r.target)}"/>`).join("");
  return `${HEAD}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items}</Relationships>`;
}

/** `[Content_Types].xml` for a master and `layouts` layouts. */
export function contentTypes(layouts: number, extensions: string[]): string {
  const media: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", svg: "image/svg+xml" };
  const defaults = ["rels", "xml", ...new Set(extensions)].map((e) => `<Default Extension="${e}" ContentType="${e === "rels" ? "application/vnd.openxmlformats-package.relationships+xml" : e === "xml" ? "application/xml" : media[e] ?? "application/octet-stream"}"/>`);
  const over = (part: string, type: string) => `<Override PartName="${part}" ContentType="${type}"/>`;
  const overrides = [
    over("/ppt/presentation.xml", `${CT}.presentationml.presentation.main+xml`),
    over("/ppt/slideMasters/slideMaster1.xml", `${CT}.presentationml.slideMaster+xml`),
    ...Array.from({ length: layouts }, (_, i) => over(`/ppt/slideLayouts/slideLayout${i + 1}.xml`, `${CT}.presentationml.slideLayout+xml`)),
    over("/ppt/theme/theme1.xml", `${CT}.theme+xml`),
    over("/ppt/presProps.xml", `${CT}.presentationml.presProps+xml`),
    over("/ppt/viewProps.xml", `${CT}.presentationml.viewProps+xml`),
    over("/ppt/tableStyles.xml", `${CT}.presentationml.tableStyles+xml`),
    over("/docProps/core.xml", "application/vnd.openxmlformats-package.core-properties+xml"),
    over("/docProps/app.xml", `${CT}.extended-properties+xml`),
  ];
  return `${HEAD}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${defaults.join("")}${overrides.join("")}</Types>`;
}

/** The package's own relationships. */
export const rootRels = (): string =>
  rels([
    { id: "rId1", type: "officeDocument", target: "ppt/presentation.xml" },
    { id: "rId2", type: "http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties", target: "docProps/core.xml" },
    { id: "rId3", type: "extended-properties", target: "docProps/app.xml" },
  ]);

/** The presentation part: one master, the canvas, no slides. */
export function presentation(w: number, h: number): string {
  return `${HEAD}<p:presentation ${NS} saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldSz cx="${emu(w)}" cy="${emu(h)}"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
}

export const presentationRels = (): string =>
  rels([
    { id: "rId1", type: "slideMaster", target: "slideMasters/slideMaster1.xml" },
    { id: "rId2", type: "presProps", target: "presProps.xml" },
    { id: "rId3", type: "viewProps", target: "viewProps.xml" },
    { id: "rId4", type: "theme", target: "theme/theme1.xml" },
    { id: "rId5", type: "tableStyles", target: "tableStyles.xml" },
  ]);

export const presProps = (): string => `${HEAD}<p:presentationPr ${NS}/>`;
export const viewProps = (): string => `${HEAD}<p:viewPr ${NS}><p:normalViewPr><p:restoredLeft sz="15620"/><p:restoredTop sz="94660"/></p:normalViewPr><p:gridSpacing cx="76200" cy="76200"/></p:viewPr>`;

export function docProps(title: string): Record<string, string> {
  return {
    "docProps/core.xml": `${HEAD}<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${esc(title)}</dc:title></cp:coreProperties>`,
    "docProps/app.xml": `${HEAD}<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>folio</Application><Slides>0</Slides></Properties>`,
  };
}

const srgb = (hex: string) => `<a:srgbClr val="${hex.replace("#", "").toUpperCase()}"/>`;

/** A theme whose dark and light colours are the pack's ink and paper and whose fonts are the pack's. */
export function theme(name: string, dark: string, light: string, font: string): string {
  const scheme = [["dk1", dark], ["lt1", light], ["dk2", dark], ["lt2", light], ["accent1", dark], ["accent2", "#4472C4"], ["accent3", "#A5A5A5"], ["accent4", "#FFC000"], ["accent5", "#5B9BD5"], ["accent6", "#70AD47"], ["hlink", "#0563C1"], ["folHlink", "#954F72"]]
    .map(([k, v]) => `<a:${k}>${srgb(v!)}</a:${k}>`).join("");
  const fontSet = (tag: string) => `<a:${tag}><a:latin typeface="${esc(font)}"/><a:ea typeface=""/><a:cs typeface=""/></a:${tag}>`;
  const solid = '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>';
  const line = (w: number) => `<a:ln w="${w}"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>`;
  const fmt = `<a:fmtScheme name="folio"><a:fillStyleLst>${solid.repeat(3)}</a:fillStyleLst><a:lnStyleLst>${line(12700)}${line(19050)}${line(25400)}</a:lnStyleLst><a:effectStyleLst>${"<a:effectStyle><a:effectLst/></a:effectStyle>".repeat(3)}</a:effectStyleLst><a:bgFillStyleLst>${solid.repeat(3)}</a:bgFillStyleLst></a:fmtScheme>`;
  return `${HEAD}<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${esc(name)}"><a:themeElements><a:clrScheme name="${esc(name)}">${scheme}</a:clrScheme><a:fontScheme name="${esc(name)}">${fontSet("majorFont")}${fontSet("minorFont")}</a:fontScheme>${fmt}</a:themeElements></a:theme>`;
}

export { HEAD, srgb };
