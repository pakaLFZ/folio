/**
 * A slide drawn at a given scale: json-render's Renderer over the pack's
 * registry, inside a fixed pt canvas that is scaled as one piece, so line breaks
 * never depend on the zoom.
 */
import { JSONUIProvider, Renderer } from "@json-render/react";
import { memo, useEffect, useMemo, useRef, type ReactNode, type RefObject } from "react";
import type { SlideSpec } from "@folio/core";
import { SlideEnvContext, type SlideEnv } from "./env";
import { PX_PER_PT } from "./measure";
import { registryOf } from "./registry";
import { RenderBoundary } from "./RenderBoundary";

/**
 * Never let the browser start its own drag from a slide: every `<img>` and
 * `<a>` under `root` (a background, a decoration, a figure, an attachment
 * link) loses its native `draggable` the moment it appears, so a press on it
 * only ever reaches the comment layer or a tool's own move. A
 * `MutationObserver` catches figures and hook output that mount after the
 * first paint; `.folio-slide img, .folio-slide a { -webkit-user-drag: none }`
 * (global.css) covers the first frame before the effect runs. An ancestor
 * outside this subtree (the rail thumbnail's own `<button draggable>`) is
 * untouched, so its own drag still works.
 */
function useNoNativeDrag(root: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const disarm = () => el.querySelectorAll("img, a").forEach((n) => ((n as HTMLElement).draggable = false));
    disarm();
    const mo = new MutationObserver(disarm);
    mo.observe(el, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [root]);
}

/**
 * Render a slide.
 *
 * @param props.spec - the slide spec, or null when the file is unreadable.
 * @param props.env - pack, mode and callbacks.
 * @param props.scale - CSS scale of the 1 pt = 4/3 px canvas.
 * @param props.overlay - drawn over the slide in canvas coordinates (pins,
 *   region marks), scaled with it.
 * @param props.error - shown instead of the slide when `spec` is null.
 */
export const SlideView = memo(function SlideView({ spec, env, scale, overlay, error }: { spec: SlideSpec | null; env: SlideEnv; scale: number; overlay?: ReactNode; error?: string | null }) {
  const { w, h } = env.pack.canvas;
  const registry = useMemo(() => registryOf(env.pack), [env.pack]);
  const root = useRef<HTMLDivElement>(null);
  useNoNativeDrag(root);
  return (
    <div style={{ width: w * PX_PER_PT * scale, height: h * PX_PER_PT * scale, position: "relative", flex: "none" }}>
      <div ref={root} className="folio-slide" data-slide={env.slideId} style={{ width: `${w}pt`, height: `${h}pt`, transform: `scale(${scale})` }}>
        <SlideEnvContext.Provider value={scale === env.scale ? env : { ...env, scale }}>
          {spec ? (
            <RenderBoundary resetKey={spec}>
              <JSONUIProvider registry={registry}>
                <Renderer spec={spec as never} registry={registry} />
              </JSONUIProvider>
            </RenderBoundary>
          ) : (
            <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#fff", color: "var(--color-danger)", font: "12pt var(--font-mono)", padding: "40pt", textAlign: "center" }}>
              {error ?? "slide not loaded"}
            </div>
          )}
          {overlay}
        </SlideEnvContext.Provider>
      </div>
    </div>
  );
});
