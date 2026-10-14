/**
 * The Shape tool in the bottom tool row, its options popover, and the keys
 * that act on shapes (spec/slides/drawing.md, "Shapes in the editor").
 * While the Shape tool is on, or a shape is selected, the popover stays
 * pinned above the tool's button: it sets the next shape drawn, or edits the
 * selected one. S, O, L and Shift+L turn the tool on with that kind; V drops
 * it. Escape deselects the shape, then drops the tool. With a shape selected,
 * the arrow keys nudge it (Shift: 10 pt) instead of changing the slide;
 * Delete is the element key (elementCommands.ts). Every slot of the layout
 * is such a box too (slotBoxes.ts): it is nudged the same way, Enter or F2
 * puts the caret in a selected text slot, and Ctrl+Z / Ctrl+Y undo and redo
 * user writes. Keys act only outside a text slot, an
 * input, a menu or the popover itself, except Escape on the popover's buttons.
 */
import { Shapes } from "lucide-react";
import { useEffect } from "react";
import type { Pack } from "@folio/core";
import { boot } from "../boot";
import { Segmented } from "../ui/segmented";
import type { DeckState, DeckStore } from "./deckState";
import { ItemDraftToggle } from "./DraftToggle";
import { ShapeOptions } from "./ShapeOptions";
import { contentOps, moved, propsOf, shapesOf, type Shape, type ShapeContent, type ShapeKind } from "./shapeModel";
import { writeBox, writeShape } from "./shapeWrites";
import { allItems, boxOps, drawnBox } from "./slotBoxes";
import { clearPreview, showPreview } from "./boxPreview";

const NUDGES: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const FIRST_SHAPE: ShapeContent = { kind: "rect" };

/** Whether a key press belongs to text entry, an open menu or the popover. */
function typingIn(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName) || !!target.closest('[role="menu"],[role="dialog"]');
}

/** Whether Escape pressed here closes the popover: on its buttons, not in its fields or an open menu. */
function escapesPopover(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest("[data-tool-options]") && !/INPUT|TEXTAREA|SELECT/.test(target.tagName) && !target.closest('[role="menu"]');
}

/** The shape selected on the current slide, if any. */
export function selectedShape(s: DeckState): Shape | undefined {
  const spec = s.current ? s.slides[s.current]?.spec : null;
  return spec && s.selectedSlot ? shapesOf(propsOf(spec)).find((x) => x.name === s.selectedSlot) : undefined;
}

/** The box selected on the current slide, if any: a shape, a text box, a block or a slot of the layout. */
export function selectedItem(s: DeckState): Shape | undefined {
  const spec = s.current ? s.slides[s.current]?.spec : null;
  const pack = s.pack ?? boot.pack;
  return spec && pack && s.selectedSlot ? allItems(pack, spec, drawnBox).find((x) => x.name === s.selectedSlot) : undefined;
}

/** Turn the Shape tool on with a kind (or the last one), leaving any shape or text box selection. */
export function chooseShape(store: DeckStore, kind?: ShapeKind): void {
  store.set((s) => {
    const next = s.shapeNext ?? FIRST_SHAPE;
    return { ...s, shapeTool: true, textTool: false, shapeNext: kind ? { ...next, kind } : next, selectedSlot: selectedItem(s) ? null : s.selectedSlot };
  });
}

/** Turn the Text tool on, leaving any shape or text box selection. */
export function chooseText(store: DeckStore): void {
  store.set((s) => ({ ...s, textTool: true, shapeTool: false, selectedSlot: selectedItem(s) ? null : s.selectedSlot }));
}

/** Drop the Shape and Text tools. */
export function dropShapeTool(store: DeckStore): void {
  store.set((s) => (s.shapeTool || s.textTool ? { ...s, shapeTool: false, textTool: false } : s));
}

/** The tool a key asks for: a shape kind, `text`, null for V, undefined when the key is not a tool key. */
function kindOf(e: KeyboardEvent): ShapeKind | "text" | null | undefined {
  if (e.ctrlKey || e.metaKey || e.altKey) return undefined;
  const key = e.key.toLowerCase();
  if (key === "l") return e.shiftKey ? "arrow" : "line";
  if (e.shiftKey) return undefined;
  return ({ s: "rect", o: "ellipse", t: "text", v: null } as Record<string, ShapeKind | "text" | null>)[key];
}

/** Nudge the selected box, or put the caret in a selected text with Enter or F2 (Delete is an element key, elementCommands.ts). Returns whether the key was taken. */
function actOnShape(store: DeckStore, e: KeyboardEvent): boolean {
  const s = store.get();
  const shape = selectedItem(s);
  const pack = s.pack ?? boot.pack;
  if (!shape || !pack || !s.current || e.ctrlKey || e.metaKey || e.altKey) return false;
  const onControl = e.target instanceof HTMLElement && !!e.target.closest("button,a,[role]");
  if ((e.key === "Enter" || e.key === "F2") && shape.text && !onControl) return editText(shape.name);
  const [id, name] = [s.current, shape.name];
  const step = NUDGES[e.key];
  if (!step) return false;
  const by = e.shiftKey ? 10 : 1;
  const base = s.preview?.id === id ? s.preview.spec : undefined;
  const from = base ? allItems(pack, base, drawnBox).find((x) => x.name === name) : shape;
  const shown = from ? showPreview(store, pack, id, moved(from, step[0] * by, step[1] * by), base) : null;
  void writeBox(store, id, name, (now) => {
    const current = allItems(pack, now, drawnBox).find((x) => x.name === name);
    return current ? boxOps(pack, now, moved(current, step[0] * by, step[1] * by)) : [];
  }).finally(() => clearPreview(store, shown));
  return true;
}

/** Put the caret in a slot's text with all of it selected, as Enter on a selected placeholder does in PowerPoint. */
export function editText(name: string): boolean {
  const el = document.querySelector(`main [data-slot="${CSS.escape(name)}"] [contenteditable="true"]`) as HTMLElement | null;
  if (!el) return false;
  el.focus();
  getSelection()?.selectAllChildren(el);
  return true;
}

/** Ctrl+Z undoes and Ctrl+Y or Ctrl+Shift+Z redoes the last user write on the deck. */
function historyKey(store: DeckStore, e: KeyboardEvent): boolean | undefined {
  const key = e.key.toLowerCase();
  if (!(e.ctrlKey || e.metaKey) || e.altKey || (key !== "z" && key !== "y")) return undefined;
  void store.historyStep(key === "y" || e.shiftKey ? "redo" : "undo");
  return true;
}

/** Handle one key press for shapes; returns whether it was taken. */
function onShapeKey(store: DeckStore, e: KeyboardEvent): boolean {
  const s = store.get();
  if (s.mode !== "edit" || e.defaultPrevented) return false;
  if (typingIn(e.target) && !(e.key === "Escape" && escapesPopover(e.target))) return false;
  if (e.key === "Escape") {
    if (!selectedItem(s) && !s.shapeTool && !s.textTool) return false;
    if (escapesPopover(e.target)) (e.target as HTMLElement).blur();
    if (selectedItem(s)) return store.set((x) => ({ ...x, selectedSlot: null })), true;
    return dropShapeTool(store), true;
  }
  const history = historyKey(store, e);
  if (history !== undefined) return history;
  const kind = kindOf(e);
  if (kind === null) dropShapeTool(store);
  if (kind === "text") chooseText(store);
  else if (kind) chooseShape(store, kind);
  return kind ? true : kind === null ? false : actOnShape(store, e);
}

/**
 * Bind the shape keys, on the document's capture phase so they come before
 * the slide keys (Delete archives, arrows change slide) bound on the window.
 */
export function useShapeKeys(store: DeckStore): void {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (!onShapeKey(store, e)) return;
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    document.addEventListener("keydown", on, true);
    return () => document.removeEventListener("keydown", on, true);
  }, [store]);
}

/** The popover's controls: the selected shape's own, else the next shape's. */
function PopoverBody({ store, state, pack }: { store: DeckStore; state: DeckState; pack: Pack }) {
  const shape = selectedShape(state);
  if (shape && state.current) {
    const [id, name] = [state.current, shape.name];
    const edit = (change: Partial<ShapeContent>) =>
      void writeShape(store, id, name, (now) => {
        const current = shapesOf(propsOf(now)).find((x) => x.name === name);
        return current ? contentOps(now, name, { ...current.content, ...change }) : [];
      });
    return <Body title={`Shape ${name.slice("shape:".length)}`} name={name}><ItemDraftToggle store={store} state={state} name={name} /><ShapeOptions content={shape.content} pack={pack} onChange={edit} withText /></Body>;
  }
  const next = state.shapeNext ?? FIRST_SHAPE;
  const set = (change: Partial<ShapeContent>) => store.set((s) => ({ ...s, shapeNext: { ...(s.shapeNext ?? FIRST_SHAPE), ...change } }));
  return <Body title="Next shape"><ItemDraftToggle store={store} state={state} /><ShapeOptions content={next} pack={pack} onChange={set} withText={false} /></Body>;
}

/** The popover's frame: a title over the controls. */
function Body({ title, name, children }: { title: string; name?: string; children: React.ReactNode }) {
  return <ToolPopover label="Shape options" kind="shape" title={title} name={name}>{children}</ToolPopover>;
}

/**
 * A tool's options popover, pinned one gutter above its button.
 *
 * @param props.kind - `shape` or `text`, as `data-shape-options` / `data-text-options` name it.
 * @param props.name - the selected item it edits, or none for the next one.
 */
export function ToolPopover({ label, kind, title, name, children }: { label: string; kind: "shape" | "text"; title: string; name?: string; children: React.ReactNode }) {
  return (
    <div role="dialog" aria-label={label} data-tool-options="" {...{ [`data-${kind}-options`]: name ?? "next" }} className="glass bg-surface absolute bottom-[calc(100%+var(--gutter))] left-1/2 w-[19.5rem] max-w-[calc(100vw-32px)] -translate-x-1/2 space-y-2 rounded-menu p-2.5 text-left">
      <h3 className="section-title">{title}</h3>
      {children}
    </div>
  );
}

/**
 * The Shape tool's button, with its popover pinned above it while the tool is
 * on or a shape is selected.
 *
 * @param props.onPick - called when the tool is picked, so the comment tools step aside.
 */
export function ShapeToolButton({ store, state, pack, onPick }: { store: DeckStore; state: DeckState; pack: Pack; onPick: () => void }) {
  const open = !!state.shapeTool || !!selectedShape(state);
  return (
    <div className="relative flex" data-shape-tool-button="">
      <Segmented<"shape" | "">
        label="Shape tool"
        className="bg-transparent p-0"
        itemClassName="size-[var(--corner-hit)] flex-none px-0"
        value={state.shapeTool ? "shape" : ""}
        onChange={() => (onPick(), chooseShape(store))}
        options={[{ value: "shape", label: <Shapes />, name: "Shape", title: "Shape: drag on the slide to draw; options above (S, O, L, Shift+L)" }]}
      />
      {open ? <PopoverBody store={store} state={state} pack={pack} /> : null}
    </div>
  );
}
