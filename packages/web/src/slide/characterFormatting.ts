import { parseMarkup, parseParagraphs, type Run } from '@folio/core';
import { domToMarkup, selectedOffsets, styleSelection } from './markupDom';

export const POWERPOINT_SIZES = [8, 9, 10, 10.5, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 44, 48, 54, 60, 66, 72, 80, 88, 96] as const;

/** Move to the adjacent PowerPoint size, including from a size outside its list. */
export function stepFontSize(size: number, direction: 1 | -1): number {
  return direction === 1
    ? POWERPOINT_SIZES.find((step) => step > size) ?? POWERPOINT_SIZES[POWERPOINT_SIZES.length - 1]!
    : [...POWERPOINT_SIZES].reverse().find((step) => step < size) ?? POWERPOINT_SIZES[0];
}

export interface SelectionStyle {
  size?: number;
  color?: string;
  font?: string;
  highlight?: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strike: boolean;
  sub: boolean;
  sup: boolean;
}

export function selectionStyle(runs: Run[], from: number, to: number, baseSize: number, baseColor?: string, baseFont?: string): SelectionStyle {
  let cursor = 0;
  const selected = runs.filter((run) => {
    const hit = cursor < to && cursor + run.text.length > from;
    cursor += run.text.length;
    return hit;
  });
  const common = (key: 'color' | 'font' | 'highlight', fallback?: string): string | undefined => {
    const first = selected[0]?.[key] ?? fallback;
    return selected.every((run) => (run[key] ?? fallback) === first) ? first : undefined;
  };
  const all = (key: 'bold' | 'italic' | 'underline' | 'strike') => selected.length > 0 && selected.every((run) => !!run[key]);
  return {
    size: selected.length && selected.every((run) => (run.size ?? baseSize) === (selected[0]!.size ?? baseSize)) ? selected[0]!.size ?? baseSize : undefined,
    color: common('color', baseColor), font: common('font', baseFont), highlight: common('highlight'),
    bold: all('bold'), italic: all('italic'), underline: all('underline'), strike: all('strike'),
    sub: selected.length > 0 && selected.every((run) => run.script === 'sub'),
    sup: selected.length > 0 && selected.every((run) => run.script === 'sup'),
  };
}

export function currentSelectionStyle(root: HTMLElement, baseSize: number, baseColor?: string, baseFont?: string): SelectionStyle | null {
  const offsets = selectedOffsets(root);
  if (!offsets) return null;
  const source = domToMarkup(root);
  const paragraphs = parseParagraphs(source);
  const runs = root.querySelector('[data-paragraph]') ? paragraphs.flatMap((paragraph) => paragraph.runs) : parseMarkup(source);
  return selectionStyle(runs, ...offsets, baseSize, baseColor, baseFont);
}

/** Handle PowerPoint character shortcuts only while characters in this slot are selected. */
export function characterShortcut(e: KeyboardEvent, root: HTMLElement, baseSize: number, palette: Record<string, string>): boolean {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || !selectedOffsets(root)) return false;
  const state = currentSelectionStyle(root, baseSize)!;
  const key = e.key.toLowerCase();
  let change: Partial<Run> | null = null;
  if (e.shiftKey && (e.key === '>' || e.code === 'Period')) change = { size: stepFontSize(state.size ?? baseSize, 1) };
  else if (e.shiftKey && (e.key === '<' || e.code === 'Comma')) change = { size: stepFontSize(state.size ?? baseSize, -1) };
  else if (!e.shiftKey && e.key === ']') change = { size: Math.min(400, (state.size ?? baseSize) + 1) };
  else if (!e.shiftKey && e.key === '[') change = { size: Math.max(1, (state.size ?? baseSize) - 1) };
  else if (!e.shiftKey && key === 'b') change = { bold: !state.bold };
  else if (!e.shiftKey && key === 'i') change = { italic: !state.italic };
  else if (!e.shiftKey && key === 'u') change = { underline: !state.underline };
  else if (e.key === '=' || e.key === '+' || e.code === 'Equal') change = { script: e.shiftKey ? (state.sup ? 'none' : 'sup') : (state.sub ? 'none' : 'sub') };
  else if (!e.shiftKey && e.code === 'Space') change = { bold: false, italic: false, underline: false, strike: false, script: 'none', size: undefined, color: undefined, font: undefined, highlight: undefined };
  if (!change) return false;
  e.preventDefault();
  e.stopPropagation();
  styleSelection(root, change, palette);
  document.dispatchEvent(new Event('selectionchange'));
  return true;
}
