/**
 * What `folio shot` draws in the browser besides the slides: the contact sheet
 * (an HTML grid of the slide pictures, labelled) and the marks overlay (every
 * slot's box and the warnings on it). Both are plain strings handed to the
 * page, so nothing here depends on how this file is compiled.
 */
import { isActive, type FolioSeverity, type FolioWarning } from "@folio/core";

export const SHEET_COLUMNS = 3;
export const THUMB_WIDTH = 480;

export interface SheetTile {
  slide: string;
  layout: string;
  /** Active findings by severity, counted as the report counts them. */
  counts: Record<FolioSeverity, number>;
  png: Buffer;
}

/** Warning codes and the most severe finding among them. */
export interface MarkCodes {
  codes: string[];
  level: FolioSeverity;
}

/** The findings of one slide: by slot, and those on no slot. */
export interface SlideMarks {
  slots: Record<string, MarkCodes>;
  loose: MarkCodes;
}

const RANK: Record<FolioSeverity, number> = { note: 0, warning: 1, error: 2 };

const escapeHtml = (text: string) => text.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * Group the active warnings of each slide for the marks overlay.
 *
 * @returns the codes by slide id, by slot.
 */
export function marksOf(warnings: FolioWarning[]): Record<string, SlideMarks> {
  const marks: Record<string, SlideMarks> = {};
  for (const w of warnings.filter(isActive)) {
    const own = (marks[w.location.slide] ??= { slots: {}, loose: { codes: [], level: "note" } });
    const mark = w.location.slot ? (own.slots[w.location.slot] ??= { codes: [], level: "note" }) : own.loose;
    if (!mark.codes.includes(w.code)) mark.codes.push(w.code);
    if (RANK[w.severity] > RANK[mark.level]) mark.level = w.severity;
  }
  return marks;
}

/**
 * The script that outlines every slot of the print page: thin blue with its
 * name; red with the codes when it has a warning or an error; grey with the
 * codes when it has notes only. Codes on no slot (or on a slot the page does
 * not draw) go in a label at the slide's top left, coloured the same way.
 *
 * @param marks - from `marksOf`.
 * @returns a script for `page.evaluate`.
 */
export function marksScript(marks: Record<string, SlideMarks>): string {
  return `(() => {
  const marks = ${JSON.stringify(marks)};
  const colour = { none: "rgba(37,99,235,.8)", note: "#52525b", warning: "#dc2626", error: "#dc2626" };
  const border = { none: "1px dashed #2563eb", note: "1.5px solid #71717a", warning: "2px solid #dc2626", error: "2px solid #dc2626" };
  const label = (text, level) => {
    const tag = document.createElement("span");
    tag.textContent = text;
    tag.style.cssText = "position:absolute;left:0;top:0;font:600 11px/14px ui-monospace,Menlo,monospace;padding:0 3px;white-space:nowrap;color:#fff;background:" + colour[level];
    return tag;
  };
  for (const page of document.querySelectorAll(".folio-print-page")) {
    const slide = page.querySelector(".folio-slide");
    if (!slide) continue;
    const own = marks[page.dataset.slide] || { slots: {}, loose: { codes: [], level: "note" } };
    const origin = slide.getBoundingClientRect();
    const drawn = new Set();
    for (const el of slide.querySelectorAll("[data-slot]")) {
      const name = el.dataset.slot;
      const mark = own.slots[name] || { codes: [], level: "none" };
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.style.cssText = "position:absolute;pointer-events:none;z-index:2147483647;box-sizing:border-box;left:" + (r.left - origin.left) + "px;top:" + (r.top - origin.top) + "px;width:" + r.width + "px;height:" + r.height + "px;border:" + border[mark.level];
      const tag = label([name, ...mark.codes].join(" "), mark.level);
      if (r.top - origin.top >= 15) tag.style.top = "-15px";
      box.append(tag);
      slide.append(box);
      drawn.add(name);
    }
    const undrawn = Object.entries(own.slots).filter(([name]) => !drawn.has(name));
    const loose = [...own.loose.codes, ...undrawn.map(([name, mark]) => name + " " + mark.codes.join(" "))];
    if (!loose.length) continue;
    const levels = [own.loose, ...undrawn.map(([, mark]) => mark)].filter((m) => m.codes.length).map((m) => m.level);
    const corner = label(loose.join(" | "), levels.some((l) => l !== "note") ? "warning" : "note");
    corner.style.zIndex = "2147483647";
    slide.append(corner);
  }
})()`;
}

/**
 * The contact sheet: every slide's picture as a thumbnail, labelled with its
 * id, layout and its findings counted by severity as the report counts them
 * (errors red and bold, warnings red, notes grey), in a grid of at most three
 * columns.
 *
 * @returns an HTML document whose `.sheet` element is the picture.
 */
export function sheetHtml(tiles: SheetTile[]): string {
  const columns = Math.max(1, Math.min(SHEET_COLUMNS, tiles.length));
  const cells = tiles.map((t) => {
    const caption = `<b>${escapeHtml(t.slide)}</b> ${escapeHtml(t.layout)} ${countsHtml(t.counts)}`;
    return `<figure><img src="data:image/png;base64,${t.png.toString("base64")}"><figcaption>${caption}</figcaption></figure>`;
  });
  const style = [
    "body{margin:0;background:#d4d4d8;font:14px/1.3 system-ui,sans-serif;color:#18181b}",
    `.sheet{display:grid;grid-template-columns:repeat(${columns},${THUMB_WIDTH}px);gap:14px;padding:14px;width:max-content;background:#d4d4d8}`,
    `figure{margin:0}img{display:block;width:${THUMB_WIDTH}px;outline:1px solid #a1a1aa}`,
    "figcaption{padding-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.error{color:#b91c1c;font-weight:800}.warning{color:#b91c1c}.note,.ok{color:#52525b}",
  ].join("");
  return `<!doctype html><meta charset="utf-8"><style>${style}</style><div class="sheet">${cells.join("")}</div>`;
}

/**
 * A tile's findings: "1 error, 2 warnings, 1 note", leaving out zeros, each
 * part in its severity's class; "0 warnings" when there are none.
 *
 * @returns an HTML fragment.
 */
function countsHtml(counts: Record<FolioSeverity, number>): string {
  const parts = (["error", "warning", "note"] as const).filter((level) => counts[level] > 0).map((level) => `<span class="${level}">${counts[level]} ${level}${counts[level] === 1 ? "" : "s"}</span>`);
  return parts.length ? parts.join(", ") : `<span class="ok">0 warnings</span>`;
}
