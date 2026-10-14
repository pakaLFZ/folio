/**
 * What the user is looking at: the report an editor tab sends, the order in
 * which tabs are named (visible, then focused, then most recently active), and
 * the text `folio viewing` and `folio status` print.
 */

export type ViewingMode = "edit" | "view";

/** What one editor tab says it shows. */
export interface ViewingReport {
  tab: string;
  token: string;
  slide: string | null;
  mode: ViewingMode;
  /** The selected slot; a shape is a `shape:<x>` slot. */
  slot: string | null;
  /** The slides selected in the rail, when more than one. */
  slides: string[];
  visible: boolean;
  focused: boolean;
}

/** One tab as an agent reads it. */
export interface ViewingTab {
  tab: string;
  /** The workspace-relative deck folder, e.g. `decks/example`. */
  deck: string;
  token: string;
  title: string;
  slide: { id: string; position: number; of: number; layout: string | null; title: string } | null;
  mode: ViewingMode;
  selection: { slot: string | null; slides: string[] };
  visible: boolean;
  focused: boolean;
  activeSecondsAgo: number;
}

export interface Viewing {
  version: number;
  tabs: ViewingTab[];
}

const isText = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max;

/**
 * Read a tab's report from a request body.
 *
 * @param body - the parsed JSON.
 * @returns the report, `{closed: tab}` for a tab that has gone, or an error naming the bad field.
 */
export function parseViewingReport(body: unknown): { report: ViewingReport } | { closed: string } | { error: string } {
  const b = (body ?? {}) as Record<string, unknown>;
  if (!isText(b.tab, 64)) return { error: "tab must be a short string" };
  if (b.closed === true) return { closed: b.tab };
  if (!isText(b.token, 64)) return { error: "token must be a deck token" };
  if (b.slide !== null && !isText(b.slide)) return { error: "slide must be a slide id or null" };
  if (b.slot !== null && b.slot !== undefined && !isText(b.slot)) return { error: "slot must be a slot name or null" };
  const slides = Array.isArray(b.slides) ? b.slides.filter((s): s is string => isText(s)) : [];
  const mode: ViewingMode = b.mode === "view" ? "view" : "edit";
  return { report: { tab: b.tab, token: b.token, slide: (b.slide as string | null) ?? null, mode, slot: (b.slot as string | null | undefined) ?? null, slides, visible: b.visible === true, focused: b.focused === true } };
}

/**
 * Whether two reports show the same thing (times aside).
 *
 * @returns true when every reported field is equal.
 */
export function sameView(a: ViewingReport, b: ViewingReport): boolean {
  return a.token === b.token && a.slide === b.slide && a.mode === b.mode && a.slot === b.slot && a.visible === b.visible && a.focused === b.focused && a.slides.join() === b.slides.join();
}

/**
 * Order tabs for an agent: visible first, then focused, then most recently active.
 *
 * @param entries - each with its last activity time in ms.
 * @returns a new array in that order.
 */
export function rankViewing<T extends { visible: boolean; focused: boolean; activeAt: number }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => Number(b.visible) - Number(a.visible) || Number(b.focused) - Number(a.focused) || b.activeAt - a.activeAt);
}

/** A duration in words: `now`, `12 s ago`, `3 min ago`. */
function ago(seconds: number): string {
  if (seconds < 2) return "now";
  return seconds < 120 ? `${seconds} s ago` : `${Math.round(seconds / 60)} min ago`;
}

/**
 * One line for a tab: deck, slide, mode, selection, state and activity.
 *
 * @returns e.g. `decks/example  s002 (2 of 7, layout two-col)  edit  slot shape:a  visible, focused, active now`.
 */
export function viewingLine(t: ViewingTab): string {
  const slide = t.slide ? `${t.slide.id} (${t.slide.position} of ${t.slide.of}${t.slide.layout ? `, layout ${t.slide.layout}` : ""})` : "no slide";
  const selection = [t.selection.slot ? `slot ${t.selection.slot}` : "", t.selection.slides.length > 1 ? `slides ${t.selection.slides.join(",")}` : ""].filter(Boolean).join(", ");
  const state = [t.visible ? "visible" : "hidden", ...(t.focused ? ["focused"] : []), `active ${ago(t.activeSecondsAgo)}`].join(", ");
  return [t.deck, slide, t.mode, ...(selection ? [selection] : []), state].join("  ");
}

/**
 * What `folio viewing` prints.
 *
 * @param tabs - ranked tabs.
 * @returns the top tab in full, the rest one line each; or that no editor tab is open.
 */
export function viewingText(tabs: ViewingTab[]): string {
  const [top, ...rest] = tabs;
  if (!top) return "no editor tab is open\n";
  const lines = [
    `deck      ${top.deck}  "${top.title}"`,
    `slide     ${top.slide ? `${top.slide.id}, ${top.slide.position} of ${top.slide.of}${top.slide.title ? `  "${top.slide.title}"` : ""}` : "none"}`,
    `layout    ${top.slide?.layout ?? "none"}`,
    `mode      ${top.mode}`,
    `selection ${top.selection.slot ?? "none"}${top.selection.slides.length > 1 ? `; slides ${top.selection.slides.join(",")}` : ""}`,
    `tab       ${top.visible ? "visible" : "hidden"}${top.focused ? ", focused" : ""}, active ${ago(top.activeSecondsAgo)}`,
  ];
  if (rest.length) lines.push("", `other tabs (${rest.length}):`, ...rest.map((t) => `  ${viewingLine(t)}`));
  return `${lines.join("\n")}\n`;
}

/**
 * The line `folio status` prints.
 *
 * @param tabs - ranked tabs, or null when no server runs.
 * @returns one line ending in a newline.
 */
export function viewingStatusLine(tabs: ViewingTab[] | null): string {
  if (!tabs) return "viewing: no editor is open (no folio server is running)\n";
  const top = tabs[0];
  if (!top) return "viewing: no editor tab is open\n";
  const more = tabs.length > 1 ? `  (+${tabs.length - 1} other tab${tabs.length > 2 ? "s" : ""})` : "";
  return `viewing: ${top.deck} ${top.slide ? `${top.slide.id} (${top.slide.position} of ${top.slide.of})` : "no slide"} ${top.mode}${top.selection.slot ? ` ${top.selection.slot}` : ""}, active ${ago(top.activeSecondsAgo)}${more}  (folio viewing)\n`;
}
