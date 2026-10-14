/**
 * Copy, cut, paste and delete for the element selected on the slide, on keys
 * (Ctrl or Cmd with C, X, V; Delete or Backspace) and on its right-click
 * menu (spec/slides/drawing.md, "Elements: copy, cut, paste, delete"). The
 * copy is kept in the browser's storage so every tab of the workspace pastes
 * it; text is also put on the system clipboard as plain text. Keys act only
 * when no text is being typed into, focus is not in the rail, and an element
 * is selected (Ctrl+V also with nothing selected, when an element was the
 * last thing copied).
 */
import { isTextRole, plainText, slideLayout, type Pack, type Role } from "@folio/core";
import { useEffect } from "react";
import { boot } from "../boot";
import type { DeckState, DeckStore } from "./deckState";
import { copyElement, pasteOps, removeOps, type ElementClip } from "./elementClip";
import type { Pt } from "./shapeModel";
import { writeShape } from "./shapeWrites";

const CLIP_KEY = "folio.element-clip";
const LAST_KEY = "folio.last-copied";

const packOf = (s: DeckState): Pack | null => s.pack ?? boot.pack ?? null;

/** Note which kind of thing was copied last, so Ctrl+V knows whether it means slides or an element. */
export function markCopied(kind: "slides" | "element"): void {
  try {
    localStorage.setItem(LAST_KEY, kind);
  } catch {
    return;
  }
}

/** The element copy, if the last thing copied was one. */
export function elementClip(): ElementClip | null {
  try {
    return localStorage.getItem(LAST_KEY) === "element" ? (JSON.parse(localStorage.getItem(CLIP_KEY) ?? "null") as ElementClip | null) : null;
  } catch {
    return null;
  }
}

/** The selected element on the current slide, if the selection is a slot of it. */
export function selectedElement(s: DeckState): string | null {
  const pack = packOf(s);
  const root = s.current ? s.slides[s.current]?.spec : null;
  const element = root?.elements[root.root];
  if (!pack || !element || !s.selectedSlot) return null;
  return slideLayout(pack, element.type, element.props)?.slots[s.selectedSlot] ? s.selectedSlot : null;
}

/** Copy the selected element (or the one named). */
export function copySelected(store: DeckStore, name = selectedElement(store.get())): boolean {
  const s = store.get();
  const pack = packOf(s);
  const spec = s.current ? s.slides[s.current]?.spec : null;
  const clip = pack && spec && name ? copyElement(pack, spec, name) : null;
  if (!clip) return false;
  try {
    localStorage.setItem(CLIP_KEY, JSON.stringify(clip));
  } catch {
    store.notify("Copy failed: this browser keeps no storage for the page", "error");
    return false;
  }
  markCopied("element");
  if (isTextRole(clip.role as Role) && typeof clip.content === "string") void navigator.clipboard?.writeText(plainText(clip.content)).catch(() => {});
  store.notify(`Copied ${name}`);
  return true;
}

/** Delete the selected element: an added slot goes, a layout slot is cleared. */
export function deleteSelected(store: DeckStore, name = selectedElement(store.get())): void {
  const s = store.get();
  const pack = packOf(s);
  if (!pack || !s.current || !name) return;
  void writeShape(store, s.current, name, (now) => removeOps(pack, now, name).ops);
  store.set((x) => ({ ...x, selectedSlot: null }));
}

/** Cut: copy, then delete. */
export function cutSelected(store: DeckStore, name = selectedElement(store.get())): void {
  if (copySelected(store, name)) deleteSelected(store, name);
}

/** Paste the copied element onto the selected one, or as a new slot (at a point, when given). */
export function pasteElement(store: DeckStore, at: Pt | null = null): void {
  const s = store.get();
  const pack = packOf(s);
  const clip = elementClip();
  const spec = s.current ? s.slides[s.current]?.spec : null;
  if (!pack || !clip || !spec || !s.current) return;
  const selected = at ? null : selectedElement(s);
  const { name } = pasteOps(pack, spec, clip, selected, at);
  void writeShape(store, s.current, name, (now) => pasteOps(pack, now, clip, selected, at).ops);
  store.set((x) => ({ ...x, selectedSlot: name }));
}

/** Whether a key press belongs to text entry, a menu, a dialog or the rail. */
function elsewhere(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName) || !!target.closest('[role="menu"],[role="dialog"],nav[aria-label="Slides"]');
}

/** Handle one key for elements; returns whether it was taken. */
function onElementKey(store: DeckStore, e: KeyboardEvent): boolean {
  const s = store.get();
  if (s.mode !== "edit" || e.defaultPrevented || e.altKey || e.shiftKey || elsewhere(e.target)) return false;
  const mod = e.ctrlKey || e.metaKey;
  const selected = selectedElement(s);
  const key = e.key.toLowerCase();
  if (!mod && (e.key === "Delete" || e.key === "Backspace")) return selected ? (deleteSelected(store), true) : false;
  if (!mod) return false;
  if (key === "v") return elementClip() ? (pasteElement(store), true) : false;
  if (!selected || getSelection()?.isCollapsed === false) return false;
  if (key === "c") return copySelected(store);
  if (key === "x") return cutSelected(store), true;
  return false;
}

/**
 * Bind the element keys on the document's capture phase, before the slide
 * keys on the window, which act on slides when no element takes the key.
 */
export function useElementKeys(store: DeckStore): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!onElementKey(store, e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener("keydown", on, true);
    return () => document.removeEventListener("keydown", on, true);
  }, [store]);
}
