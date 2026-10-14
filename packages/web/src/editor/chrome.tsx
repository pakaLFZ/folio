/**
 * The editor's corner controls, as cavitas places them: each pane's toggle is
 * one fixed element over the pane's header, glass only while the pane is
 * shut, so opening or closing moves and resizes no button. The mode pill
 * stands one gutter past the rail's toggles, or past the rail while it is open.
 * A Home button, the way to the deck list, and a Copy button for the deck's
 * CLI path always stand right of the rail toggle, in that order.
 */
import { Check, Copy, Eye, House, PanelLeft, PanelRight, Pen } from "lucide-react";
import { useEffect, useState, type CSSProperties } from "react";
import { at, boot } from "../boot";
import { Button } from "../ui/button";
import { cn } from "../ui/cn";
import { Segmented } from "../ui/segmented";
import { Tip } from "../ui/tooltip";
import type { DeckState, DeckStore } from "./deckState";
import type { Zoom } from "./useZoom";

/**
 * Where a pane stands: in place when open, off-screen and hidden when shut,
 * kept mounted either way.
 *
 * @param away - the transform that takes the shut pane off-screen.
 */
export function paneStyle(open: boolean, away: string): CSSProperties {
  return { transform: open ? "none" : away, visibility: open ? "visible" : "hidden" };
}

const RAIL_KEY = "folio.rail";

/** The rail's state as this browser last chose it; shut when nothing is stored. */
function storedRail(): boolean {
  try {
    return localStorage.getItem(RAIL_KEY) === "open";
  } catch {
    return false;
  }
}

/**
 * Whether the rail is open: one slide in focus unless this browser chose the rail.
 *
 * @returns the state and a setter that remembers the choice.
 */
export function useRailOpen(): [boolean, (open: boolean) => void] {
  const [open, setOpen] = useState(storedRail);
  const choose = (next: boolean) => {
    setOpen(next);
    try {
      localStorage.setItem(RAIL_KEY, next ? "open" : "shut");
    } catch {
      return;
    }
  };
  return [open, choose];
}

/** How long the Copy button's icon shows Check before it reverts to Copy. */
const COPY_FLASH_MS = 1200;

/**
 * Copy text to the clipboard: the async API where it exists, else a hidden
 * textarea and the legacy command (non-secure http has no `navigator.clipboard`).
 */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      /* fall through to the textarea fallback */
    }
  }
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  document.execCommand("copy");
  ta.remove();
}

/**
 * Copies the deck's folder path relative to the workspace root (e.g.
 * `decks/example`), the argument every `folio` CLI command takes for this
 * deck (`openDeck` in `packages/cli/src/deckcmds.ts`). The icon turns into a
 * check for `COPY_FLASH_MS`, and the notice names the path copied.
 */
function CopyDeckIdButton({ store, material }: { store: DeckStore; material: string }) {
  const [copied, setCopied] = useState(false);
  const run = async () => {
    const dir = boot.deck?.dir;
    if (!dir) return;
    await copyText(dir);
    setCopied(true);
    store.notify(`Copied ${dir}`, "ok");
    setTimeout(() => setCopied(false), COPY_FLASH_MS);
  };
  return (
    <Tip label="Copy deck id" side="right">
      <Button size="corner" className={material} onClick={run} aria-label="Copy deck id">{copied ? <Check /> : <Copy />}</Button>
    </Tip>
  );
}

/** The rail's toggle, then the Home button to the deck list, then Copy deck id. */
export function RailToggles({ store, open, onToggle }: { store: DeckStore; open: boolean; onToggle: () => void }) {
  const material = open ? "corner-fill" : "glass";
  return (
    <div className="corner-row corner-left" data-chrome="rail-toggles">
      <Button size="corner" className={`${material} shadow-none`} onClick={onToggle} aria-label="Toggle slides" aria-expanded={open}><PanelLeft /></Button>
      <Tip label="All decks" side="right">
        <Button asChild size="corner" className={material} aria-label="All decks"><a href={at("")}><House /></a></Button>
      </Tip>
      <CopyDeckIdButton store={store} material={material} />
    </div>
  );
}

/**
 * The panel's toggle: outside the panel header's icon well, on its own, the
 * mirror of the rail toggle's standing directly on its pane.
 */
export function PanelToggle({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  return (
    <div className="corner-row corner-right-toggle" data-open={open} data-chrome="panel-toggle">
      <Button size="corner" className={`${open ? "corner-fill bg-raised" : "glass"} shadow-none`} onClick={onToggle} aria-label="Toggle panel" aria-expanded={open}><PanelRight /></Button>
    </div>
  );
}

/** How long the zoom chip stays after the last zoom change, before it fades. */
const ZOOM_LINGER_MS = 1500;

/**
 * The zoom chip: the zoom percentage, one gutter right of the mode switch, on
 * the switch's own centre line. Mounted only while zoomed (never at fit, with
 * no fade back to it); shown while zooming and for ZOOM_LINGER_MS after that,
 * or while the row is hovered, then fades out over 200ms.
 */
function ZoomChip({ zoom, hover }: { zoom: Zoom; hover: boolean }) {
  const [recent, setRecent] = useState(true);
  useEffect(() => {
    setRecent(true);
    const t = setTimeout(() => setRecent(false), ZOOM_LINGER_MS);
    return () => clearTimeout(t);
  }, [zoom.zoom]);
  const visible = recent || hover;
  const percent = Math.round(zoom.zoom * 100);
  return (
    <Tip label="Back to fit (0)" side="bottom">
      <Button
        size="sm"
        data-chrome="zoom"
        className={cn(
          "num glass ml-[var(--gutter)] h-[var(--corner-btn)] rounded-pane px-2 text-[12px] text-ink-muted transition-opacity duration-200 motion-reduce:transition-none hover:text-ink",
          visible ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={zoom.reset}
        aria-label={`Zoom ${percent}%, back to fit`}
      >
        {percent}%
      </Button>
    </Tip>
  );
}

/** Edit (text and comments) and View, with the zoom chip beside it once zoomed. */
export function ModePill({ store, state, railOpen, zoom }: { store: DeckStore; state: DeckState; railOpen: boolean; zoom: Zoom }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="mode-pill flex" data-chrome="mode" data-rail={railOpen ? "open" : "shut"} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <Segmented label="Mode" itemClassName="h-[var(--corner-hit)] rounded-chip px-3" value={state.mode} onChange={(mode) => store.set((s) => ({ ...s, mode }))} options={[
        { value: "edit", label: <><Pen /><span className="hidden md:inline">Edit</span></>, name: "Edit", title: "Type into text slots and comment on the slide" },
        { value: "view", label: <><Eye /><span className="hidden md:inline">View</span></>, name: "View", title: "Look without changing anything" },
      ]} />
      {zoom.zoom !== 1 ? <ZoomChip zoom={zoom} hover={hover} /> : null}
    </div>
  );
}
