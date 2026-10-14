/**
 * A code block's content: highlighted lines, whitespace kept, never wrapped,
 * split in order over the block's columns (one fill and border round them
 * all), each column with its own gutter of line numbers when they are on. In Edit mode a click opens a plain
 * monospace text area over it; leaving saves, Escape reverts, Tab indents by
 * two spaces. The language stays as the slide gave it.
 */
import { useState, type CSSProperties, type KeyboardEvent, type RefObject } from "react";
import { codeColumnSizes, codeValue, fontFamilyOf, linePitch, refinedBlockStyle, type ResolvedBlock } from "@folio/core";
import { useSlideEnv } from "./env";
import { highlightLines } from "./highlight";
import { PX_PER_PT } from "./measure";

/**
 * Measure rendered code.
 *
 * @param el - the code block's content element.
 * @returns its height in pt, and each line (1-based, counted over all columns) whose text runs past its column, by how many pt.
 */
export function measureCode(el: HTMLElement): { heightPt: number; wide: { line: number; overPt: number }[] } {
  const wide: { line: number; overPt: number }[] = [];
  el.querySelectorAll<HTMLElement>("[data-code-line] > span").forEach((span, i) => {
    const width = span.closest<HTMLElement>("[data-code-column]")?.clientWidth ?? 0;
    const over = (span.offsetWidth - width) / PX_PER_PT;
    if (over > 0.5) wide.push({ line: i + 1, overPt: Math.round(over * 10) / 10 });
  });
  return { heightPt: el.offsetHeight / PX_PER_PT, wide };
}

/** The code's text style as CSS: the block's font, size and pitch, whitespace kept, the syntax colours as variables. */
function codeCss(block: ResolvedBlock, family: string): CSSProperties {
  const s = block.textStyle;
  const vars = Object.fromEntries(Object.entries(block.syntax).map(([token, color]) => [`--syntax-${token}`, color]));
  return { ...vars, fontFamily: family, fontSize: `${s.size}pt`, fontWeight: s.weight, lineHeight: `${linePitch(s)}pt`, color: s.color ?? undefined, whiteSpace: "pre", tabSize: 4, display: "flex", alignItems: "flex-start", gap: `${block.columnGap}pt`, flexShrink: 0 } as CSSProperties;
}

/** Render a code block's content, or its text area while it is being edited. */
export function CodeBlock({ name, block, value, contentRef, innerPt }: { name: string; block: ResolvedBlock; value: unknown; contentRef: RefObject<HTMLDivElement | null>; innerPt: number }) {
  const env = useSlideEnv();
  const [draft, setDraft] = useState<string | null>(null);
  const css = codeCss(block, fontFamilyOf(env.pack, block.textStyle));
  const pitch = linePitch(block.textStyle);
  const lines = highlightLines(block.content ?? "", block.language);
  const columns = splitColumns(lines, codeColumnSizes(lines.length, block.columns, block.grow ? null : Math.floor((innerPt + 0.5) / pitch)));
  const save = () => {
    if (draft === null) return;
    setDraft(null);
    env.onEditing?.(null);
    if (draft === (block.content ?? "")) return;
    const named = value && typeof value === "object" ? (value as { language?: ResolvedBlock["language"] }).language : undefined;
    env.onCommit?.(name, draft === "" ? null : codeValue(draft, named, refinedBlockStyle(env.pack, { style: block.styleName }).style.language));
  };
  const open = () => env.mode === "edit" && draft === null && (setDraft(block.content ?? ""), env.onEditing?.(name), env.onSelectSlot?.(name));
  const sample = block.content === null && (env.mode === "edit" || env.mode === "thumb");
  return (
    <div ref={contentRef} className="folio-code" data-language={block.language} data-columns={block.columns} style={css} onClick={open}>
      {sample ? <div style={{ opacity: 0.4, minHeight: `${pitch}pt` }}>Code</div> : null}
      {block.content === null ? null : columns.map((column, c) => <CodeColumn key={c} lines={column.lines} first={column.first} numbers={block.lineNumbers} pitch={pitch} gap={block.textStyle.size} />)}
      {draft !== null ? <CodeArea name={name} block={block} draft={draft} minPt={lines.length * pitch + 2 * block.padding} onChange={setDraft} onSave={save} onCancel={() => (setDraft(null), env.onEditing?.(null))} /> : null}
    </div>
  );
}

/** The highlighted lines cut into columns of the given sizes, each with the number of its first line. */
function splitColumns(lines: string[], sizes: number[]): { lines: string[]; first: number }[] {
  let at = 0;
  return sizes.map((n) => ({ lines: lines.slice(at, (at += n)), first: at - n + 1 }));
}

/** One column of code: its gutter of line numbers, when on, and its lines. */
function CodeColumn({ lines, first, numbers, pitch, gap }: { lines: string[]; first: number; numbers: boolean; pitch: number; gap: number }) {
  return (
    <div style={{ flex: "1 1 0", minWidth: 0, display: "flex", gap: `${gap}pt` }}>
      {numbers && lines.length ? <div className="folio-code-gutter">{lines.map((_, i) => <div key={i} style={{ minHeight: `${pitch}pt` }}>{first + i}</div>)}</div> : null}
      <div data-code-column="" style={{ flex: 1, minWidth: 0 }}>
        {lines.map((html, i) => <div key={i} data-code-line="" style={{ minHeight: `${pitch}pt` }}><span dangerouslySetInnerHTML={{ __html: html }} /></div>)}
      </div>
    </div>
  );
}

/**
 * The plain-text editor of the whole code, over the block. It is at least as
 * tall as the code, so no line sits out of sight below a fixed box.
 */
function CodeArea({ name, block, draft, minPt, onChange, onSave, onCancel }: { name: string; block: ResolvedBlock; draft: string; minPt: number; onChange: (d: string) => void; onSave: () => void; onCancel: () => void }) {
  return (
    <textarea aria-label={`Code of ${name}`} autoFocus spellCheck={false} value={draft} onChange={(e) => onChange(e.target.value)} onBlur={onSave} onKeyDown={(e) => codeKey(e, onChange, onCancel)}
      style={{ position: "absolute", left: 0, top: 0, width: "100%", height: `max(100%, ${minPt}pt)`, boxSizing: "border-box", padding: `${block.padding}pt`, font: "inherit", lineHeight: "inherit", color: "inherit", whiteSpace: "pre", resize: "none", border: "none", outline: "none", background: block.fill === "none" ? "#ffffff" : block.fill, borderRadius: `${block.radius}pt`, overflow: "auto", zIndex: 1 }} />
  );
}

/** Keys in the code text area: Escape reverts and leaves, Ctrl+S leaves (saving), Tab inserts two spaces. */
function codeKey(e: KeyboardEvent<HTMLTextAreaElement>, setDraft: (d: string) => void, cancel: () => void): void {
  const area = e.currentTarget;
  if (e.key === "Escape") {
    e.preventDefault();
    cancel();
  } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    area.blur();
  } else if (e.key === "Tab" && !e.shiftKey) {
    e.preventDefault();
    const { selectionStart: at, selectionEnd: end, value } = area;
    setDraft(`${value.slice(0, at)}  ${value.slice(end)}`);
    requestAnimationFrame(() => area.setSelectionRange(at + 2, at + 2));
  }
}
