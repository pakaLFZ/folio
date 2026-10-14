/**
 * Moving between the board (`/inbox`) and a deck (`/<deck8>/`) inside one
 * document: a link to either is followed with `history.pushState`, the page's
 * bootstrap fetched as JSON (`inbox/boot`, `<deck8>/boot`) instead of a new
 * HTML page, so the stream, the loaded code and the board stay alive. A link
 * whose page is the previous history entry goes Back instead, so the board
 * comes back as it was left. Any other address loads normally.
 */
import { boot, type Boot } from "./boot";
import { installPackFonts } from "./slide/fonts";

export type PageKey = "inbox" | `deck:${string}`;

export interface Arrival {
  key: PageKey;
  boot: Boot;
  /** The history entry being left, and the one arrived at. */
  left: number;
  entry: number;
}

const DECK_PATH = /^([A-Za-z0-9_-]+)\/$/;
const PREFETCH_MS = 10_000;
const entries: PageKey[] = [];
const prefetched = new Map<string, { at: number; boot: Promise<Boot> }>();
let latest = 0;
let here = 0;

/**
 * The in-place page an address opens.
 *
 * @param url - an absolute URL.
 * @returns its page, or null for any address that loads normally.
 */
export function pageOf(url: URL): PageKey | null {
  if (url.origin !== location.origin || !url.pathname.startsWith(boot.root) || url.searchParams.has("print")) return null;
  const rest = url.pathname.slice(boot.root.length);
  if (rest === "inbox") return "inbox";
  const deck = DECK_PATH.exec(rest)?.[1];
  return deck && deck !== "inbox" ? `deck:${deck}` : null;
}

/** Where the history entry this document is on sits in `entries`. */
function index(): number {
  const n = (history.state as { folio?: unknown } | null)?.folio;
  return typeof n === "number" ? n : -1;
}

/** Fetch a page's bootstrap; a deck's also loads its pack fonts, so it paints at once. */
async function fetchBoot(key: PageKey, url: URL): Promise<Boot> {
  const path = key === "inbox" ? "inbox/boot" : `${key.slice(5)}/boot${url.searchParams.get("slide") ? `?${new URLSearchParams({ slide: url.searchParams.get("slide")! })}` : ""}`;
  const res = await fetch(`${boot.root}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  const next = (await res.json()) as Boot;
  if (next.pack) await installPackFonts(next.pack);
  return next;
}

/** A page's bootstrap, from a hover prefetch while it is fresh. */
function bootFor(key: PageKey, url: URL): Promise<Boot> {
  const id = `${url.pathname}?${url.searchParams.get("slide") ?? ""}`;
  const hit = prefetched.get(id);
  prefetched.delete(id);
  if (hit && Date.now() - hit.at < PREFETCH_MS) return hit.boot;
  return fetchBoot(key, url);
}

/** Start fetching a deck's bootstrap when a link to it is hovered. */
function prefetch(url: URL): void {
  const key = pageOf(url);
  const id = `${url.pathname}?${url.searchParams.get("slide") ?? ""}`;
  if (!key?.startsWith("deck:") || Date.now() - (prefetched.get(id)?.at ?? 0) < PREFETCH_MS) return;
  const pending = fetchBoot(key, url);
  pending.catch(() => prefetched.delete(id));
  prefetched.set(id, { at: Date.now(), boot: pending });
}

/** The link a click or hover lands on, when it is a plain same-tab link. */
function linkOf(e: MouseEvent): URL | null {
  const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  return new URL(a.href, location.href);
}

/**
 * Open the page at an address in place.
 *
 * @param url - the address.
 * @param push - true for a new history entry, false when the browser already
 *   moved there (Back or Forward).
 * @param show - draws the page once its bootstrap is in.
 */
async function go(url: URL, push: boolean, show: (arrival: Arrival) => void): Promise<void> {
  const key = pageOf(url)!;
  const ticket = ++latest;
  let next: Boot;
  try {
    next = await bootFor(key, url);
  } catch {
    return void location.assign(url.href);
  }
  if (ticket !== latest) return;
  if (push) {
    const at = here + 1;
    entries.length = at;
    entries[at] = key;
    history.pushState({ folio: at }, "", url.href);
  }
  const left = here;
  here = index();
  show({ key, boot: next, left, entry: here });
}

/**
 * Follow links to the board and to decks in place, and Back and Forward between them.
 *
 * @param first - the page this document loaded with.
 * @param show - draws a page once its bootstrap is in.
 * @returns a function that stops following.
 */
export function followInPlace(first: PageKey, show: (arrival: Arrival) => void): () => void {
  if (index() < 0) history.replaceState({ folio: 0 }, "");
  here = index();
  entries[here] = first;
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const url = linkOf(e);
    const key = url && pageOf(url);
    if (!url || !key) return;
    e.preventDefault();
    if (index() > 0 && entries[index() - 1] === key) history.back();
    else void go(url, true, show);
  };
  const onHover = (e: MouseEvent) => {
    const url = linkOf(e);
    if (url) prefetch(url);
  };
  const onPop = () => {
    const url = new URL(location.href);
    if (pageOf(url)) void go(url, false, show);
    else location.reload();
  };
  addEventListener("click", onClick);
  addEventListener("pointerover", onHover);
  addEventListener("popstate", onPop);
  return () => (removeEventListener("click", onClick), removeEventListener("pointerover", onHover), removeEventListener("popstate", onPop));
}
