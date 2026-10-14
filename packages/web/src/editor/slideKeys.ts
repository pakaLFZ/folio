/**
 * Key bindings for the selected slides. Cut, Copy, Paste and Duplicate act
 * whenever focus is not in a text slot, an input or a menu, so inside a slot
 * Ctrl+C, Ctrl+X and Ctrl+V keep their meaning for text. Delete and
 * Backspace act only when focus is in the rail: anywhere else they never
 * touch slides (spec/slides/drawing.md, user 2026-10-14). A held key never
 * repeats the archive, the cut or the duplicate.
 */
import { useEffect } from "react";
import type { DeckStore } from "./deckState";
import { copySlides, cutSlides, deleteSlides, duplicateSlides, pasteSlides } from "./slideCommands";

export type SlideCommand = "cut" | "copy" | "paste" | "duplicate" | "delete";

export const COMMANDS: Record<SlideCommand, (store: DeckStore) => Promise<void>> = { cut: cutSlides, copy: copySlides, paste: pasteSlides, duplicate: duplicateSlides, delete: deleteSlides };

const mac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const mod = mac ? "Cmd" : "Ctrl";

/** How each binding is written beside its menu row. */
export const KEY_LABELS: Record<SlideCommand, string> = { cut: `${mod}+X`, copy: `${mod}+C`, paste: `${mod}+V`, duplicate: `${mod}+D`, delete: "Del" };

const LETTERS: Record<string, SlideCommand> = { x: "cut", c: "copy", v: "paste", d: "duplicate" };

/** The command a key press asks for, if any. */
function commandOf(e: KeyboardEvent): SlideCommand | null {
  const held = mac ? e.metaKey : e.ctrlKey;
  if (e.altKey || e.shiftKey) return null;
  if (held) return LETTERS[e.key.toLowerCase()] ?? null;
  return !e.metaKey && !e.ctrlKey && (e.key === "Delete" || e.key === "Backspace") ? "delete" : null;
}

/** Whether a key press belongs to text entry or an open menu rather than to the slides. */
function busyTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName) || !!target.closest('[role="menu"],[role="dialog"]');
}

/** Whether a key press's target sits inside the slide rail. */
function inRail(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('nav[aria-label="Slides"]');
}

const NO_REPEAT: Partial<Record<SlideCommand, true>> = { delete: true, cut: true, duplicate: true };

/** Bind Copy, Paste, Duplicate and Delete to the selected slides. */
export function useSlideKeys(store: DeckStore): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const command = e.defaultPrevented || busyTarget(e.target) ? null : commandOf(e);
      if (!command) return;
      if (command === "delete" && !inRail(e.target)) return;
      if (NO_REPEAT[command] && e.repeat) return;
      if (command === "copy" && getSelection()?.isCollapsed === false) return;
      e.preventDefault();
      void COMMANDS[command](store);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [store]);
}
