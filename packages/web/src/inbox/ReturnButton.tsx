/**
 * The board's way back to the deck the user came from. The editor's inbox
 * link names it as `?from=<token>&slide=<id>`; without that, Back is used when
 * the previous page is this site, then the only deck, then the landing page.
 */
import { ArrowLeft } from "lucide-react";
import { useEffect, useState } from "react";
import { call } from "../api";
import { at } from "../boot";
import { Button } from "../ui/button";
import { Tip } from "../ui/tooltip";

export const ORIGIN_KEYS = ["from", "slide"] as const;
const TOKEN = /^[A-Za-z0-9_-]+$/;

/**
 * The deck page the inbox was opened from.
 *
 * @returns its address, or null when the URL does not name a deck.
 */
export function originLink(search = location.search): string | null {
  const params = new URLSearchParams(search);
  const from = params.get("from");
  if (!from || !TOKEN.test(from)) return null;
  const slide = params.get("slide");
  return at(`${from}/${slide ? `?${new URLSearchParams({ slide })}` : ""}`);
}

/**
 * The origin keys of a URL's query, to keep them through filter changes.
 *
 * @returns the `from` and `slide` parameters present in `search`.
 */
export function originParams(search = location.search): URLSearchParams {
  const params = new URLSearchParams(search);
  const out = new URLSearchParams();
  for (const k of ORIGIN_KEYS) {
    const v = params.get(k);
    if (v) out.set(k, v);
  }
  return out;
}

/** Whether the previous history entry is a page of this site. */
function cameFromHere(): boolean {
  try {
    return history.length > 1 && new URL(document.referrer).origin === location.origin;
  } catch {
    return false;
  }
}

/**
 * Where the button goes when the URL names no deck: the only deck, else `/`.
 *
 * @returns the fallback address, settled once the deck list arrives.
 */
function useFallback(known: boolean): string {
  const [href, setHref] = useState(at(""));
  useEffect(() => {
    if (known) return;
    void call<{ decks: { token: string }[] }>("api/decks").then((r) => r.decks.length === 1 && setHref(at(`${r.decks[0]!.token}/`)), () => {});
  }, [known]);
  return href;
}

/** The button in the board's top-left corner. */
export function ReturnButton() {
  const [origin] = useState(() => originLink());
  const fallback = useFallback(origin !== null);
  const [back] = useState(() => origin === null && cameFromHere());
  const onClick = (e: React.MouseEvent) => {
    if (!back || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    history.back();
  };
  return (
    <Tip label="Back to the deck">
      <Button asChild size="icon" aria-label="Back to the deck">
        <a href={origin ?? fallback} onClick={onClick}><ArrowLeft /></a>
      </Button>
    </Tip>
  );
}
