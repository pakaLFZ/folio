/**
 * When a comment was opened from the inbox, the editor keeps the way back and
 * the way along: Back to the inbox with its filter, and Previous and Next
 * through the same filtered list, across decks.
 */
import { ArrowLeft, ChevronDown, ChevronUp } from "lucide-react";
import { at } from "../boot";
import { Button } from "../ui/button";
import { Tip } from "../ui/tooltip";
import { rowLink, useInbox } from "./inboxData";

/**
 * The inbox filter the editor was opened with.
 *
 * @returns the filter, or null when the page was not opened from the inbox.
 */
export function inboxOrigin(): URLSearchParams | null {
  const params = new URLSearchParams(location.search);
  const out = new URLSearchParams();
  for (const [k, v] of params) if (k.startsWith("inbox.")) out.set(k.slice(6), v);
  return out.toString() ? out : null;
}

/**
 * The walk controls.
 *
 * @param props.origin - the inbox filter.
 * @param props.current - the comment or draft id in focus.
 */
export function InboxWalk({ origin, current }: { origin: URLSearchParams; current: string | null }) {
  const data = useInbox(origin.toString());
  const rows = data?.rows ?? [];
  const i = rows.findIndex((r) => r.id === current);
  const prev = i > 0 ? rows[i - 1] : undefined;
  const next = i >= 0 && i < rows.length - 1 ? rows[i + 1] : undefined;
  return (
    <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-full p-0.5">
      <Button asChild size="sm"><a href={at(`inbox?${origin}`)}><ArrowLeft />Inbox</a></Button>
      <span className="num px-1 text-[11px] text-ink-faint">{i >= 0 ? `${i + 1} / ${rows.length}` : `${rows.length}`}</span>
      <Tip label="Previous in the inbox"><Button asChild={!!prev} size="icon" disabled={!prev} aria-label="Previous comment">{prev ? <a href={rowLink(prev, origin)}><ChevronUp /></a> : <ChevronUp />}</Button></Tip>
      <Tip label="Next in the inbox"><Button asChild={!!next} size="icon" disabled={!next} aria-label="Next comment">{next ? <a href={rowLink(next, origin)}><ChevronDown /></a> : <ChevronDown />}</Button></Tip>
    </div>
  );
}
