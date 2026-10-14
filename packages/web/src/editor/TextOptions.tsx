/**
 * The text box options: font size (pt), font, bold and italic, text colour,
 * alignment, background, border (colour, width, dash) and padding. Fonts are
 * the families the pack ships and those its roles name; colours are `ink`,
 * the pack's named colours or any hex. The same controls set the next box
 * drawn and edit a selected one; the caller decides which.
 */
import { Bold, Italic, TextAlignCenter, TextAlignEnd, TextAlignJustify, TextAlignStart } from "lucide-react";
import type { Pack, TextStyle } from "@folio/core";
import { cn } from "../ui/cn";
import { Segmented } from "../ui/segmented";
import { Select } from "../ui/select";
import { Tip } from "../ui/tooltip";
import { ShapeColor } from "./ShapeColors";
import { CommitField, DASHES, Field, Row } from "./ShapeOptions";
import { fontFamilies, type TextLook } from "./textBoxModel";

const ALIGNS: { value: TextStyle["align"]; label: React.ReactNode; name: string }[] = [
  { value: "left", label: <TextAlignStart />, name: "Align left" },
  { value: "center", label: <TextAlignCenter />, name: "Align centre" },
  { value: "right", label: <TextAlignEnd />, name: "Align right" },
  { value: "justify", label: <TextAlignJustify />, name: "Justify" },
];
const DASH_LABELS: Record<(typeof DASHES)[number], string> = { solid: "Solid", dash: "Dashed", dot: "Dotted" };

/** A pressed-or-not icon button, in the segmented control's chip. */
function Toggle({ label, on, onClick, children }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} aria-pressed={on} onClick={onClick} className={cn("flex size-7 items-center justify-center rounded-chip text-ink-muted transition-colors duration-[120ms] hover:text-ink [&_svg]:size-4", on && "bg-raised text-ink shadow-[var(--control-shadow)]")}>
        {children}
      </button>
    </Tip>
  );
}

const pt = (v: string) => (v === "" || !(Number(v) >= 0) ? undefined : Number(v));

/**
 * The controls.
 *
 * @param props.look - the box's look (or the next box's), as written.
 * @param props.base - the role style the box starts from, for the placeholders.
 * @param props.onChange - one change; a field set to undefined is removed.
 */
export function TextOptions({ look, base, pack, onChange }: { look: TextLook; base: TextStyle | undefined; pack: Pack; onChange: (change: Partial<TextLook>) => void }) {
  const border = look.border ?? null;
  return (
    <div className="space-y-1.5">
      <Row label="Font">
        <Select label="Font" all="Role font" value={look.font ?? ""} options={fontFamilies(pack).map((f) => ({ value: f, label: f }))} onChange={(font) => onChange({ font: font || undefined })} />
      </Row>
      <Row label="Size">
        <CommitField label="Font size in pt" placeholder={base ? String(base.size) : "pt"} type="number" className="num h-7 w-16 text-right text-[12px]" value={look.size === undefined ? "" : String(look.size)} onCommit={(v) => onChange({ size: pt(v) || undefined })} />
        <div className="flex gap-0.5 rounded-control bg-sunken p-0.5">
          <Toggle label="Bold" on={(look.weight ?? base?.weight ?? 400) >= 600} onClick={() => onChange({ weight: (look.weight ?? base?.weight ?? 400) >= 600 ? 400 : 700 })}><Bold /></Toggle>
          <Toggle label="Italic" on={look.italic ?? base?.italic ?? false} onClick={() => onChange({ italic: !(look.italic ?? base?.italic ?? false) })}><Italic /></Toggle>
        </div>
      </Row>
      <Field label="Colour">
        <ShapeColor label="Text colour" value={look.color} palette={pack.colors} onPick={(color) => onChange({ color: color ?? undefined })} />
      </Field>
      <Segmented<TextStyle["align"]> label="Alignment" className="w-full" itemClassName="h-7 px-0" value={look.align ?? base?.align ?? "left"} onChange={(align) => onChange({ align })} options={ALIGNS} />
      <Field label="Fill">
        <ShapeColor label="Background" value={look.fill} palette={pack.colors} allowNone onPick={(fill) => onChange({ fill })} />
      </Field>
      <Field label="Border">
        <ShapeColor label="Border" value={border ? border.color : look.border === null ? null : undefined} palette={pack.colors} allowNone onPick={(color) => onChange({ border: color === null ? null : { color, width: border?.width ?? 1, dash: border?.dash ?? "solid" } })} />
      </Field>
      {border ? (
        <>
          <Row label="Width">
            <CommitField label="Border width in pt" type="number" className="num h-7 w-16 text-right text-[12px]" value={String(border.width)} onCommit={(v) => onChange({ border: { ...border, width: pt(v) ?? 1 } })} />
          </Row>
          <Segmented label="Border dash" className="w-full" value={border.dash} onChange={(dash) => onChange({ border: { ...border, dash } })} options={DASHES.map((d) => ({ value: d, label: DASH_LABELS[d] }))} />
        </>
      ) : null}
      <Row label="Padding">
        <CommitField label="Padding in pt" placeholder="0" type="number" className="num h-7 w-16 text-right text-[12px]" value={look.padding === undefined ? "" : String(look.padding)} onCommit={(v) => onChange({ padding: pt(v) })} />
      </Row>
    </div>
  );
}
