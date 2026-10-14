/**
 * A block slot (spec/slides/blocks.md): a text box or a code block drawn in
 * one of the pack's block styles, at exact pt in its box. A growing block is
 * as tall as its content and its box height is only a maximum; the needed
 * height and every code line wider than the box are measured after each
 * layout and reported, never shrunk or wrapped to fit. Text is typed into in
 * place, as in a text slot; code is edited as plain text (`CodeBlock`).
 */
import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { borderWidth, fontFamilyOf, hookedTextOf, linePitch, placeholderOf, resolveBlock, type Box, type RefinedSlot, type ResolvedBlock } from "@folio/core";
import { CodeBlock, measureCode } from "./CodeBlock";
import { useSlideEnv } from "./env";
import { HookBadge } from "./FigureSlot";
import { domToMarkup, markupToHtml, pasteMarkup } from "./markupDom";
import { PX_PER_PT } from "./measure";
import { textStyle } from "./TextSlot";
import { RichTextToolbar } from "./RichTextToolbar";
import { autoConvertList, listKey } from "./listEditing";
import { characterShortcut } from "./characterFormatting";

type Over = "block" | "code-width" | undefined;

/** The frame's CSS: fill, border on its sides, radius and padding, at the box's x, y and width. */
function frameStyle(block: ResolvedBlock, box: Box, height: number | null): CSSProperties {
  const [x, y, w] = box;
  const b = block.border;
  const line = b ? `${b.width}pt ${b.dash === "dash" ? "dashed" : b.dash === "dot" ? "dotted" : "solid"} ${b.color}` : undefined;
  const side = (s: "left" | "top" | "right" | "bottom") => (borderWidth(block, s) ? line : undefined);
  return {
    left: `${x}pt`, top: `${y}pt`, width: `${w}pt`, height: height === null ? undefined : `${Math.max(0, height)}pt`, boxSizing: "border-box",
    background: block.fill === "none" ? undefined : block.fill, borderRadius: `${block.radius}pt`, padding: `${block.padding}pt`,
    borderLeft: side("left"), borderTop: side("top"), borderRight: side("right"), borderBottom: side("bottom"), justifyContent: "flex-start",
  };
}

/** The height, pt, the frame adds round its content: padding and the top and bottom borders. */
const frameExtra = (block: ResolvedBlock) => 2 * block.padding + borderWidth(block, "top") + borderWidth(block, "bottom");

/**
 * Render a block slot.
 *
 * @param props.value - the slide's text, code, or `{code, language}`; or null.
 * @param props.box - the box as laid out; with `grow` its height is the maximum.
 * @param props.ink - the background's ink.
 * @param props.onReach - told the drawn height when another slot sits below it.
 */
export function BlockSlot({ name, slot, box, value, ink, onReach }: { name: string; slot: RefinedSlot; box: Box; value: unknown; ink: string; onReach?: (pt: number) => void }) {
  const env = useSlideEnv();
  const contentRef = useRef<HTMLDivElement>(null);
  const block = resolveBlock(env.pack, slot, value, ink);
  const [over, setOver] = useState<Over>(undefined);
  const chrome = env.mode === "edit";
  const empty = block.content === null;
  const h = box[3];
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return void onReach?.(0);
    const code = block.kind === "code" ? measureCode(el) : null;
    const needed = (code ? code.heightPt : naturalHeight(el, block)) + frameExtra(block);
    const wide = code?.wide ?? [];
    onReach?.(block.grow ? needed : h);
    if (!empty) env.onSlotMeasured?.({ slot: name, lines: 0, overPt: 0, ...(slot.below ? { boxPt: h } : {}), block: { heightPt: Math.round(needed * 10) / 10, wide } });
    setOver(empty ? undefined : needed > h + 0.5 ? "block" : wide.length ? "code-width" : undefined);
  });
  if (empty && !chrome && env.mode !== "thumb") return null;
  const outline = chrome ? (over ? "1px solid var(--color-danger)" : empty ? "1px dashed rgb(0 0 0 / 0.14)" : undefined) : undefined;
  return (
    <div className="folio-slot" data-slot={name} data-block={block.kind} data-block-style={block.styleName} data-overflow={over} onClick={() => chrome && env.onSelectSlot?.(name)} style={{ ...frameStyle(block, box, block.grow ? null : h), outline, outlineOffset: -1 }}>
      {block.kind === "code" ? <CodeBlock name={name} block={block} value={value} contentRef={contentRef} innerPt={h - frameExtra(block)} /> : <BlockText name={name} slot={slot} block={block} contentRef={contentRef} innerPt={h - frameExtra(block)} />}
    </div>
  );
}

/**
 * The height, pt, the content needs: the balanced columns' height. A block
 * that does not grow fills its first column first, so its content element is
 * measured with its height let go for the moment and put back.
 */
function naturalHeight(el: HTMLElement, block: ResolvedBlock): number {
  if (block.grow) return el.offsetHeight / PX_PER_PT;
  const { height, columnFill } = el.style;
  Object.assign(el.style, { height: "auto", columnFill: "balance" });
  const pt = el.offsetHeight / PX_PER_PT;
  Object.assign(el.style, { height, columnFill });
  return pt;
}

/** A text block's text: columns of marked-up text, typed into in place in Edit mode, a text hook's output shown when the layout names one. */
function BlockText({ name, slot, block, contentRef, innerPt }: { name: string; slot: RefinedSlot; block: ResolvedBlock; contentRef: RefObject<HTMLDivElement | null>; innerPt: number }) {
  const env = useSlideEnv();
  const [editing, setEditing] = useState(false);
  const raw = block.content ?? "";
  const hooked = slot.hook && raw ? env.figure(name, { hook: slot.hook, input: raw }) : null;
  const shown = hookedTextOf(raw, hooked?.output);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!editing && el) el.innerHTML = markupToHtml(shown, env.pack.colors);
    el?.toggleAttribute("data-empty", !el.textContent);
  });
  const style = block.textStyle;
  const css: CSSProperties = {
    ...textStyle({ name, slot, style, lineLimit: 0 }, fontFamilyOf(env.pack, style), style.color ?? "#000000"),
    columnCount: block.columns, columnGap: `${block.columnGap}pt`, columnFill: block.grow ? "balance" : "auto",
    height: block.grow ? undefined : `${Math.max(0, innerPt)}pt`, minHeight: `${linePitch(style)}pt`, flexShrink: 0,
  };
  const sample = env.mode === "edit" || env.mode === "thumb" ? placeholderOf(name, slot) : undefined;
  const commit = () => {
    setEditing(false);
    env.onEditing?.(null);
    const next = contentRef.current ? domToMarkup(contentRef.current) : raw;
    if (next !== raw) env.onCommit?.(name, next);
  };
  return (
    <>
      <div ref={contentRef} className="folio-text" data-placeholder={sample} style={css} contentEditable={env.mode === "edit"} suppressContentEditableWarning spellCheck={false} onInput={(e) => { if ((e.nativeEvent as InputEvent).data === " ") autoConvertList(e.currentTarget); }}
        onFocus={() => (contentRef.current && shown !== raw && (contentRef.current.innerHTML = markupToHtml(raw, env.pack.colors)), setEditing(true), env.onEditing?.(name), env.onSelectSlot?.(name))}
        onBlur={(e) => { if (!(e.relatedTarget instanceof HTMLElement && e.relatedTarget.closest("[data-rich-text-toolbar]"))) commit(); }} onPaste={(e) => { if (pasteMarkup(e.clipboardData.getData("text/html"), env.pack.colors)) e.preventDefault(); }} onKeyDown={(e) => { if (!listKey(e.nativeEvent, e.currentTarget) && !characterShortcut(e.nativeEvent, e.currentTarget, style.size, env.pack.colors)) blockTextKey(e, raw, name, env.onHistory); }} />
      {env.mode === "edit" ? <RichTextToolbar root={contentRef} pack={env.pack} size={style.size} color={style.color ?? '#000000'} font={style.font ?? env.pack.fonts[0]?.family} allowLists onChange={(next) => env.onCommit?.(name, next)} onDone={commit} /> : null}
      {hooked && env.mode === "edit" ? <HookBadge figure={hooked} /> : null}
    </>
  );
}

/** Keys in a text block: Escape reverts and leaves, Ctrl+S leaves (saving). */
function blockTextKey(e: KeyboardEvent<HTMLDivElement>, raw: string, name: string, onHistory?: (slot: string, direction: "undo" | "redo") => void): void {
  const el = e.currentTarget;
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === "z" || e.key.toLowerCase() === "y") && domToMarkup(el) === raw) {
    e.preventDefault();
    el.blur();
    onHistory?.(name, e.key.toLowerCase() === "y" || e.shiftKey ? "redo" : "undo");
  } else if (e.key === "Escape") {
    el.innerHTML = markupToHtml(raw);
    el.blur();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    el.blur();
  }
}
