/**
 * Comment marks in canvas units (pt): the region outline, pen strokes,
 * rectangles and arrows. Drawn in ink over the slide, the same in the live
 * editor and in the screenshots, and never part of the slide itself.
 */
import type { Box, Mark } from "@folio/core";

export const MARK_INK = "#0b0b0b";

/**
 * A region's border, inverting whatever colour lies under each part of it
 * (`mix-blend-mode: difference` on a white stroke): white over a dark
 * backdrop, ink over a light one, the inverse hue over a coloured figure, all
 * along the same dash. Drawn in its own always-opaque `<svg>`, never inside a
 * dimmed `MarksLayer`, so the blend always reaches the slide underneath and
 * is never cut off by an ancestor's `opacity`. Used for the region border,
 * live and while dragging. *(Superseded 2026-10-14: a fixed two-tone
 * white-under-ink stroke; the user asked for colour that changes along the
 * dash's length, not one fixed look.)*
 *
 * @param props.canvas - the pack canvas size, for the viewBox.
 * @param props.region - the region box.
 */
export function RegionOverlay({ canvas, region: [x, y, w, h] }: { canvas: { w: number; h: number }; region: Box }) {
  return (
    <svg viewBox={`0 0 ${canvas.w} ${canvas.h}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
      <rect x={x} y={y} width={w} height={h} fill="rgb(0 0 0 / 0.04)" />
      <rect x={x} y={y} width={w} height={h} fill="none" stroke="#ffffff" strokeWidth={1.25} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" style={{ mixBlendMode: "difference" }} />
    </svg>
  );
}

/**
 * The SVG of one mark (pen, rectangle or arrow), inverting whatever colour
 * lies under it the same way the region border and the shape outline do
 * (`mix-blend-mode: difference` on a white stroke): white over a dark slide,
 * ink over a light one, so a pen stroke or a rectangle stays visible on a
 * black title slide as on a white one. *(Superseded 2026-10-14: a fixed ink
 * stroke, `MARK_INK`, invisible against a near-black background since
 * difference against black returns the same colour.)*
 *
 * @param mark - the mark.
 * @param weight - stroke width in pt.
 * @returns an SVG element, or null for a mark without enough points.
 */
export function MarkShape({ mark, weight = 2 }: { mark: Mark; weight?: number }) {
  const pts = mark.points;
  const common = { fill: "none", stroke: "#ffffff", strokeWidth: weight, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, vectorEffect: "non-scaling-stroke" as const, style: { mixBlendMode: "difference" as const } };
  if (mark.tool === "pen") return pts.length > 1 ? <polyline points={pts.map((p) => p.join(",")).join(" ")} {...common} /> : null;
  if (pts.length < 2) return null;
  const [[x1, y1], [x2, y2]] = [pts[0]!, pts[pts.length - 1]!];
  if (mark.tool === "rect") return <rect x={Math.min(x1, x2)} y={Math.min(y1, y2)} width={Math.abs(x2 - x1)} height={Math.abs(y2 - y1)} {...common} />;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = 12;
  const wing = (a: number) => `${x2 - head * Math.cos(angle - a)},${y2 - head * Math.sin(angle - a)}`;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} {...common} />
      <polyline points={`${wing(0.45)} ${x2},${y2} ${wing(-0.45)}`} {...common} />
    </g>
  );
}

/**
 * A comment's region and marks over a slide.
 *
 * @param props.canvas - the pack canvas size, for the viewBox.
 * @param props.region - the region box, or null.
 * @param props.marks - the sketch.
 * @param props.dim - draw faintly (another comment than the one in focus).
 */
export function MarksLayer({ canvas, region, marks, dim = false, children }: { canvas: { w: number; h: number }; region: Box | null; marks: Mark[]; dim?: boolean; children?: React.ReactNode }) {
  return (
    <>
      {region ? <RegionOverlay canvas={canvas} region={region} /> : null}
      <svg viewBox={`0 0 ${canvas.w} ${canvas.h}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", opacity: dim ? 0.35 : 1, pointerEvents: "none" }}>
        {marks.map((m, i) => <MarkShape key={i} mark={m} />)}
        {children}
      </svg>
    </>
  );
}

/**
 * Where a comment's region is, in the whole-slide screenshot: four short, faint
 * ink corner ticks just outside the region, never the dashed selection border.
 * The server hides them (`.folio-shot-locator`) before the region shot.
 *
 * @param props.canvas - the pack canvas size, for the viewBox.
 * @param props.region - the region box.
 */
export function RegionCorners({ canvas, region }: { canvas: { w: number; h: number }; region: Box }) {
  const [x, y, w, h] = region;
  const gap = 3;
  const arm = Math.min(10, w / 3, h / 3);
  const corners: [number, number, number, number][] = [[x - gap, y - gap, 1, 1], [x + w + gap, y - gap, -1, 1], [x - gap, y + h + gap, 1, -1], [x + w + gap, y + h + gap, -1, -1]];
  return (
    <svg className="folio-shot-locator" viewBox={`0 0 ${canvas.w} ${canvas.h}`} width="100%" height="100%" style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
      {corners.map(([cx, cy, dx, dy], i) => (
        <polyline key={i} points={`${cx},${cy + dy * arm} ${cx},${cy} ${cx + dx * arm},${cy}`} fill="none" stroke={MARK_INK} strokeOpacity={0.55} strokeWidth={1.25} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}
