/**
 * What the print page is still waiting for, published as
 * `window.__FOLIO_PENDING__()` so a printer that gives up can name it: the
 * page's own loads that are not in yet, then every picture not loaded and
 * every table still reading its file, each by slide and slot.
 */

declare global {
  interface Window {
    __FOLIO_PENDING__?: () => string[];
  }
}

/** `s006/fig:a`, or the slide alone for a picture outside any slot. */
function placeOf(el: Element): string {
  const slide = el.closest("section[data-slide]")?.getAttribute("data-slide") ?? "no slide";
  const slot = el.closest("[data-slot]")?.getAttribute("data-slot");
  return slot ? `${slide}/${slot}` : slide;
}

/**
 * Name everything still loading.
 *
 * @param loads - the page's own loads, by name, true once in.
 */
export function pendingItems(loads: Record<string, boolean>): string[] {
  const waiting = Object.entries(loads).filter(([, done]) => !done).map(([name]) => name);
  const images = [...document.images].filter((img) => !img.complete).map((img) => `${placeOf(img)} image ${img.getAttribute("src")}`);
  const tables = [...document.querySelectorAll("[data-folio-loading]")].map((el) => `${placeOf(el)} table file`);
  return [...waiting, ...images, ...tables];
}
