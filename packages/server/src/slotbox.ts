/**
 * A slot's box as the slide lays it out now: the layout's box with the
 * slide's overrides, and a flowed slot's last measured height. What a figure
 * drawn outside a hook must be sized to (`folio box`, `folio_hook.slot_size`).
 */
import { slideLayout, slideRoot, type MeasuredSlot } from "@folio/core";
import type { DeckStore } from "./deckstore.js";
import { flowedHeights } from "./hooks/slots.js";
import type { Workspace } from "./workspace.js";

export type SlotBox = { ok: true; w: number; h: number; flowed: boolean } | { ok: false; reason: string };

/**
 * The box of one slot of one slide, in pt.
 *
 * @param measured - the slide's last measurement, for a slot that flows `below` another.
 * @returns its width and height, or why there is none (no slide, no pack, no such slot).
 */
export function slotBox(workspace: Workspace, store: DeckStore, slide: string, slot: string, measured: MeasuredSlot[] | null): SlotBox {
  const record = store.readSlide(slide);
  if (!record) return { ok: false, reason: `no slide ${slide} in ${store.dir}` };
  const root = record.spec ? slideRoot(record.spec) : null;
  const pack = workspace.packOf(store);
  if (!root || !pack) return { ok: false, reason: `slide ${slide} cannot be laid out: ${record.error ?? `pack ${store.deck.template} is not installed`}` };
  const layout = slideLayout(pack.pack, root.layout, root.props);
  const decl = layout?.slots[slot];
  if (!decl) return { ok: false, reason: `no slot ${slot} on ${slide} (layout ${root.layout}); slots: ${Object.keys(layout?.slots ?? {}).join(", ")}` };
  const flowedH = decl.below ? flowedHeights(measured)[slot] : undefined;
  return { ok: true, w: decl.box[2], h: flowedH ?? decl.box[3], flowed: flowedH !== undefined };
}
