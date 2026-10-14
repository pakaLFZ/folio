/**
 * A layout instance: background variant, decorations, then every slot at its
 * box. This is the one component every json-render element type maps to.
 * Slots that sit `below` another are placed from the measured reach of the
 * slot above, so their boxes follow it on every render.
 */
import { useCallback, useId, useMemo, useState } from "react";
import { backgroundOf, flowBoxes, followedSlots, fontFamilyOf, linePitch, requestedBackground, resolveAliases, slideLayout, textSlots, type Box, type Pack, type ResolvedLayout, type ResolvedTextSlot } from "@folio/core";
import { at } from "../boot";
import { imageLoading, useSlideEnv } from "./env";
import { DraftMark, draftShown } from "./DraftMark";
import { BlockSlot } from "./BlockSlot";
import { FigureSlot } from "./FigureSlot";
import { ShapeSlot } from "./ShapeSlot";
import { TableSlot } from "./TableSlot";
import { TextSlot } from "./TextSlot";

/**
 * Render one layout with its slot contents.
 *
 * @param props.layout - the layout name (the element type).
 * @param props.props - slot contents, `background` and `overrides`; the
 *   slide's overrides are laid over the layout before anything is drawn or measured.
 */
export function LayoutView({ layout: layoutName, props: given }: { layout: string; props: Record<string, unknown> }) {
  const env = useSlideEnv();
  const layout = useMemo(() => slideLayout(env.pack, layoutName, given), [env.pack, layoutName, given]);
  const background = useMemo(() => requestedBackground(env.pack, layoutName, given), [env.pack, layoutName, given]);
  return layout ? <LayoutBody layout={layout} background={background} props={resolveAliases(given, layout.aliases)} /> : <UnknownLayout name={layoutName} />;
}

/** The slide of a known layout. */
function LayoutBody({ layout, background, props }: { layout: ResolvedLayout; background: string | null; props: Record<string, unknown> }) {
  const env = useSlideEnv();
  const pack = env.pack;
  const bg = backgroundOf(pack, layout, background);
  const texts = useMemo(() => new Map(textSlots(pack, layout).map((t) => [t.name, t])), [pack, layout]);
  const followed = useMemo(() => followedSlots(layout), [layout]);
  const [reach, setReach] = useState<Record<string, number>>({});
  const onReach = useCallback((name: string, pt: number) => setReach((r) => (r[name] !== undefined && Math.abs(r[name] - pt) < 0.05 ? r : { ...r, [name]: pt })), []);
  const boxes = flowBoxes(layout, reach);
  const scope = useId();
  const drafts = draftShown(env);
  return (
    <div data-folio-layout="" data-layout-scope={scope} style={{ position: "absolute", inset: 0, background: bg.fill, color: bg.ink }}>
      {bg.image ? <img src={at(`packs/${pack.name}/${bg.image}`)} alt="" loading={imageLoading(env.mode)} decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} /> : null}
      <Decorations pack={pack} layout={layout} background={bg.name} ink={bg.ink} loading={imageLoading(env.mode)} />
      {Object.entries(layout.slots).map(([name, slot]) => {
        if (slot.draft && !drafts) return null;
        const drawn = slotView(name, slot, props[name], boxes[name]!, texts.get(name), bg.ink, followed.has(name) ? (pt: number) => onReach(name, pt) : undefined);
        return slot.draft ? [drawn, <DraftMark key={`${name}:draft`} scope={scope} name={name} box={boxes[name]!} />] : drawn;
      })}
    </div>
  );
}

/** One slot as its role draws it. */
function slotView(name: string, slot: ResolvedLayout["slots"][string], value: unknown, box: Box, text: ResolvedTextSlot | undefined, ink: string, report?: (pt: number) => void) {
  if (text) return <TextSlot key={name} text={text} box={box} value={typeof value === "string" ? value : null} ink={ink} onReach={report} />;
  if (slot.role === "shape") return <ShapeSlot key={name} name={name} slot={slot} box={box} value={value ?? null} ink={ink} />;
  if (slot.role === "block") return <BlockSlot key={name} name={name} slot={slot} box={box} value={value ?? null} ink={ink} onReach={report} />;
  if (slot.role === "table") return <TableSlot key={name} name={name} slot={slot} box={box} value={value ?? null} ink={ink} onReach={report} />;
  return slot.role === "figure" ? <FigureSlot key={name} name={name} slot={slot} box={box} value={value ?? null} /> : null;
}

/** The layout's decorations shown on this background variant. */
function Decorations({ pack, layout, background, ink, loading }: { pack: Pack; layout: ResolvedLayout; background: string; ink: string; loading: "eager" | "lazy" }) {
  return layout.decorations
    .filter((d) => !d.backgrounds || d.backgrounds.includes(background))
    .map((d, i) => {
      const [x, y, w, h] = d.box;
      const box = { position: "absolute" as const, left: `${x}pt`, top: `${y}pt`, width: `${w}pt`, height: `${h}pt` };
      if (d.image) return <img key={i} src={at(`packs/${pack.name}/${d.image}`)} alt="" loading={loading} decoding="async" style={{ ...box, objectFit: "contain" }} />;
      const style = d.style ? pack.roles[d.style] : undefined;
      return style ? (
        <div key={i} style={{ ...box, fontFamily: fontFamilyOf(pack, style), fontSize: `${style.size}pt`, fontWeight: style.weight, lineHeight: `${linePitch(style)}pt`, color: style.color ?? ink, whiteSpace: "pre" }}>
          {d.text}
        </div>
      ) : null;
    });
}

/** Shown in place of a slide whose layout the pack does not have. */
function UnknownLayout({ name }: { name: string }) {
  return (
    <div data-folio-layout="" style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", background: "#fff", color: "var(--color-danger)", font: "14pt var(--font-mono)" }}>
      layout {name} is not in this pack
    </div>
  );
}
