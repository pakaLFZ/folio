/**
 * The live preview of a box being moved, resized or nudged
 * (spec/slides/drawing.md, "Layout slots as boxes"): the slide in view is
 * drawn from a copy with the box's write already applied, so its content
 * (text reflowing to the new width, a picture, a table, a shape) goes with
 * the frame on every frame, and its overflow is measured from the new box.
 * Nothing is written until the drag ends; the preview is dropped once that
 * write has landed, or at once when the drag is cancelled.
 */
import { applySlidePatch, type Pack, type SlideSpec } from "@folio/core";
import type { DeckStore } from "./deckState";
import type { Shape } from "./shapeModel";
import { boxOps } from "./slotBoxes";

/** A slide drawn as it would be after a box edit. */
export interface BoxPreview {
  id: string;
  spec: SlideSpec;
}

/**
 * Draw a slide with one box placed as given.
 *
 * @param base - the slide to lay the box over; the stored slide by default, the last preview while nudging.
 * @returns the preview shown, or null when the box cannot be placed.
 */
export function showPreview(store: DeckStore, pack: Pack, id: string, shape: Shape, base?: SlideSpec): BoxPreview | null {
  const spec = base ?? store.get().slides[id]?.spec;
  if (!spec) return null;
  const next = applySlidePatch(spec, boxOps(pack, spec, shape));
  if (!next.ok) return null;
  const preview = { id, spec: next.spec };
  store.set((s) => ({ ...s, preview }));
  return preview;
}

/** Stop previewing: the given preview only (a newer one stays), or whatever is shown. */
export function clearPreview(store: DeckStore, only?: BoxPreview | null): void {
  const shown = store.get().preview;
  if (shown && (only === undefined || shown === only)) store.set((s) => ({ ...s, preview: null }));
}
