/**
 * The shape options: kind, the pack's shape style, fill (None is no paint),
 * stroke colour and width, dash, the heads of an arrow, and the text inside a
 * rectangle or ellipse. Colours are `ink`, the pack's named colours, or any
 * hex. Only the fields the kind takes are offered. The same controls set the
 * next shape drawn and edit a selected one; the caller decides which.
 */
import { Circle, Minus, MoveRight, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { shapeStyleNames, type Pack } from "@folio/core";
import { Input } from "../ui/field";
import { Segmented } from "../ui/segmented";
import { Select } from "../ui/select";
import { ShapeColor } from "./ShapeColors";
import { isLinear, type ShapeContent, type ShapeKind } from "./shapeModel";

export const DASHES = ["solid", "dash", "dot"] as const;
export const HEADS = ["none", "end", "start", "both"] as const;
const DASH_LABELS: Record<(typeof DASHES)[number], string> = { solid: "Solid", dash: "Dashed", dot: "Dotted" };
const HEAD_LABELS: Record<(typeof HEADS)[number], string> = { none: "None", end: "End", start: "Start", both: "Both" };

/** Each kind's key, as its tooltip names it. */
export const SHAPE_KEYS: Record<ShapeKind, string> = { rect: "S", ellipse: "O", line: "L", arrow: "Shift+L" };

const KIND_OPTIONS = [
  { value: "rect" as const, label: <Square />, name: "Rectangle", title: `Rectangle; Shift for a square (${SHAPE_KEYS.rect})` },
  { value: "ellipse" as const, label: <Circle />, name: "Ellipse", title: `Ellipse; Shift for a circle (${SHAPE_KEYS.ellipse})` },
  { value: "arrow" as const, label: <MoveRight />, name: "Arrow shape", title: `Arrow, drawn tail to head; Shift snaps to 45 degrees (${SHAPE_KEYS.arrow})` },
  { value: "line" as const, label: <Minus />, name: "Line", title: `Line; Shift snaps to 45 degrees (${SHAPE_KEYS.line})` },
];

/** A labelled row: the name at the left, the control at the right. */
export function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-[12px] text-ink-muted">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5">{children}</div>
    </div>
  );
}

/** A labelled line whose control takes the rest of the width: the swatch rows. */
export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-2">
      <span className="w-10 shrink-0 text-[12px] text-ink-muted">{label}</span>
      {children}
    </div>
  );
}

/** A one-line field that writes on Enter or when it loses focus. */
export function CommitField({ label, value, onCommit, type = "text", className, placeholder }: { label: string; value: string; onCommit: (v: string) => void; type?: string; className?: string; placeholder?: string }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const commit = () => draft !== value && onCommit(draft);
  return <Input aria-label={label} placeholder={placeholder} type={type} value={draft} className={className} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />;
}

/**
 * The controls.
 *
 * @param props.content - the shape (or the next shape) as it stands.
 * @param props.pack - the deck's pack, for its colours and shape styles.
 * @param props.onChange - one change; a field set to undefined is removed.
 * @param props.withText - offer the text inside a rectangle or ellipse.
 */
export function ShapeOptions({ content: c, pack, onChange, withText }: { content: ShapeContent; pack: Pack; onChange: (change: Partial<ShapeContent>) => void; withText: boolean }) {
  return (
    <div className="space-y-1.5">
      <Segmented<ShapeKind> label="Shape kind" className="w-full" itemClassName="h-[var(--corner-hit)] px-0" value={c.kind} onChange={(kind) => onChange({ kind })} options={KIND_OPTIONS} />
      <Row label="Style">
        <Select label="Shape style" all="Slot style" value={c.style ?? ""} options={shapeStyleNames(pack).map((n) => ({ value: n, label: n }))} onChange={(style) => onChange({ style: style || undefined })} />
      </Row>
      {isLinear(c.kind) ? null : (
        <Field label="Fill">
          <ShapeColor label="Fill" value={c.fill} palette={pack.colors} allowNone onPick={(fill) => onChange({ fill })} />
        </Field>
      )}
      <Field label="Stroke">
        <ShapeColor label="Stroke" value={c.stroke} palette={pack.colors} allowNone onPick={(stroke) => onChange({ stroke })} />
      </Field>
      <Row label="Width">
        <CommitField label="Stroke width in pt" placeholder="pt" type="number" className="num h-7 w-16 text-right text-[12px]" value={c.strokeWidth === undefined ? "" : String(c.strokeWidth)} onCommit={(v) => onChange({ strokeWidth: v === "" || !(Number(v) >= 0) ? undefined : Number(v) })} />
      </Row>
      <Segmented label="Dash" className="w-full" value={(c.dash as string) ?? "solid"} onChange={(dash) => onChange({ dash })} options={DASHES.map((d) => ({ value: d, label: DASH_LABELS[d] }))} />
      {c.kind === "arrow" ? <Segmented label="Heads" className="w-full" value={(c.heads as string) ?? "end"} onChange={(heads) => onChange({ heads })} options={HEADS.map((h) => ({ value: h, label: HEAD_LABELS[h] }))} /> : null}
      {withText && !isLinear(c.kind) ? (
        <Row label="Text">
          <CommitField label="Text in the shape" value={c.text ?? ""} className="h-7 w-40 text-[12px]" onCommit={(text) => onChange({ text: text || undefined })} />
        </Row>
      ) : null}
    </div>
  );
}
