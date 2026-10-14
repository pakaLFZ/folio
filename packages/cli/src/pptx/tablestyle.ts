/**
 * PowerPoint table styles (`ppt/tableStyles.xml`) as folio's named table
 * styles: header row, body fill and banding, outer border, row and column
 * rules. PowerPoint draws per-cell borders; folio has three rule switches, so
 * the reading is a simplification and the report says so.
 */
import { colorIn, isNoFill, type ColorContext } from "./color.js";
import type { Draft } from "./draft.js";
import { all, attr, num, one, path, type X } from "./ooxml.js";
import { slug } from "./report.js";

/** The fill colour of a `a:tcStyle` (`a:fill/a:solidFill` or `a:fillRef`), or null. */
function fillOf(tcStyle: X | undefined, ctx: ColorContext): string | null {
  const fill = one(tcStyle, "a:fill");
  return colorIn(one(fill, "a:solidFill"), ctx) ?? colorIn(one(tcStyle, "a:fillRef"), ctx);
}

/** One border (`a:left`, `a:insideH`, ...): its colour and width in pt, or null when it draws nothing. */
function lineOf(border: X | undefined, ctx: ColorContext): { color: string; width: number } | null {
  const ln = one(border, "a:ln");
  const ref = one(border, "a:lnRef");
  if (ln && (isNoFill(ln) || !one(ln, "a:solidFill"))) return null;
  const color = ln ? colorIn(one(ln, "a:solidFill"), ctx) : colorIn(ref, ctx);
  if (!color) return null;
  return { color, width: ln ? Math.round(((num(ln, "w") ?? 12700) / 12700) * 100) / 100 : 1 };
}

/** The borders of one part of the style (`a:wholeTbl`, `a:band1H`). */
function bordersOf(part: X | undefined, ctx: ColorContext): Record<string, { color: string; width: number } | null> {
  const bdr = path(part, "a:tcStyle", "a:tcBdr");
  return Object.fromEntries(["left", "right", "top", "bottom", "insideH", "insideV"].map((side) => [side, lineOf(one(bdr, `a:${side}`), ctx)]));
}

/**
 * Convert one `a:tblStyle`.
 *
 * @param size - the text size the deck's tables use, in pt.
 */
export function tableStyleOf(style: X, ctx: ColorContext, size: number): Record<string, unknown> {
  const whole = one(style, "a:wholeTbl");
  const first = one(style, "a:firstRow");
  const band = one(style, "a:band1H");
  const wb = bordersOf(whole, ctx);
  const bb = bordersOf(band, ctx);
  const rule = [wb.top, wb.left, wb.insideH, bb.top, wb.insideV].find(Boolean) ?? { color: "#000000", width: 0 };
  const firstText = one(first, "a:tcTxStyle");
  const wholeInk = colorIn(one(whole, "a:tcTxStyle"), ctx);
  return {
    description: `PowerPoint ${attr(style, "styleName") ?? "table style"}, read from the pptx.`,
    size,
    lineHeight: 1.2,
    header: true,
    headerWeight: attr(firstText, "b") === "on" ? 700 : 400,
    headerFill: fillOf(one(first, "a:tcStyle"), ctx),
    headerInk: colorIn(firstText, ctx),
    fill: fillOf(one(whole, "a:tcStyle"), ctx),
    ink: wholeInk && wholeInk !== `#${ctx.scheme[ctx.map.tx1 ?? "dk1"]}` ? wholeInk : null,
    bandFill: fillOf(one(band, "a:tcStyle"), ctx),
    cellPad: [3.6, 7.2, 3.6, 7.2],
    rule: { color: rule.color, width: rule.width, outer: Boolean(wb.top || wb.bottom || wb.left || wb.right), rows: Boolean(wb.insideH || bb.top || bb.bottom), columns: Boolean(wb.insideV) },
  };
}

/** The most common run size in the deck's tables (else in the layouts' table placeholders), or 18 pt (PowerPoint's default). */
function tableTextSize(draft: Draft): number {
  const counts = new Map<number, number>();
  for (const slide of draft.model.slides) {
    for (const shape of slide.shapes.filter((s) => s.table)) {
      for (const run of all(shape.table, "a:tr").flatMap((tr) => all(tr, "a:tc")).flatMap((tc) => all(one(tc, "a:txBody"), "a:p")).flatMap((p) => all(p, "a:r"))) {
        const sz = num(one(run, "a:rPr"), "sz");
        if (sz) counts.set(sz / 100, (counts.get(sz / 100) ?? 0) + 1);
      }
    }
  }
  for (const layout of counts.size ? [] : draft.model.layouts) {
    for (const shape of layout.shapes.filter((s) => s.ph?.type === "tbl")) {
      const sz = num(path(shape.txBody, "a:lstStyle", "a:lvl1pPr", "a:defRPr"), "sz");
      if (sz) counts.set(sz / 100, (counts.get(sz / 100) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 18;
}

/**
 * Add every table style of the pptx to the pack: its default as `default`,
 * the others by their PowerPoint names.
 *
 * @returns style id -> pack style name.
 */
export function importTableStyles(draft: Draft): Map<string, string> {
  const names = new Map<string, string>();
  const list = draft.model.tableStyles;
  const ctx = draft.model.masters[0]!.ctx;
  const size = tableTextSize(draft);
  const def = attr(list, "def");
  for (const style of all(list, "a:tblStyle")) {
    const id = attr(style, "styleId") ?? "";
    const name = id === def ? "default" : slug(attr(style, "styleName") ?? id);
    draft.pack.tables[name] = tableStyleOf(style, ctx, size);
    names.set(id, name);
    draft.report.add("tables", `table style "${name}" is PowerPoint's "${attr(style, "styleName")}", its borders read as three switches (outer, rows, columns) at ${size} pt; compare one table in the browser with the pptx and adjust with folio pack edit ${draft.pack.name} set tables.${name}.rule.rows=false`);
  }
  if (!names.size || (def && !names.has(def))) {
    draft.pack.tables.default ??= { description: "PowerPoint's default table style is built in and not stored in the pptx; a plain stand-in.", size, lineHeight: 1.2, header: true, headerWeight: 700, cellPad: [3.6, 7.2, 3.6, 7.2], rule: { color: "#000000", width: 0.75, outer: true, rows: true, columns: false } };
    if (def) names.set(def, "default");
    draft.report.add("tables", `the presentation's default table style is not stored in the pptx; "default" is a plain stand-in: set its look with folio pack edit ${draft.pack.name} set tables.default.headerFill='"#RRGGBB"'`);
  }
  return names;
}
