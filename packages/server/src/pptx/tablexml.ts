/**
 * folio's named table styles written back as PowerPoint table styles, so a
 * pptx made by `folio pack export --pptx` carries them and an import reads
 * them again: header row, body fill, banding and the three rule switches.
 */
import { createHash } from "node:crypto";
import type { Pack, TableStyle } from "@folio/core";
import { esc, srgb } from "./parts.js";

/** A stable GUID for a style name. */
export function styleId(pack: string, name: string): string {
  const h = createHash("sha1").update(`${pack}/${name}`).digest("hex").toUpperCase();
  return `{${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}}`;
}

const fill = (color: string | null) => `<a:fill>${color ? `<a:solidFill>${srgb(color)}</a:solidFill>` : "<a:noFill/>"}</a:fill>`;

/** One table style as `a:tblStyle`. */
function tblStyle(pack: Pack, name: string, s: TableStyle): string {
  const line = (on: boolean) => (on && s.rule.width > 0 ? `<a:ln w="${Math.round(s.rule.width * 12700)}" cmpd="sng"><a:solidFill>${srgb(s.rule.color)}</a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>");
  const sides = ["left", "right", "top", "bottom"].map((side) => `<a:${side}>${line(s.rule.outer)}</a:${side}>`).join("");
  const borders = `<a:tcBdr>${sides}<a:insideH>${line(s.rule.rows)}</a:insideH><a:insideV>${line(s.rule.columns)}</a:insideV></a:tcBdr>`;
  const whole = `<a:wholeTbl><a:tcTxStyle>${s.ink ? srgb(s.ink) : ""}</a:tcTxStyle><a:tcStyle>${borders}${fill(s.fill)}</a:tcStyle></a:wholeTbl>`;
  const band = s.bandFill ? `<a:band1H><a:tcStyle><a:tcBdr/>${fill(s.bandFill)}</a:tcStyle></a:band1H>` : "";
  const first = s.header ? `<a:firstRow><a:tcTxStyle b="${s.headerWeight >= 600 ? "on" : "off"}">${s.headerInk ? srgb(s.headerInk) : ""}</a:tcTxStyle><a:tcStyle><a:tcBdr/>${fill(s.headerFill)}</a:tcStyle></a:firstRow>` : "";
  return `<a:tblStyle styleId="${styleId(pack.name, name)}" styleName="${esc(name)}">${whole}${band}${first}</a:tblStyle>`;
}

/** `ppt/tableStyles.xml` holding every table style of the pack, `default` (or the first) as the presentation's default. */
export function tableStylesPart(pack: Pack): string {
  const names = Object.keys(pack.tables);
  const def = names.includes("default") ? "default" : names[0];
  const styles = names.map((n) => tblStyle(pack, n, pack.tables[n]!)).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="${def ? styleId(pack.name, def) : "{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"}">${styles}</a:tblStyleLst>`;
}
