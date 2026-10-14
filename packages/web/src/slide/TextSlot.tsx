/**
 * One text slot: positioned at its box in pt, styled by its role, measured after
 * every layout, and editable in place in edit mode. The font size never changes.
 * A slot whose layout names a text hook shows the hook's output for its raw
 * text (the raw text while the hook runs or after it fails); editing edits the
 * raw text.
 */
import { useLayoutEffect, useRef, useState, type ClipboardEvent, type CSSProperties, type FocusEvent, type FormEvent, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { cssColor, fontFamilyOf, INK, hookedTextOf, lineLimitOf, linePitch, placeholderOf, type Box, type ResolvedTextSlot } from "@folio/core";
import { useSlideEnv, type FigureState } from "./env";
import { HookBadge } from "./FigureSlot";
import { domToMarkup, markupToHtml, pasteMarkup } from "./markupDom";
import { measureText, PX_PER_PT } from "./measure";
import { BoxBackdrop } from "./BoxBackdrop";
import { RichTextToolbar } from "./RichTextToolbar";
import { characterShortcut } from "./characterFormatting";
import { autoConvertList, listKey } from "./listEditing";

const JUSTIFY: Record<string, CSSProperties["justifyContent"]> = { top: "flex-start", middle: "center", bottom: "flex-end" };

/**
 * The CSS of a text style.
 *
 * @param text - the resolved slot.
 * @param family - the CSS family list.
 * @param ink - the background's ink, used when the role names no colour.
 * @param palette - the pack's `colors`, so a colour may be one of its names.
 * @returns inline styles for the text element.
 */
export function textStyle(text: ResolvedTextSlot, family: string, ink: string, palette: Record<string, string> = {}): CSSProperties {
  const s = text.style;
  return {
    fontFamily: family,
    fontSize: `${s.size}pt`,
    fontWeight: s.weight,
    fontStyle: s.italic ? "italic" : "normal",
    lineHeight: `${linePitch(s)}pt`,
    textAlign: s.align,
    textAlignLast: s.align === "justify" ? "left" : undefined,
    textTransform: s.transform === "uppercase" ? "uppercase" : "none",
    color: !s.color || s.color === INK ? ink : cssColor(s.color, palette, s.color),
    whiteSpace: s.wrap ? "pre-wrap" : "pre",
  };
}

/**
 * Render a text slot.
 *
 * @param props.text - the slot with its resolved style and limit.
 * @param props.value - the markup string, or null for an empty slot.
 * @param props.ink - the background variant's ink colour.
 * @param props.box - the box as laid out: the declared one, or the flowed one
 *   of a slot placed `below` another (its height may be zero or less).
 * @param props.onReach - told how far the text reaches below the box top, in
 *   pt, when another slot sits below this one.
 */
export function TextSlot({ text: declared, value, ink, box, onReach }: { text: ResolvedTextSlot; value: string | null; ink: string; box: Box; onReach?: (pt: number) => void }) {
  const env = useSlideEnv();
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const [x, y, w, h] = box;
  const text = { ...declared, lineLimit: lineLimitOf(declared.slot, declared.style, Math.max(0, h)) };
  const raw = value ?? "";
  const hooked = text.slot.hook && raw ? env.figure(text.name, { hook: text.slot.hook, input: raw }) : null;
  const edit = useSlotEditing(text, raw, hookedTextOf(raw, hooked?.output), textRef, boxRef, ink, declared.slot.below ? h : undefined, onReach);
  const over = env.overflow[text.name];
  const squeezed = !!declared.slot.below && h <= 0;
  const overflowing = squeezed || (!!over && (over.lines > text.lineLimit || (!text.style.wrap && over.overPt > 0.5)));
  const overflow = !overflowing ? undefined : squeezed ? "flow" : over!.lines > text.lineLimit ? "lines" : "width";
  const sample = env.mode === "edit" || env.mode === "thumb" ? placeholderOf(text.name, text.slot) : undefined;
  const outline = env.mode === "print" || env.mode === "thumb" || env.mode === "view" ? undefined : overflowing ? "1px solid var(--color-danger)" : env.mode === "edit" ? "1px dashed rgb(0 0 0 / 0.14)" : undefined;
  return (
    <div ref={boxRef} className="folio-slot" data-slot={text.name} data-overflow={overflow} style={{ left: `${x}pt`, top: `${y}pt`, width: `${w}pt`, height: `${Math.max(0, h)}pt`, padding: text.slot.padding ? `${text.slot.padding}pt` : undefined, justifyContent: JUSTIFY[text.style.anchor], outline, outlineOffset: -1 }} onMouseDown={env.mode === "edit" ? (e) => e.target === boxRef.current && caretAtStart(e, textRef.current) : undefined}>
      <BoxBackdrop fill={text.slot.fill ?? null} border={text.slot.border ?? null} w={w} h={h} palette={env.pack.colors} ink={ink} />
      <div ref={textRef} className="folio-text" data-placeholder={sample} style={{ ...textStyle(text, fontFamilyOf(env.pack, text.style), ink, env.pack.colors), minHeight: sample ? `${linePitch(text.style)}pt` : undefined, flexShrink: 0, position: text.slot.fill || text.slot.border ? "relative" : undefined }} contentEditable={env.mode === "edit"} suppressContentEditableWarning spellCheck={false} {...edit} />
      {env.mode === "edit" ? <RichTextToolbar root={textRef} pack={env.pack} size={text.style.size} color={text.style.color ?? ink} font={text.style.font ?? env.pack.fonts[0]?.family} allowLists={text.style.wrap && text.slot.role !== "title"} onChange={(next) => env.onCommit?.(text.name, next)} onDone={edit.onDone} /> : null}
      {hooked && env.mode === "edit" ? <HookBadge figure={textHookState(hooked, raw)} /> : null}
    </div>
  );
}

/**
 * A hooked text slot's mark: a hook that reports "ok" but has no output for
 * this raw text yet (the server has not seen the save) is still drawing.
 */
function textHookState(hooked: FigureState, raw: string): FigureState {
  return hooked.state === "ok" && hooked.output?.input !== raw ? { ...hooked, state: "drawing" } : hooked;
}

/**
 * Measuring and in-place editing of one text slot.
 *
 * @param text - the slot.
 * @param raw - the stored markup, which an edit changes.
 * @param shown - what the slot shows when not being edited: a text hook's
 *   output for `raw`, or `raw` itself.
 * @param textRef - the editable element; `boxRef` the slot box.
 * @param flowedPt - the laid-out height of a slot placed `below` another, sent with the measurement.
 * @param onReach - told the bottom of the last line, in pt below the box top (0 when empty).
 * @returns the event handlers for the editable element. While it has focus,
 *   the DOM is the user's and is not overwritten by a re-render.
 */
function useSlotEditing(text: ResolvedTextSlot, raw: string, shown: string, textRef: RefObject<HTMLDivElement | null>, boxRef: RefObject<HTMLDivElement | null>, ink: string, flowedPt?: number, onReach?: (pt: number) => void) {
  const env = useSlideEnv();
  const [editing, setEditing] = useState(false);
  const measure = () => {
    const el = textRef.current;
    markEmpty(el);
    if (!boxRef.current || !el) return;
    const m = measureText(text.name, el, boxRef.current, linePitch(text.style), !editing);
    env.onSlotMeasured?.(flowedPt === undefined ? m : { ...m, boxPt: flowedPt });
    onReach?.(el.hasAttribute("data-empty") ? 0 : (el.offsetTop + el.offsetHeight) / PX_PER_PT);
  };
  useLayoutEffect(() => {
    if (!editing && textRef.current) textRef.current.innerHTML = markupToHtml(shown, env.pack.colors, ink);
    measure();
  });
  const onDone = () => {
    setEditing(false);
    env.onEditing?.(null);
    const next = textRef.current ? domToMarkup(textRef.current) : raw;
    if (next !== raw) env.onCommit?.(text.name, next);
  };
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    if (e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest("[data-rich-text-toolbar]")) return;
    onDone();
  };
  const onFocus = () => {
    if (shown !== raw && textRef.current) textRef.current.innerHTML = markupToHtml(raw, env.pack.colors, ink);
    setEditing(true);
    env.onEditing?.(text.name);
    env.onSelectSlot?.(text.name);
  };
  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    e.preventDefault();
    const html = e.clipboardData.getData("text/html");
    if (pasteMarkup(html, env.pack.colors)) return;
    const plain = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text.style.wrap ? plain : plain.replace(/\s*\n\s*/g, " "));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => slotKey(e, text, raw, textRef.current, env.overflow[text.name]?.lines ?? 0, env.pack.colors, env.onHistory);
  return { onFocus, onBlur, onDone, onInput: (e: FormEvent<HTMLDivElement>) => { if (text.style.wrap && text.slot.role !== "title" && (e.nativeEvent as InputEvent).data === " ") autoConvertList(e.currentTarget); measure(); }, onPaste, onKeyDown };
}

/**
 * Mark the editable element empty, so the stylesheet shows its placeholder.
 * Only the attribute changes: the placeholder is drawn by CSS, never typed
 * into the DOM, so it is never measured, saved or sent.
 */
function markEmpty(el: HTMLDivElement | null): void {
  el?.toggleAttribute("data-empty", !el.textContent?.replace(/​/g, ""));
}

/**
 * A press on an empty slot's box, outside its one line of text, puts the caret
 * at the start of the slot, as clicking a placeholder does in PowerPoint.
 */
function caretAtStart(e: MouseEvent<HTMLDivElement>, el: HTMLDivElement | null): void {
  if (!el?.hasAttribute("data-empty")) return;
  e.preventDefault();
  el.focus();
  getSelection()?.collapse(el, 0);
}

/**
 * Keys inside an edited slot: Escape reverts, Ctrl+S saves, Ctrl+= and
 * Ctrl+Shift+= toggle sub- and superscript, Enter is refused in a one-line
 * slot, and an enforced slot refuses typing past its limit.
 */
function slotKey(e: KeyboardEvent<HTMLDivElement>, text: ResolvedTextSlot, shown: string, el: HTMLDivElement | null, lines: number, palette: Record<string, string>, onHistory?: (slot: string, direction: "undo" | "redo") => void): void {
  if (el && text.style.wrap && text.slot.role !== "title" && listKey(e.nativeEvent, el)) return;
  if (el && characterShortcut(e.nativeEvent, el, text.style.size, palette)) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") && el && domToMarkup(el) === shown) {
    e.preventDefault();
    el.blur();
    onHistory?.(text.name, e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo");
  } else if (e.key === "Escape") {
    if (el) el.innerHTML = markupToHtml(shown);
    el?.blur();
  } else if (mod && e.key.toLowerCase() === "s") {
    e.preventDefault();
    el?.blur();
  } else if (mod && (e.key === "=" || e.key === "+")) {
    e.preventDefault();
    toggleScript(e.shiftKey ? "SUP" : "SUB");
  } else if (mod && ["b", "i", "u"].includes(e.key.toLowerCase())) {
    e.preventDefault();
    document.execCommand(({ b: "bold", i: "italic", u: "underline" } as Record<string, string>)[e.key.toLowerCase()]!);
  } else if (mod && e.shiftKey && (e.key === ">" || e.key === "<")) {
    e.preventDefault();
  } else if (!text.style.wrap && e.key === "Enter") e.preventDefault();
  else if (text.slot.enforce && e.key.length === 1 && lines >= text.lineLimit && atLimit(el, text)) e.preventDefault();
}


/**
 * Toggle subscript or superscript. With a selection, the selection is wrapped
 * or unwrapped; with only a caret inside a sub or sup, the caret steps out of
 * it, so the next characters are typed on the baseline.
 *
 * @param tag - `SUB` or `SUP`.
 */
function toggleScript(tag: "SUB" | "SUP"): void {
  const sel = getSelection();
  const node = sel?.anchorNode;
  const inside = node && (node instanceof Element ? node : node.parentElement)?.closest(tag.toLowerCase());
  if (sel && sel.isCollapsed && inside) {
    const after = document.createTextNode("\u200b");
    inside.after(after);
    sel.collapse(after, 1);
    return;
  }
  document.execCommand(tag === "SUP" ? "superscript" : "subscript");
}

/**
 * Whether typing one more character could add a line to an enforced slot.
 *
 * @returns true when the slot already fills its last allowed line.
 */
function atLimit(el: HTMLDivElement | null, text: ResolvedTextSlot): boolean {
  if (!el) return false;
  return el.offsetHeight / (4 / 3) >= text.lineLimit * linePitch(text.style) - 0.5;
}
