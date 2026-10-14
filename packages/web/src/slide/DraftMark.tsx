/**
 * The draft look: a slot the user drew as a draft shows, in Edit and the rail,
 * at reduced opacity with a dashed outline and a small "Draft" tag over its
 * top-left corner (spec/slides/drafts.md). Elsewhere drafts are not drawn at
 * all; `draftShown` says where.
 */
import type { SlideEnv } from "./env";

const DRAFT_INK = "#5b5b5b";

/** Whether drafts are drawn in this view: Edit, the rail, and a shot or print asked for them. */
export function draftShown(env: SlideEnv): boolean {
  return env.mode === "edit" || env.mode === "thumb" || !!env.showDrafts;
}

/**
 * The outline, the tag and the dimming of one draft slot.
 *
 * @param props.scope - the layout element's own id, so the dimming reaches this slide's slot only.
 * @param props.box - the slot's box, pt.
 */
export function DraftMark({ scope, name, box }: { scope: string; name: string; box: number[] }) {
  const [x, y, w, h] = box as [number, number, number, number];
  return (
    <>
      <style>{`[data-layout-scope="${scope}"] > [data-slot="${CSS.escape(name)}"]{opacity:.6}`}</style>
      <div data-draft={name} aria-hidden style={{ position: "absolute", left: `${x}pt`, top: `${y}pt`, width: `${w}pt`, height: `${Math.max(0, h)}pt`, outline: `1px dashed ${DRAFT_INK}`, outlineOffset: "3pt", pointerEvents: "none" }}>
        <span style={{ position: "absolute", left: "-3pt", top: "-3pt", transform: "translateY(-100%)", font: "600 7pt/1.4 var(--font-sans, sans-serif)", letterSpacing: "0.04em", textTransform: "uppercase", color: "#fff", background: DRAFT_INK, padding: "0 3pt", borderRadius: "1.5pt" }}>Draft</span>
      </div>
    </>
  );
}
