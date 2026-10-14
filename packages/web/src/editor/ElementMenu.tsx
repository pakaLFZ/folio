/**
 * The element menu: a right-click on the slide in Edit, without movement,
 * selects the element under the pointer and opens Copy, Cut, Paste and
 * Delete (Clear for a slot of the layout) at the pointer, in the rail menu's
 * glass and rows; on the slide outside every element it opens with Paste
 * only, pasting at that point. A right drag pans instead (useZoom), and the
 * browser's own menu stays suppressed by the scene.
 */
import { ClipboardPaste, Copy, Eraser, RotateCcw, Scissors, Trash2, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { DropdownMenu as M } from "radix-ui";
import type { Pack } from "@folio/core";
import { cn } from "../ui/cn";
import type { DeckState, DeckStore } from "./deckState";
import { isAddedSlot } from "./elementClip";
import { copySelected, cutSelected, deleteSelected, elementClip, pasteElement, selectedElement } from "./elementCommands";
import type { Pt } from "./shapeModel";
import { KEY_LABELS } from "./slideKeys";
import { boxOverridden, resetBoxOps } from "./slotBoxes";
import { writeBox } from "./shapeWrites";

/** How far, in px, a right press may move and still be a click. */
const CLICK_PX = 4;

interface Open {
  x: number;
  y: number;
  name: string | null;
  at: Pt;
}

/** The element a press landed on: a shape's hit area, a text box's edge, or a slot. */
function elementAt(target: EventTarget | null): string | null {
  if (!(target instanceof Element)) return null;
  const hit = target.closest("[data-shape-hit]")?.getAttribute("data-shape-hit");
  return hit ?? target.closest("main [data-slot]")?.getAttribute("data-slot") ?? null;
}

/** A pointer position in the slide's pt. */
function canvasPoint(slide: Element, e: PointerEvent, pack: Pack): Pt {
  const r = slide.getBoundingClientRect();
  return [Math.round(((e.clientX - r.left) * pack.canvas.w) / r.width), Math.round(((e.clientY - r.top) * pack.canvas.h) / r.height)];
}

/** Open on a right-click without movement on the current slide. */
function useRightClick(store: DeckStore, pack: Pack, onOpen: (o: Open) => void): void {
  const press = useRef<{ x: number; y: number; name: string | null } | null>(null);
  useEffect(() => {
    const down = (e: PointerEvent) => {
      const inSlide = e.button === 2 && store.get().mode === "edit" && (e.target as Element | null)?.closest?.("main .folio-slide");
      press.current = inSlide ? { x: e.clientX, y: e.clientY, name: elementAt(e.target) } : null;
    };
    const up = (e: PointerEvent) => {
      const p = press.current;
      press.current = null;
      const slide = document.querySelector("main .folio-slide");
      if (!p || e.button !== 2 || !slide || Math.hypot(e.clientX - p.x, e.clientY - p.y) >= CLICK_PX) return;
      if (p.name) store.set((s) => ({ ...s, selectedSlot: p.name }));
      onOpen({ x: e.clientX, y: e.clientY, name: p.name, at: canvasPoint(slide, e, pack) });
    };
    addEventListener("pointerdown", down, true);
    addEventListener("pointerup", up, true);
    return () => (removeEventListener("pointerdown", down, true), removeEventListener("pointerup", up, true));
  }, [store, pack, onOpen]);
}

/** One row: icon, label, key. */
function Row({ label, icon: Icon, keys, onSelect, disabled, danger, title }: { label: string; icon: LucideIcon; keys: string; onSelect: () => void; disabled?: boolean; danger?: boolean; title?: string }) {
  return (
    <M.Item
      disabled={disabled}
      title={title}
      onSelect={onSelect}
      className={cn(
        "flex h-8 cursor-default select-none items-center gap-2 rounded-control pl-2 pr-2.5 text-[13px] text-ink outline-none data-[disabled]:text-ink-faint data-[highlighted]:bg-whisper [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-ink-muted",
        danger && "data-[highlighted]:bg-danger/[0.06] data-[highlighted]:text-danger data-[highlighted]:[&_svg]:text-danger",
      )}
    >
      <Icon aria-hidden />
      <span className="flex-1">{label}</span>
      <span className="num pl-4 font-mono text-[11px] text-ink-faint">{keys}</span>
    </M.Item>
  );
}

/**
 * The menu, mounted once by the editor.
 *
 * @param props.pack - the deck's pack, for the slide's size in pt.
 */
export function ElementMenu({ store, state, pack }: { store: DeckStore; state: DeckState; pack: Pack }) {
  const [open, setOpen] = useState<Open | null>(null);
  const onOpen = useRef((o: Open) => setOpen(o)).current;
  useRightClick(store, pack, onOpen);
  const spec = state.current ? state.slides[state.current]?.spec : null;
  const name = open?.name && selectedElement(state) === open.name ? open.name : null;
  const added = !!(name && spec && isAddedSlot(pack, spec, name));
  const moved = !!(name && spec && boxOverridden(pack, spec, name));
  const reset = () => name && state.current && void writeBox(store, state.current, name, (now) => resetBoxOps(now, name));
  return (
    <M.Root open={!!open} onOpenChange={(o) => !o && setOpen(null)} modal={false}>
      <M.Trigger asChild>
        <span aria-hidden style={{ position: "fixed", left: open?.x ?? 0, top: open?.y ?? 0, width: 1, height: 1, pointerEvents: "none" }} />
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="start"
          sideOffset={2}
          collisionPadding={12}
          aria-label="Element actions"
          className="glass z-[30] min-w-52 origin-(--radix-dropdown-menu-content-transform-origin) rounded-menu p-1.5 transition-[opacity,scale] duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-none"
        >
          {name ? <M.Label className="section-title px-2 pb-1 pt-0.5">{name}</M.Label> : null}
          {name ? <Row label="Cut" icon={Scissors} keys={KEY_LABELS.cut} onSelect={() => cutSelected(store, name)} title={added ? "Copies it, then removes it" : "Copies its content, then clears it; the slot stays in the layout"} /> : null}
          {name ? <Row label="Copy" icon={Copy} keys={KEY_LABELS.copy} onSelect={() => void copySelected(store, name)} /> : null}
          <Row label="Paste" icon={ClipboardPaste} keys={KEY_LABELS.paste} disabled={!elementClip()} onSelect={() => pasteElement(store, name ? null : (open?.at ?? null))} title={name ? "Replaces its content with a copy of the same kind, or adds the copy beside it" : "Adds the copied element here"} />
          {name && !added ? <Row label="Reset position and size" icon={RotateCcw} keys="" disabled={!moved} onSelect={reset} title="Puts the slot back at the template's box; its other changes stay" /> : null}
          {name ? <M.Separator className="mx-2 my-1.5 h-px bg-line-soft" /> : null}
          {name ? <Row label={added ? "Delete" : "Clear"} icon={added ? Trash2 : Eraser} keys={KEY_LABELS.delete} danger onSelect={() => deleteSelected(store, name)} title={added ? "Removes it from the slide" : "Clears its content; the slot belongs to the layout"} /> : null}
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}
