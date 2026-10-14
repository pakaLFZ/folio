/**
 * Which slides `folio shot` takes: `--slides` ids and id ranges
 * (`s001,s010-s020`) and `--pages` positions and ranges in deck order
 * (`1-10,42`). Both may be given; the union is taken, in deck order.
 */

const items = (list: string | undefined) => (list ?? "").split(",").map((s) => s.trim()).filter(Boolean);

/**
 * The slides one `--slides` item names: the id itself, or every slide from
 * one id to another in deck order.
 *
 * @param ids - the deck's slides, in order.
 */
function idItem(ids: string[], item: string): string[] {
  if (ids.includes(item)) return [item];
  for (let dash = item.indexOf("-"); dash > 0; dash = item.indexOf("-", dash + 1)) {
    const [from, to] = [ids.indexOf(item.slice(0, dash)), ids.indexOf(item.slice(dash + 1))];
    if (from >= 0 && to >= 0) return ids.slice(Math.min(from, to), Math.max(from, to) + 1);
  }
  throw new Error(`no slide ${item} in the deck; slides: ${ids.length > 12 ? `${ids.slice(0, 6).join(", ")}, ... ${ids.at(-1)}` : ids.join(", ")}`);
}

/**
 * The slides one `--pages` item names: a 1-based position or a range of them.
 *
 * @param ids - the deck's slides, in order.
 */
function pageItem(ids: string[], item: string): string[] {
  const match = /^(\d+)(?:-(\d+))?$/.exec(item);
  const [from, to] = match ? [Number(match[1]), Number(match[2] ?? match[1])] : [0, 0];
  if (!match || from < 1 || to > ids.length || from > to) throw new Error(`--pages ${item} is not a page or range within 1-${ids.length}`);
  return ids.slice(from - 1, to);
}

/**
 * The slides asked for, in deck order; every slide when nothing is asked.
 *
 * @param ids - the deck's slides, in order.
 * @param slides - the `--slides` value.
 * @param pages - the `--pages` value.
 * @returns the chosen ids; refuses an id or page the deck does not have.
 */
export function selectSlides(ids: string[], slides?: string, pages?: string): string[] {
  if (!items(slides).length && !items(pages).length) return ids;
  const chosen = new Set([...items(slides).flatMap((item) => idItem(ids, item)), ...items(pages).flatMap((item) => pageItem(ids, item))]);
  return ids.filter((id) => chosen.has(id));
}
