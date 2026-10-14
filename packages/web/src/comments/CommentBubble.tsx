/**
 * The new-comment input: the shared input bar alone, attached beside the
 * region it is about, with no card, head line, close button or pointer. It
 * follows the slide as the window and panels change; below 900 px it docks to
 * the foot of the window. Esc discards the draft. A press anywhere else
 * leaves it: an empty draft is discarded, one with text or files is sent. It
 * passes `floating` so the bar itself takes the `--glass-lift` shadow and
 * reads as lifted above the slide; the Comments tab and thread reply bars
 * stay flat.
 */
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { marksBounds, type Box, type Pack } from "@folio/core";
import type { DeckState } from "../editor/deckState";
import { cn } from "../ui/cn";
import { placeBubble, type Placement, type Rect } from "./bubblePlace";
import { Composer } from "./Composer";
import type { CommentsModel, DraftState } from "./useComments";

const BUBBLE_WIDTH = 320;
const DOCK_BELOW_PX = 900;
const EDGE = 12;
const TOP_ROW = 60;
const STAYS_WITH_DRAFT = '[data-sketch-input], [data-chrome="sketch-toolbar"], [data-chrome="zoom"], [data-pan-hand]';
const ON_THE_SLIDE = "[&_p]:w-fit [&_p]:rounded-chip [&_p]:border [&_p]:border-line [&_p]:bg-raised [&_p]:py-0.5";

/** The anchor box on screen, from the slide's drawn rectangle. */
function onScreen(anchor: Box, canvas: Pack["canvas"]): Rect | null {
  const slide = document.querySelector("main .folio-slide");
  if (!slide) return null;
  const r = slide.getBoundingClientRect();
  const k = r.width / canvas.w;
  return { left: r.left + anchor[0] * k, top: r.top + anchor[1] * k, right: r.left + (anchor[0] + anchor[2]) * k, bottom: r.top + (anchor[1] + anchor[3]) * k };
}

/** The scene left free by the rail, the panel, the top row and the sketch toolbar. */
function freeScene(): Rect {
  const rail = document.querySelector('nav[aria-label="Slides"]')?.getBoundingClientRect();
  const panel = document.querySelector('aside[aria-label="Deck panel"]')?.getBoundingClientRect();
  const tools = document.querySelector('[aria-label="Sketch tool"]')?.getBoundingClientRect();
  return { left: rail ? rail.right + EDGE : EDGE, top: TOP_ROW, right: (panel ? panel.left : innerWidth) - EDGE, bottom: (tools ? tools.top : innerHeight) - EDGE };
}

/** True below the docking width. */
function useDocked(): boolean {
  const [docked, setDocked] = useState(() => innerWidth < DOCK_BELOW_PX);
  useEffect(() => {
    const on = () => setDocked(innerWidth < DOCK_BELOW_PX);
    addEventListener("resize", on);
    return () => removeEventListener("resize", on);
  }, []);
  return docked;
}

/**
 * Keep the bubble beside its anchor through resizes, scrolls and zoom.
 *
 * @returns the placement, or null while docked or not yet measured.
 */
function usePlacement(ref: RefObject<HTMLElement | null>, anchor: Box, canvas: Pack["canvas"], docked: boolean): Placement | null {
  const [place, setPlace] = useState<Placement | null>(null);
  const key = anchor.join(",");
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || docked) return setPlace(null);
    const update = () => {
      const sel = onScreen(anchor, canvas);
      const viewport = { left: EDGE, top: EDGE, right: innerWidth - EDGE, bottom: innerHeight - EDGE };
      if (sel) setPlace(placeBubble(sel, { w: el.offsetWidth, h: el.offsetHeight }, [freeScene(), viewport]));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    const slide = document.querySelector("main .folio-slide")?.parentElement;
    if (slide) ro.observe(slide);
    addEventListener("resize", update);
    addEventListener("scroll", update, true);
    return () => (ro.disconnect(), removeEventListener("resize", update), removeEventListener("scroll", update, true));
  }, [key, canvas, docked]);
  return place;
}

/** Esc anywhere discards the draft while the bubble is open. */
function useEscape(discard: () => void): void {
  const latest = useRef(discard);
  latest.current = discard;
  useEffect(() => {
    const on = (e: KeyboardEvent) => e.key === "Escape" && !e.defaultPrevented && latest.current();
    addEventListener("keydown", on);
    return () => removeEventListener("keydown", on);
  }, []);
}

/**
 * Call `leave` on a primary press outside the bar that does not continue the
 * draft: the slide (a new region or mark), the sketch toolbar, the zoom chip
 * and a Shift or middle-button pan all stay.
 */
function useClickAway(ref: RefObject<HTMLElement | null>, leave: (target: Element) => void): void {
  const latest = useRef(leave);
  latest.current = leave;
  useEffect(() => {
    const on = (e: PointerEvent) => {
      const target = e.target;
      if (e.button !== 0 || e.shiftKey || !(target instanceof Element) || ref.current?.contains(target) || target.closest(STAYS_WITH_DRAFT)) return;
      latest.current(target);
    };
    addEventListener("pointerdown", on, true);
    return () => removeEventListener("pointerdown", on, true);
  }, [ref]);
}

/**
 * The bubble, shown in Edit while this slide has a draft.
 *
 * @param props.model - the comments model; the draft is its draft.
 */
export function CommentBubble({ model, state, pack }: { model: CommentsModel; state: DeckState; pack: Pack }) {
  const draft = state.mode === "edit" && model.draft?.slide === state.current ? model.draft : null;
  const anchor = draft ? (draft.region ?? marksBounds(draft.marks)) : null;
  const composing = model.tool === "region" || (model.tool === "cursor" && (!!draft?.marks.length || !!draft?.region || !!draft?.text || !!draft?.uploads.length));
  if (!draft || !composing || (!anchor && !draft.text && !draft.uploads.length)) return null;
  return <Bubble model={model} draft={draft} anchor={anchor ?? [pack.canvas.w, 0, 0, 0]} canvas={pack.canvas} />;
}

/** The bar itself; takes focus whenever its selection changes. */
function Bubble({ model, draft, anchor, canvas }: { model: CommentsModel; draft: DraftState; anchor: Box; canvas: Pack["canvas"] }) {
  const ref = useRef<HTMLElement>(null);
  const docked = useDocked();
  const place = usePlacement(ref, anchor, canvas, docked);
  const focusKey = `${draft.id}:${anchor.join(",")}:${draft.marks.length}`;
  useLayoutEffect(() => ref.current?.querySelector<HTMLElement>("textarea, input:not([type=file])")?.focus({ preventScroll: true }), [focusKey]);
  const leaving = useRef(false);
  useEscape(() => void model.discardDraft());
  useClickAway(ref, () => {
    if (leaving.current) return;
    leaving.current = true;
    const kept = !!draft.text.trim() || draft.uploads.length > 0;
    void (kept ? model.send() : model.discardDraft()).finally(() => (leaving.current = false));
  });
  return (
    <section
      ref={ref}
      role="dialog"
      aria-label="New comment"
      className={cn("fixed z-[26]", ON_THE_SLIDE, docked && "inset-x-3 bottom-3", !docked && !place && "opacity-0")}
      style={docked ? undefined : { left: place?.x ?? 0, top: place?.y ?? 0, width: BUBBLE_WIDTH }}
    >
      <Composer
        text={draft.text}
        onText={(t) => model.editDraft((x) => ({ ...x, text: t }))}
        uploads={draft.uploads}
        onUploads={(u) => model.editDraft((x) => ({ ...x, uploads: u }))}
        upload={model.upload}
        uploadUrl={model.uploadUrl}
        onSend={() => void model.send()}
        sendLabel="Send"
        placeholder="What should change here?"
        floating
      />
    </section>
  );
}
