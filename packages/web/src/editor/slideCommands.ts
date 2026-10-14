/**
 * What the rail's menu and key bindings do to the selected slides: cut,
 * copy, paste, duplicate and delete. Delete archives (the files move to
 * `slides/.archive/<date>/`), so it can be undone by hand; cut copies then
 * archives, so nothing is erased either. Copied slides are held here, in the
 * page, and also written to the system clipboard as JSON.
 */
import type { SlideSpec } from "@folio/core";
import { api } from "../api";
import { boot } from "../boot";
import type { DeckStore } from "./deckState";
import { markCopied } from "./elementCommands";
import { selectedIds, selectSlides } from "./railSelection";

/** Copied slides and the pack they were made in. */
let clip: { template: string; specs: SlideSpec[] } | null = null;

export const slidesLabel = (n: number): string => (n === 1 ? "1 slide" : `${n} slides`);

const template = (): string => boot.deck?.template ?? "";

/** The specs of some slides, loading any not yet loaded. */
async function specsOf(store: DeckStore, ids: string[]): Promise<SlideSpec[]> {
  await Promise.all(ids.map((id) => store.ensure(id)));
  return ids.flatMap((id) => store.get().slides[id]?.spec ?? []);
}

/** Write slides as new slides after another, then select them. */
async function insert(store: DeckStore, specs: SlideSpec[], after: string | null, verb: string): Promise<void> {
  try {
    const made = await api.paste(store.get().token, specs, after);
    store.set((s) => selectSlides(s, made.ids));
    store.notify(`${verb} ${slidesLabel(made.ids.length)}`);
  } catch (error) {
    store.notify(`${verb} failed: ${(error as Error).message}`, "error");
  }
}

/** Copy some slides into the clipboard, without notifying. */
async function copyIds(store: DeckStore, ids: string[]): Promise<SlideSpec[]> {
  const specs = await specsOf(store, ids);
  if (!specs.length) return specs;
  clip = { template: template(), specs };
  markCopied("slides");
  try {
    await navigator.clipboard?.writeText(JSON.stringify({ folio: "slides", template: clip.template, slides: specs }, null, 2));
  } catch {
    /* The in-page copy is the one paste reads; the system clipboard is a courtesy. */
  }
  return specs;
}

/** Copy the selected slides. */
export async function copySlides(store: DeckStore): Promise<void> {
  const specs = await copyIds(store, selectedIds(store.get()));
  if (specs.length) store.notify(`Copied ${slidesLabel(specs.length)}`);
}

/** Copy the selected slides, then archive them in one request: nothing is erased. */
export async function cutSlides(store: DeckStore): Promise<void> {
  const ids = selectedIds(store.get());
  const specs = await copyIds(store, ids);
  if (!specs.length) return;
  try {
    const done = await api.archiveMany(store.get().token, ids);
    store.notify(`Cut ${slidesLabel(done.archived.length)}`);
  } catch (error) {
    store.notify(`Cut failed: ${(error as Error).message}`, "error");
  }
}

/** Whether there is anything to paste into this deck. */
export const canPaste = (): boolean => clip !== null && clip.template === template();

/** Paste the copied slides after the current slide. */
export async function pasteSlides(store: DeckStore): Promise<void> {
  if (!clip) return store.notify("Nothing copied yet: select slides and press Copy first.", "error");
  if (clip.template !== template()) return store.notify(`The copied slides use ${clip.template}; this deck uses ${template()}.`, "error");
  await insert(store, clip.specs, store.get().current, "Pasted");
}

/** Copy and paste the selected slides in one step, right after the last of them. */
export async function duplicateSlides(store: DeckStore): Promise<void> {
  const ids = selectedIds(store.get());
  const specs = await specsOf(store, ids);
  if (specs.length) await insert(store, specs, ids[ids.length - 1]!, "Duplicated");
}

/** Archive the selected slides. */
export async function deleteSlides(store: DeckStore): Promise<void> {
  const ids = selectedIds(store.get());
  if (!ids.length) return;
  try {
    const done = await api.archiveMany(store.get().token, ids);
    store.notify(`Moved ${slidesLabel(done.archived.length)} to the archive`);
  } catch (error) {
    store.notify(`Delete failed: ${(error as Error).message}`, "error");
  }
}
