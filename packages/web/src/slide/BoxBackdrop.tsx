/**
 * A slot's box style drawn behind its text: the background and the border,
 * inside the box, as SVG at exact pt, so the live view, thumbnails, shots and
 * the PDF draw them alike (spec/slides/overrides.md, "A text slot's box style").
 */
import { cssColor, dashArray, type Border } from "@folio/core";

/**
 * Draw the backdrop, or nothing when the slot has neither a fill nor a border.
 *
 * @param props.w - the box's width, pt; `h` its height.
 * @param props.palette - the pack's `colors`; `ink` the background's ink.
 */
export function BoxBackdrop({ fill, border, w, h, palette, ink }: { fill: string | null; border: Border | null; w: number; h: number; palette: Record<string, string>; ink: string }) {
  const line = border && border.width > 0 ? border : null;
  if (!fill && !line) return null;
  const sw = line?.width ?? 0;
  const height = Math.max(0, h);
  return (
    <svg data-box-style="" aria-hidden width={`${w}pt`} height={`${height}pt`} viewBox={`0 0 ${w} ${height}`} style={{ position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }}>
      <rect x={sw / 2} y={sw / 2} width={Math.max(0, w - sw)} height={Math.max(0, height - sw)} fill={cssColor(fill, palette, ink)} stroke={line ? cssColor(line.color, palette, ink) : "none"} strokeWidth={sw} strokeDasharray={line ? dashArray(line.dash, sw) : undefined} strokeLinecap={line?.dash === "dot" ? "round" : "butt"} />
    </svg>
  );
}
