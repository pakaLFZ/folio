/**
 * Did a slide render? The print page and the live view measure every text slot
 * of a drawn layout, and report an exception a slide threw; a slide that drew
 * nothing must never read as a clean one.
 */
import { slideLayout } from "./overrides.js";
import type { MeasuredSlot } from "./overflow.js";
import type { Pack } from "./pack.js";
import { slideRoot, type SlideSpec } from "./schema.js";
import { textSlots } from "./theme.js";
import { makeWarning, type FolioWarning } from "./warnings.js";

/** One slide's measurement as a renderer publishes it. */
export interface SlideMeasurement {
  rev: string;
  slots: MeasuredSlot[];
  /** Why the slide did not render, when it did not. */
  renderError?: string;
  /** Set by the print page: every slot the slide drew is in `slots`, so a missing text slot was never drawn. */
  complete?: boolean;
}

/**
 * Why a slide did not render, if it did not.
 *
 * @param measured - the renderer's measurement of the slide.
 * @returns the reason, or null when the slide was drawn; a slide whose layout
 *   is unknown is FOLIO-SPEC-002's, never a render failure.
 */
export function renderFailure(spec: SlideSpec, pack: Pack, measured: SlideMeasurement): string | null {
  if (measured.renderError) return measured.renderError;
  if (!measured.complete) return null;
  const root = slideRoot(spec);
  const layout = root && pack.layouts[root.layout] ? slideLayout(pack, root.layout, root.props) : undefined;
  if (!layout) return null;
  const seen = new Set(measured.slots.map((m) => m.slot));
  const missing = textSlots(pack, layout).map((t) => t.name).filter((name) => !seen.has(name));
  return missing.length ? `text slots ${missing.join(", ")} were never drawn` : null;
}

/**
 * FOLIO-RND-001 for a slide that did not render.
 *
 * @param where - deck and slide id.
 * @param at - the time of the check (ISO).
 * @returns one error warning, or none.
 */
export function renderWarnings(where: { deck: string; slide: string }, spec: SlideSpec, pack: Pack, measured: SlideMeasurement, at: string): FolioWarning[] {
  const reason = renderFailure(spec, pack, measured);
  return reason ? [makeWarning("FOLIO-RND-001", where, { slide: where.slide, reason: reason.replace(/\.+$/, "") }, { at })] : [];
}
