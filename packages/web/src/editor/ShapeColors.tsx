/**
 * A shape colour: `ink` (the slide background's ink), the pack's named
 * colours as swatches, and a well for any hex. A named colour is written by
 * its name, so a change of the pack's palette reaches the shape; the well
 * writes a hex once its picker closes. `none` (no paint) is offered where the
 * caller allows it.
 */
import { INK } from "@folio/core";
import { useEffect, useRef } from "react";
import { cn } from "../ui/cn";
import { Tip } from "../ui/tooltip";

const INK_SWATCH = "#111111";
const HEX = /^#[0-9a-fA-F]{6}$/;

/** One square swatch; pressed when it is the shape's colour. */
function Swatch({ name, fill, pressed, onPick, label }: { name: string; fill: string; pressed: boolean; onPick: () => void; label: string }) {
  return (
    <Tip label={label}>
      <button type="button" aria-label={label} aria-pressed={pressed} data-color={name} onClick={onPick} className={cn("size-5 shrink-0 rounded-chip border border-line p-[2px] transition-colors duration-[120ms] hover:border-line-strong", pressed && "border-ink")}>
        <span className="block size-full rounded-[2px]" style={{ background: fill }} />
      </button>
    </Tip>
  );
}

/** The well for any hex, writing once its picker closes rather than on every drag through it. */
function HexWell({ label, value, onCommit }: { label: string; value: string; onCommit: (v: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const latest = useRef(onCommit);
  latest.current = onCommit;
  useEffect(() => {
    const el = ref.current;
    const on = () => el && latest.current(el.value);
    el?.addEventListener("change", on);
    return () => el?.removeEventListener("change", on);
  }, []);
  return <input ref={ref} type="color" aria-label={label} title={label} defaultValue={value} key={value} className="h-5 w-7 shrink-0 cursor-pointer rounded-chip border border-line bg-raised p-px" />;
}

/**
 * The picker.
 *
 * @param props.value - the shape's colour as written (a hex, `ink`, a pack name, null for none), undefined when its style decides.
 * @param props.palette - the pack's `colors`.
 * @param props.allowNone - offer None (no paint).
 */
export function ShapeColor({ label, value, palette, allowNone, onPick }: { label: string; value: string | null | undefined; palette: Record<string, string>; allowNone?: boolean; onPick: (v: string | null) => void }) {
  const hex = value && HEX.test(value) ? value : value && palette[value] && HEX.test(palette[value]) ? palette[value] : "#000000";
  const custom = !!value && HEX.test(value);
  return (
    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" role="group" aria-label={label}>
      {allowNone ? (
        <button type="button" aria-pressed={value === null} onClick={() => onPick(null)} className={cn("h-5 shrink-0 rounded-chip border border-line px-1.5 text-[11px] leading-none text-ink-muted transition-colors duration-[120ms] hover:text-ink", value === null && "border-ink text-ink")}>
          None
        </button>
      ) : null}
      <Swatch name={INK} fill={INK_SWATCH} pressed={value === INK} label={`${label}: ink, the background's ink`} onPick={() => onPick(INK)} />
      {Object.entries(palette).map(([name, fill]) => <Swatch key={name} name={name} fill={fill} pressed={value === name} label={`${label}: ${name}`} onPick={() => onPick(name)} />)}
      <span className={cn("rounded-chip", custom && "outline outline-1 outline-ink")}>
        <HexWell label={`${label}: any colour`} value={hex} onCommit={onPick} />
      </span>
    </div>
  );
}
