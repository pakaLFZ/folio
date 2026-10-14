/**
 * Select: the chrome's one way to pick a value from a list. A pill names the
 * current value and opens a small glass menu; the empty value means "all"
 * and sits apart at the top. Counts, when given, are mono and right-aligned.
 */
import { Check, ChevronDown } from "lucide-react";
import { DropdownMenu as M } from "radix-ui";
import { cn } from "./cn";

export interface SelectOption {
  value: string;
  label: string;
  count?: number;
}

/**
 * A pill select.
 *
 * @param props.label - the control's name, read before the value.
 * @param props.all - the label of the empty value.
 * @param props.value - the current value; empty means all.
 * @param props.options - the choices, each with an optional count.
 * @param props.allCount - the count shown beside the empty value.
 * @param props.onChange - called with the new value.
 */
export function Select({ label, all, value, options, allCount, onChange }: { label: string; all: string; value: string; options: SelectOption[]; allCount?: number; onChange: (v: string) => void }) {
  const current = value ? (options.find((o) => o.value === value)?.label ?? value) : all;
  return (
    <M.Root>
      <M.Trigger
        aria-label={`${label}: ${current}`}
        className={cn("inline-flex h-8 max-w-56 items-center gap-1.5 rounded-control border bg-raised pl-3 pr-2.5 text-[12px] text-ink transition-colors duration-[120ms] hover:bg-whisper data-[state=open]:bg-whisper", value ? "border-line-strong" : "border-line")}
      >
        <span className="truncate">{current}</span>
        <ChevronDown aria-hidden className="size-3.5 shrink-0 text-ink-faint transition-transform duration-[120ms] in-data-[state=open]:rotate-180 motion-reduce:transition-none" />
      </M.Trigger>
      <M.Portal>
        <M.Content
          align="end"
          sideOffset={6}
          collisionPadding={12}
          className="glass z-[30] max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))] min-w-[max(12rem,var(--radix-dropdown-menu-trigger-width))] origin-(--radix-dropdown-menu-content-transform-origin) overflow-y-auto rounded-menu p-1.5 transition-[opacity,scale] duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] starting:scale-[0.97] starting:opacity-0 motion-reduce:transition-none"
        >
          <M.RadioGroup value={value} onValueChange={onChange}>
            <Row value="" label={all} count={allCount} />
            {options.length ? <M.Separator className="mx-2.5 my-1.5 h-px bg-line-soft" /> : null}
            {options.map((o) => <Row key={o.value} {...o} />)}
          </M.RadioGroup>
        </M.Content>
      </M.Portal>
    </M.Root>
  );
}

/** One choice: a check slot, the label and its count. */
function Row({ value, label, count }: SelectOption) {
  return (
    <M.RadioItem value={value} textValue={label} className="flex h-8 cursor-default select-none items-center gap-2 rounded-control pl-2 pr-2.5 text-[13px] text-ink outline-none data-[highlighted]:bg-whisper">
      <span className="flex size-4 shrink-0 items-center justify-center">
        <M.ItemIndicator><Check aria-hidden className="size-3.5" /></M.ItemIndicator>
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count !== undefined ? <span className="num shrink-0 pl-3 text-[11px] text-ink-faint">{count}</span> : null}
    </M.RadioItem>
  );
}
