import { domToMarkup, markupToHtml } from './markupDom';
import { parseMarkup, serializeMarkup, type ListKind, type Run } from '@folio/core';

const prefix = /^( *)(?:- |\d+\. )/;
const conversions = new WeakMap<HTMLElement, { before: string; after: string }>();
const literal = (value: string) => /^(?:- |\d+\. )/.test(value) ? `\\${value}` : value;

function lineIndex(root: HTMLElement, node: Node | null): number {
  const paragraph = (node instanceof Element ? node : node?.parentElement)?.closest('[data-paragraph]');
  if (paragraph) return [...root.querySelectorAll('[data-paragraph]')].indexOf(paragraph);
  if (!node) return 0;
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, getSelection()?.anchorOffset ?? 0);
  return Math.max(0, range.toString().split('\n').length - 1);
}

function selectionLines(root: HTMLElement): [number, number] {
  const selection = getSelection();
  const a = lineIndex(root, selection?.anchorNode ?? null);
  const b = lineIndex(root, selection?.focusNode ?? null);
  return [Math.min(a, b), Math.max(a, b)];
}

function caretInLine(root: HTMLElement, index: number, atEnd = false): void {
  const paragraph = root.querySelectorAll('[data-paragraph]')[index] ?? root;
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  range.collapse(!atEnd);
  const selection = getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function replace(root: HTMLElement, lines: string[], index: number, atEnd = false, asLiteral = false): void {
  root.removeAttribute('data-list-literal');
  root.innerHTML = markupToHtml(lines.join('\n'));
  if (asLiteral) root.setAttribute('data-list-literal', '');
  caretInLine(root, index, atEnd);
  root.dispatchEvent(new Event('input', { bubbles: true }));
}

function current(root: HTMLElement): { lines: string[]; index: number; match: RegExpExecArray | null } {
  const lines = domToMarkup(root).split('\n');
  const index = Math.min(lineIndex(root, getSelection()?.anchorNode ?? null), lines.length - 1);
  return { lines, index, match: prefix.exec(lines[index] ?? '') };
}

export function listSelectionKind(root: HTMLElement): ListKind | null {
  const lines = domToMarkup(root).split('\n');
  const [from, to] = selectionLines(root);
  const kinds = lines.slice(from, to + 1).map((line) => prefix.exec(line)?.[0].trim().startsWith('-') ? 'bullet' : /^ *\d+\. /.test(line) ? 'number' : null);
  return kinds.length && kinds.every((kind) => kind === kinds[0]) ? kinds[0] ?? null : null;
}

export function toggleList(root: HTMLElement, kind: ListKind): boolean {
  const lines = domToMarkup(root).split('\n');
  const [from, to] = selectionLines(root);
  const remove = listSelectionKind(root) === kind;
  for (let index = from; index <= to; index++) {
    const match = prefix.exec(lines[index] ?? '');
    const content = (lines[index] ?? '').slice(match?.[0].length ?? 0);
    lines[index] = remove ? content : `${match?.[1] ?? ''}${kind === 'bullet' ? '- ' : '1. '}${content}`;
  }
  replace(root, lines, from);
  return true;
}

function indent(root: HTMLElement, outward: boolean): boolean {
  const { lines, index, match } = current(root);
  if (!match) return false;
  const spaces = match[1]!.length;
  if (!outward && spaces >= 4) return true;
  lines[index] = outward ? spaces ? lines[index]!.slice(2) : lines[index]!.slice(match[0].length) : `  ${lines[index]}`;
  replace(root, lines, index);
  return true;
}

function enter(root: HTMLElement): boolean {
  const { lines, index, match } = current(root);
  if (!match) return false;
  const content = lines[index]!.slice(match[0].length);
  if (!content) lines[index] = '';
  else {
    const paragraph = root.querySelectorAll('[data-paragraph]')[index];
    const range = document.createRange();
    range.selectNodeContents(paragraph ?? root);
    range.setEnd(getSelection()!.anchorNode!, getSelection()!.anchorOffset);
    const [head, tail] = splitRuns(parseMarkup(content), range.toString().length);
    lines[index] = match[0] + serializeMarkup(head);
    lines.splice(index + 1, 0, `${match[1]}${match[0].trim().startsWith('-') ? '- ' : '1. '}${serializeMarkup(tail)}`);
  }
  replace(root, lines, content ? index + 1 : index);
  return true;
}

function splitRuns(runs: Run[], at: number): [Run[], Run[]] {
  const head: Run[] = [];
  const tail: Run[] = [];
  let left = at;
  for (const run of runs) {
    if (left > 0) head.push({ ...run, text: run.text.slice(0, left) });
    if (left < run.text.length) tail.push({ ...run, text: run.text.slice(left) });
    left = Math.max(0, left - run.text.length);
  }
  return [head, tail];
}

function backspace(root: HTMLElement): boolean {
  const { lines, index, match } = current(root);
  if (!match || !getSelection()?.isCollapsed) return false;
  const paragraph = root.querySelectorAll('[data-paragraph]')[index];
  if (paragraph) {
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    range.setEnd(getSelection()!.anchorNode!, getSelection()!.anchorOffset);
    if (range.toString()) return false;
  }
  lines[index] = lines[index]!.slice(match[0].length);
  replace(root, lines, index);
  return true;
}

function convert(root: HTMLElement, key: string): boolean {
  const before = domToMarkup(root);
  const { lines, index } = current(root);
  const line = lines[index] ?? '';
  if (!['-', '*'].includes(line) && !/^\d+\.$/.test(line)) return false;
  lines[index] = line === '-' || line === '*' ? '- ' : '1. ';
  const after = lines.join('\n');
  conversions.set(root, { before: literal(before + key), after });
  replace(root, lines, index, true);
  return true;
}

/** Convert text inserted by input methods that do not send a Space keydown. */
export function autoConvertList(root: HTMLElement): boolean {
  const node = getSelection()?.anchorNode;
  if ((node instanceof Element ? node : node?.parentElement)?.closest('[data-list]')) return false;
  const { lines, index } = current(root);
  const line = lines[index] ?? '';
  if (!/^(?:- |\* |1\. )$/.test(line)) return false;
  const before = lines.join('\n');
  lines[index] = line.startsWith('1') ? '1. ' : '- ';
  const after = lines.join('\n');
  conversions.set(root, { before: literal(before), after });
  replace(root, lines, index, true);
  return true;
}

/** Handle list keys before the browser changes the editable DOM. */
export function listKey(event: KeyboardEvent, root: HTMLElement): boolean {
  const mod = event.ctrlKey || event.metaKey;
  const shortcut = mod && event.shiftKey && (event.key === '8' || event.key === '7');
  const converted = conversions.get(root);
  if (mod && event.key.toLowerCase() === 'z' && converted && domToMarkup(root) === converted.after) {
    replace(root, converted.before.split('\n'), 0, true, true);
    conversions.delete(root);
    event.preventDefault();
    return true;
  }
  let handled = false;
  if (shortcut) handled = toggleList(root, event.key === '8' ? 'bullet' : 'number');
  else if (event.key === 'Tab') handled = indent(root, event.shiftKey);
  else if (event.key === 'Enter' && !event.shiftKey) handled = enter(root);
  else if (event.key === 'Backspace') handled = backspace(root);
  else if (event.key === ' ' && !mod) handled = convert(root, event.key);
  if (handled) event.preventDefault();
  return handled;
}
