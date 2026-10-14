/**
 * The DOM line measurer: one routine used by the live view, `folio check` and
 * `folio pdf`. The line height of every text style is fixed, and sub- and
 * superscripts take no line height, so a slot's line count is its laid-out
 * text height divided by the line pitch.
 */
import type { MeasuredSlot } from "@folio/core";

export const PX_PER_PT = 4 / 3;

/**
 * Measure one text slot.
 *
 * @param slot - the slot name.
 * @param text - the element that holds the laid-out text.
 * @param box - the slot's box element (unscaled layout size is read).
 * @param pitchPt - the role's line pitch in pt.
 * @param withLines - read each rendered line's text when there is more than
 *   one (left out while the user types, so typing stays cheap).
 * @returns line count, how far a non-wrapping line runs past the box in pt,
 *   and the text of each line when asked for.
 */
export function measureText(slot: string, text: HTMLElement, box: HTMLElement, pitchPt: number, withLines = false): MeasuredSlot {
  const heightPt = text.offsetHeight / PX_PER_PT;
  const lines = text.textContent ? Math.max(1, Math.ceil(heightPt / pitchPt - 0.03)) : 0;
  const padded = box.style.padding ? getComputedStyle(box) : null;
  const inner = box.clientWidth - (padded ? parseFloat(padded.paddingLeft) + parseFloat(padded.paddingRight) : 0);
  const overPx = text.scrollWidth - inner;
  return { slot, lines, overPt: Math.max(0, overPx / PX_PER_PT), ...(withLines && lines > 1 ? { lineTexts: renderedLines(text, pitchPt * PX_PER_PT) } : {}) };
}

/**
 * The text of each line as laid out: words grouped by the line box they sit
 * in. A word split over elements (`CO<sub>2</sub>`) stays one word, and a
 * sub- or superscript stays on its line.
 *
 * @param text - the element that holds the laid-out text.
 * @param pitchPx - the line pitch in unscaled CSS pixels; a word whose bottom
 *   sits less than half a pitch (at the page's zoom) from the line's is on it.
 * @returns one string per rendered line.
 */
export function renderedLines(text: HTMLElement, pitchPx: number): string[] {
  const lines: { bottom: number; text: string }[] = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(text, NodeFilter.SHOW_TEXT);
  const half = (pitchPx * text.getBoundingClientRect().height) / (2 * (text.offsetHeight || 1));
  let spaceBefore = true;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const content = node.textContent ?? "";
    for (const word of content.matchAll(/\S+/g)) {
      range.setStart(node, word.index);
      range.setEnd(node, word.index + word[0].length);
      const rect = range.getClientRects()[0];
      if (!rect) continue;
      const last = lines.at(-1);
      const glued = word.index === 0 && !spaceBefore;
      if (last && Math.abs(rect.bottom - last.bottom) < half) last.text += `${glued ? "" : " "}${word[0]}`;
      else lines.push({ bottom: rect.bottom, text: word[0] });
    }
    if (content) spaceBefore = /\s$/.test(content);
  }
  return lines.map((l) => l.text);
}
