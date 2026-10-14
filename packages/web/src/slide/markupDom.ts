/** Slot markup to HTML and edited DOM back to markup. */
import { cssColor, parseMarkup, parseParagraphs, serializeMarkup, type Run } from "@folio/core";

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const attrs = (run: Run) => Object.entries(run).filter(([k, v]) => !["text", "bold", "script"].includes(k) && v !== undefined && v !== false);
const data = (run: Run) => attrs(run).map(([k, v]) => ` data-run-${k}="${escapeHtml(String(v))}"`).join("");

/** HTML for the common Edit, View, thumbnail and print renderer. */
function runsToHtml(runs: Run[], palette: Record<string, string>, ink: string): string {
  return runs.map((run) => {
    let html = escapeHtml(run.text).replace(/\u2028/g, "<br>");
    if (run.script === "sub") html = `<sub>${html}</sub>`;
    if (run.script === "sup") html = `<sup>${html}</sup>`;
    if (run.bold) html = `<b>${html}</b>`;
    if (run.italic) html = `<i>${html}</i>`;
    if (run.underline) html = `<u>${html}</u>`;
    if (run.strike) html = `<s>${html}</s>`;
    if (!attrs(run).length) return html;
    const styles = [
      run.size ? `font-size:${run.size}pt;line-height:${run.size * 1.2}pt` : "",
      run.color ? `color:${cssColor(run.color, palette, ink)}` : "",
      run.highlight ? `background-color:${cssColor(run.highlight, palette, ink)}` : "",
      run.font ? `font-family:${escapeHtml(run.font)}` : "",
    ].filter(Boolean).join(";");
    return `<span${data(run)} style="${styles}">${html}</span>`;
  }).join("");
}

export function markupToHtml(source: string, palette: Record<string, string> = {}, ink = "#000000"): string {
  const paragraphs = parseParagraphs(source);
  if (!paragraphs.some((p) => p.kind)) {
    if (source.split("\n").some((line) => /^\\(?:- |\d+\. )/.test(line))) return paragraphs.map((p, index) => `<div data-paragraph=""${/^\\(?:- |\d+\. )/.test(source.split("\n")[index] ?? "") ? ' data-literal=""' : ""}>${runsToHtml(p.runs, palette, ink) || "<br>"}</div>`).join("");
    return runsToHtml(parseMarkup(source), palette, ink);
  }
  return paragraphs.map((p) => {
    const marker = p.kind ? ` data-list="${p.kind}" data-level="${p.level}" data-marker="${p.marker}"` : "";
    const first = p.runs[0];
    const color = first?.color ? cssColor(first.color, palette, ink) : "currentColor";
    const css = p.kind ? ` style="--list-marker-color:${color};--list-marker-size:${first?.size ? `${first.size}pt` : "1em"}"` : "";
    return `<div data-paragraph=""${marker}${css}>${runsToHtml(p.runs, palette, ink) || "<br>"}</div>`;
  }).join("");
}

/** Walk browser HTML without admitting pasted arbitrary styles as pack attributes. */
function walk(node: Node, state: Omit<Run, "text">, out: Run[]): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = (node.textContent ?? "").replace(/\u200b/g, "").replace(/\n/g, node.parentElement?.closest('[data-paragraph]') ? "\u2028" : "\n");
    if (text) out.push({ ...state, text });
    return;
  }
  if (!(node instanceof HTMLElement)) return;
  const tag = node.tagName;
  if (tag === "BR") return void out.push({ ...state, text: node.parentElement?.closest('[data-paragraph]') ? "\u2028" : "\n" });
  const source = node.dataset;
  const next: Omit<Run, "text"> = {
    ...state,
    bold: state.bold || tag === "B" || tag === "STRONG",
    script: tag === "SUB" ? "sub" : tag === "SUP" ? "sup" : state.script,
    ...(source.runSize ? { size: Number(source.runSize) } : {}),
    ...(source.runColor ? { color: source.runColor } : {}),
    ...(source.runFont ? { font: source.runFont } : {}),
    ...(source.runHighlight ? { highlight: source.runHighlight } : {}),
    italic: state.italic || tag === "I" || tag === "EM",
    underline: state.underline || tag === "U",
    strike: state.strike || tag === "S" || tag === "STRIKE",
  };
  const block = (tag === "DIV" || tag === "P") && out.length > 0 && !out[out.length - 1]!.text.endsWith("\n");
  if (block) out.push({ ...state, text: "\n" });
  node.childNodes.forEach((child) => walk(child, next, out));
}

/** Convert an edited slot to its JSON string. */
export function domToMarkup(element: HTMLElement): string {
  const paragraphs = [...element.children].filter((child) => child instanceof HTMLElement && child.hasAttribute("data-paragraph"));
  if (paragraphs.length) return paragraphs.map((child) => {
    const runs: Run[] = [];
    if (!(child.childNodes.length === 1 && child.firstChild instanceof HTMLBRElement)) child.childNodes.forEach((node) => walk(node, { bold: false, script: "none" }, runs));
    const kind = child.getAttribute("data-list");
    const level = Number(child.getAttribute("data-level"));
    const prefix = kind && level >= 1 && level <= 3 ? `${"  ".repeat(level - 1)}${kind === "bullet" ? "- " : "1. "}` : "";
    const content = serializeMarkup(runs);
    return prefix + (kind ? content : child.hasAttribute('data-literal') && /^(?:- |\d+\. )/.test(content) ? `\\${content}` : content);
  }).join("\n");
  const runs: Run[] = [];
  element.childNodes.forEach((child) => walk(child, { bold: false, script: "none" }, runs));
  const content = serializeMarkup(runs).replace(/\n$/, "");
  return element.hasAttribute('data-list-literal') && /^(?:- |\d+\. )/.test(content) ? `\\${content}` : content;
}

/** Insert a copied Folio HTML fragment as sanitized inline runs. */
export function pasteMarkup(html: string, palette: Record<string, string>): boolean {
  if (!/data-run-|<(?:b|strong|i|em|u|s|strike|sub|sup)\b/i.test(html)) return false;
  const holder = document.createElement("div");
  holder.innerHTML = html;
  document.execCommand("insertHTML", false, markupToHtml(domToMarkup(holder), palette));
  return true;
}

function offset(root: HTMLElement, node: Node, pos: number): number {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, pos);
  return range.toString().length;
}

function restore(root: HTMLElement, from: number, to: number): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let length = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const end = length + (node.textContent?.length ?? 0);
    if (!started && from <= end) { range.setStart(node, from - length); started = true; }
    if (started && to <= end) { range.setEnd(node, to - length); break; }
    length = end;
  }
  if (!started) return;
  if (!range.endContainer) range.setEnd(range.startContainer, range.startOffset);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

/** Current character offsets inside one editable slot. */
export function selectedOffsets(root: HTMLElement): [number, number] | null {
  const sel = getSelection();
  if (!sel || sel.isCollapsed || !sel.anchorNode || !sel.focusNode || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) return null;
  const a = offset(root, sel.anchorNode, sel.anchorOffset);
  const b = offset(root, sel.focusNode, sel.focusOffset);
  return [Math.min(a, b), Math.max(a, b)];
}

/** Apply one character style to the current selection and keep the range selected. */
export function styleSelection(root: HTMLElement, change: Partial<Run>, palette: Record<string, string> = {}): boolean {
  const offsets = selectedOffsets(root);
  if (!offsets) return false;
  const source = domToMarkup(root);
  if (root.querySelector('[data-paragraph]')) {
    let cursor = 0;
    const next = parseParagraphs(source).map((paragraph, index) => {
      const runs = changeRuns(paragraph.runs, change, offsets, cursor);
      cursor += paragraph.runs.reduce((sum, run) => sum + run.text.length, 0);
      const prefix = paragraph.kind ? `${"  ".repeat(paragraph.level - 1)}${paragraph.kind === "bullet" ? "- " : "1. "}` : "";
      const content = serializeMarkup(runs);
      return prefix + (!paragraph.kind && /^\\(?:- |\d+\. )/.test(source.split("\n")[index] ?? "") ? `\\${content}` : content);
    }).join("\n");
    root.innerHTML = markupToHtml(next, palette);
    restore(root, ...offsets);
    root.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }
  const runs = parseMarkup(source);
  const next = changeRuns(runs, change, offsets, 0);
  root.innerHTML = markupToHtml(serializeMarkup(next), palette);
  restore(root, ...offsets);
  root.dispatchEvent(new Event("input", { bubbles: true }));
  return true;
}

function changeRuns(runs: Run[], change: Partial<Run>, offsets: [number, number], origin: number): Run[] {
  const next: Run[] = [];
  let cursor = origin;
  for (const run of runs) {
    const start = Math.max(0, offsets[0] - cursor);
    const end = Math.min(run.text.length, offsets[1] - cursor);
    if (start > 0) next.push({ ...run, text: run.text.slice(0, start) });
    if (end > start) next.push({ ...run, ...change, text: run.text.slice(start, end) });
    if (end < run.text.length) next.push({ ...run, text: run.text.slice(Math.max(start, end)) });
    cursor += run.text.length;
  }
  return next;
}
