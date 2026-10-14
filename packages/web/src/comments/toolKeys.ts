/**
 * Single-letter keys for the sketch toolbar's tools, live only in Edit and
 * only while focus is outside a text slot, an input or a menu, so typing a
 * letter into the slide never switches a tool. Esc with no draft open goes
 * back to the Cursor tool; with a draft open, Esc belongs to the bubble,
 * whose discard returns to Cursor too.
 */
import { useEffect, useRef } from "react";
import type { Tool } from "./useComments";

/** Each tool's key, as its tooltip names it. */
export const TOOL_KEYS: Record<Tool, string> = { cursor: "V", region: "R", pen: "P", rect: "B", arrow: "A", eraser: "E" };

const BY_KEY = Object.fromEntries(Object.entries(TOOL_KEYS).map(([tool, key]) => [key.toLowerCase(), tool as Tool]));

/** Whether a key press belongs to text entry or an open menu. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName) || !!target.closest('[role="menu"],[role="dialog"]');
}

/** The tool a key press asks for, if any. */
function toolOf(e: KeyboardEvent, drafting: boolean): Tool | null {
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.shiftKey || typingIn(e.target)) return null;
  if (e.key === "Escape") return drafting ? null : "cursor";
  return BY_KEY[e.key.toLowerCase()] ?? null;
}

/**
 * Bind the tool keys.
 *
 * @param enabled - false outside Edit.
 * @param drafting - whether a draft is open on this slide.
 * @param setTool - chooses a tool.
 */
export function useToolKeys(enabled: boolean, drafting: boolean, setTool: (t: Tool) => void): void {
  const latest = useRef({ drafting, setTool });
  latest.current = { drafting, setTool };
  useEffect(() => {
    if (!enabled) return;
    const on = (e: KeyboardEvent) => {
      const tool = toolOf(e, latest.current.drafting);
      if (!tool) return;
      if (e.key !== "Escape") e.preventDefault();
      latest.current.setTool(tool);
    };
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, [enabled]);
}
