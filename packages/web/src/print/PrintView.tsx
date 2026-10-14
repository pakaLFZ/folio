/**
 * The print view, `/<deck8>/?print=1`: every slide at 1:1 on its own page, in
 * the same renderer and fonts as the live view. `folio check` reads the line
 * measurements it publishes; `folio pdf` prints it.
 *
 * With `&comment=<cid>` it draws that comment's sketch for its screenshots,
 * never the selection border: corner ticks alone locate the region.
 *
 * When everything is laid out it sets `window.__FOLIO_READY__ = true` and
 * `window.__FOLIO_MEASURE__ = {slideId: {rev, slots: MeasuredSlot[], renderError?}}`;
 * `renderError` says why a slide threw or drew no layout (FOLIO-RND-001).
 * Until then `window.__FOLIO_PENDING__()` names what it is still waiting for.
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import type { FolioComment, MeasuredSlot, Pack, SlideMeasurement } from "@folio/core";
import { api, call } from "../api";
import { MarksLayer, RegionCorners } from "../comments/marks";
import { boot, type SlideRecord } from "../boot";
import type { SlideEnv } from "../slide/env";
import { installPackFonts } from "../slide/fonts";
import { SlideView } from "../slide/SlideView";
import { deckFileUrl, limitsOf, staticFigure, type FigureResolver } from "../editor/slideEnv";
import { pendingItems } from "./pending";

declare global {
  interface Window {
    __FOLIO_READY__?: boolean;
    __FOLIO_MEASURE__?: Record<string, SlideMeasurement>;
    __FOLIO_ERROR__?: string;
  }
}

/**
 * Load every slide named in the URL (all by default).
 *
 * @returns the slide records in deck order, or null while loading.
 */
function useAllSlides(): SlideRecord[] | null {
  const [slides, setSlides] = useState<SlideRecord[] | null>(null);
  useEffect(() => {
    const only = new URLSearchParams(location.search).get("slides")?.split(",");
    const ids = boot.deck!.slides.map((s) => s.id).filter((id) => !only || only.includes(id));
    Promise.all(ids.map((id) => api.slide(boot.deck!.token, id))).then(setSlides, (e: Error) => (window.__FOLIO_ERROR__ = e.message));
  }, []);
  return slides;
}

/**
 * The comment a screenshot is taken for (`&comment=<cid>`).
 *
 * @returns the comment, null when none is named, undefined while loading.
 */
function useShotComment(): FolioComment | null | undefined {
  const cid = new URLSearchParams(location.search).get("comment");
  const [comment, setComment] = useState<FolioComment | null | undefined>(cid ? undefined : null);
  useEffect(() => {
    if (cid) void call<FolioComment>(`${boot.deck!.token}/comments/${cid}`).then(setComment, () => setComment(null));
  }, [cid]);
  return comment;
}

/**
 * Publish readiness once fonts, slides, hook states and the comment are in and
 * every image has loaded; the measurements are read from `measured` then.
 *
 * @returns true once the fonts have loaded and the slides may be drawn.
 */
function usePrintReady(pack: Pack, slides: SlideRecord[] | null, figure: FigureResolver | null, comment: FolioComment | null | undefined, measured: RefObject<Record<string, Record<string, MeasuredSlot>>>, failed: RefObject<Record<string, string>>): boolean {
  const [fonts, setFonts] = useState(false);
  useEffect(() => void installPackFonts(pack).then(() => setFonts(true)), [pack]);
  useEffect(() => {
    if (!slides || !fonts || !figure || comment === undefined) return;
    requestAnimationFrame(() =>
      requestAnimationFrame(async () => {
        await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => ((img.onload = r), (img.onerror = r))))));
        await tablesLoaded();
        window.__FOLIO_MEASURE__ = Object.fromEntries(slides.map((s) => [s.id, measurementOf(s, measured.current[s.id] ?? {}, failed.current[s.id])]));
        window.__FOLIO_READY__ = true;
      }),
    );
  }, [slides, fonts, figure, comment, measured, failed]);
  return fonts;
}

/**
 * One slide's published measurement, with why it did not render: the error
 * it threw, or a slide whose root element exists but drew no layout.
 */
function measurementOf(s: SlideRecord, slots: Record<string, MeasuredSlot>, thrown: string | undefined): SlideMeasurement {
  const drawn = !s.spec?.elements[s.spec.root] || !!document.querySelector(`section[data-slide="${s.id}"] [data-folio-layout]`);
  const renderError = thrown ?? (drawn ? undefined : "the renderer drew nothing for this slide");
  return { rev: s.rev, slots: Object.values(slots), complete: true, ...(renderError ? { renderError } : {}) };
}

/** Resolve once no table is still reading its `.table.json` file (at most 10 s), and two frames have painted. */
async function tablesLoaded(): Promise<void> {
  const end = performance.now() + 10000;
  while (document.querySelector("[data-folio-loading]") && performance.now() < end) await new Promise((r) => setTimeout(r, 50));
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
}

/**
 * The page.
 *
 * @param props.figure - resolves figure slots, including hooked ones.
 */
export function PrintView({ figure }: { figure: FigureResolver | null }) {
  const pack = boot.pack!;
  const showDrafts = new URLSearchParams(location.search).get("drafts") === "1";
  const slides = useAllSlides();
  const comment = useShotComment();
  const measured = useRef<Record<string, Record<string, MeasuredSlot>>>({});
  const failed = useRef<Record<string, string>>({});
  const fonts = usePrintReady(pack, slides, figure, comment, measured, failed);
  useEffect(() => void (window.__FOLIO_PENDING__ = () => pendingItems({ "the slide files": !!slides, "the pack fonts": fonts, "the hook states": !!figure, "the comment": comment !== undefined })), [slides, fonts, figure, comment]);
  const resolve = useMemo<FigureResolver>(() => figure ?? ((_id, _slot, value) => staticFigure(boot.deck!.token, value)), [figure]);
  if (!slides || !fonts || !figure || comment === undefined) return null;
  return (
    <div className="folio-print">
      <style>{`@page{size:${pack.canvas.w}pt ${pack.canvas.h}pt;margin:0}html,body{overflow:visible;background:#fff}.folio-print-page{break-after:page;width:${pack.canvas.w}pt;height:${pack.canvas.h}pt;overflow:hidden}`}</style>
      {slides.map((s) => {
        const layout = s.spec ? (s.spec.elements[s.spec.root]?.type ?? null) : null;
        const env: SlideEnv = {
          pack,
          slideId: s.id,
          mode: "print",
          showDrafts,
          overflow: {},
          limits: limitsOf(pack, layout, s.spec?.elements[s.spec.root]?.props),
          selectedSlot: null,
          figure: (slot, value) => resolve(s.id, slot, value),
          fileUrl: (path) => deckFileUrl(boot.deck!.token, path),
          onSlotMeasured: (m) => void ((measured.current[s.id] ??= {})[m.slot] = m),
          onRenderError: (message) => void (failed.current[s.id] ??= message),
        };
        return (
          <section key={s.id} className="folio-print-page" data-slide={s.id}>
            <SlideView spec={s.spec} error={s.error} scale={1} env={env} overlay={comment && comment.slide === s.id ? <ShotOverlay canvas={pack.canvas} comment={comment} /> : undefined} />
          </section>
        );
      })}
    </div>
  );
}

/** A comment as its screenshots show it: the sketch and the region's corner ticks, no selection rectangle or tint. */
function ShotOverlay({ canvas, comment }: { canvas: { w: number; h: number }; comment: FolioComment }) {
  return (
    <>
      <RegionCorners canvas={canvas} region={comment.region} />
      <MarksLayer canvas={canvas} region={null} marks={comment.marks} />
    </>
  );
}
