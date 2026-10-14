/**
 * Build the environment a slide renders with, from the deck state.
 */
import type { Pack } from "@folio/core";
import { shapeTextSlots, slideLayout, textSlots } from "@folio/core";
import { at } from "../boot";
import type { FigureState, SlideEnv, SlideMode } from "../slide/env";
import type { DeckState, DeckStore } from "./deckState";

export type FigureResolver = (slideId: string, slot: string, value: unknown) => FigureState;

/**
 * Resolve a static figure path to a URL under the deck.
 *
 * @param token - the deck token.
 * @param value - the slot value.
 * @returns the figure state for a path, or `none` for an empty slot.
 */
export function staticFigure(token: string, value: unknown, files?: Record<string, string>): FigureState {
  if (typeof value === "string" && value) return { url: deckFileUrl(token, value, files), state: "ok" };
  return { url: null, state: "none" };
}

/**
 * The URL of a deck-relative file, served by the deck's `files` route.
 *
 * @param files - content versions of the files changed since the page loaded;
 *   a changed file's URL carries its version, so no cached copy answers for it.
 */
export function deckFileUrl(token: string, path: string, files?: Record<string, string>): string {
  const version = files?.[path.replace(/^\.\//, "")];
  return at(`${token}/files/${path.split("/").map(encodeURIComponent).join("/")}${version ? `?v=${encodeURIComponent(version)}` : ""}`);
}

/**
 * The line limit of each text slot of a slide's layout, with its overrides.
 *
 * @returns limits by slot name; empty when the layout is unknown.
 */
export function limitsOf(pack: Pack, layout: string | null, props: Record<string, unknown> = {}): Record<string, number> {
  const l = layout ? slideLayout(pack, layout, props) : undefined;
  return l ? Object.fromEntries([...textSlots(pack, l), ...shapeTextSlots(pack, l, props)].map((t) => [t.name, t.lineLimit])) : {};
}

/**
 * The environment for one slide in one mode.
 *
 * @param store - the deck store, for callbacks.
 * @param state - the current deck state.
 * @param pack - the deck's pack.
 * @param id - the slide id.
 * @param mode - how the slide is shown.
 * @param figure - resolves figure slots (static files and hooks).
 * @returns the environment object.
 */
export function slideEnv(store: DeckStore, state: DeckState, pack: Pack, id: string, mode: SlideMode, figure: FigureResolver): SlideEnv {
  const record = state.slides[id];
  const root = record?.spec ? record.spec.elements[record.spec.root] : undefined;
  const layout = root?.type ?? null;
  return {
    pack,
    slideId: id,
    mode,
    overflow: state.overflow[id] ?? {},
    limits: limitsOf(pack, layout, root?.props),
    selectedSlot: mode === "edit" ? state.selectedSlot : null,
    figure: (slot, value) => figure(id, slot, value),
    fileUrl: (path) => deckFileUrl(state.token, path, state.files),
    onSlotMeasured: mode === "thumb" ? undefined : (m) => store.measured(id, m),
    onRenderError: (message) => record && store.renderFailed(id, record.rev, message),
    onCommit: (slot, value) => void store.commit(id, slot, value === "" ? null : value),
    onHistory: (slot, direction) => void store.historySlot(id, slot, direction),
    onSelectSlot: (slot) => store.set((s) => ({ ...s, selectedSlot: slot })),
    onEditing: (slot) => slot && store.beginEdit(id, slot),
  };
}
