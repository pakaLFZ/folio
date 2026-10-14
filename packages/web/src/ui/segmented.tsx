/**
 * Segmented: one to four exclusive choices as pills in a sunken well.
 */
import { ToggleGroup } from "radix-ui";
import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A segmented control.
 *
 * @param props.value - the selected value.
 * @param props.options - value, label, an optional title, and the accessible name when the label can hide its text.
 * @param props.onChange - called with the new value.
 */
export function Segmented<T extends string>({ value, options, onChange, className, itemClassName, label }: { value: T; options: { value: T; label: ReactNode; title?: string; name?: string }[]; onChange: (v: T) => void; className?: string; itemClassName?: string; label: string }) {
  return (
    <ToggleGroup.Root
      type="single"
      aria-label={label}
      value={value}
      onValueChange={(v) => v && onChange(v as T)}
      className={cn("flex gap-0.5 rounded-control bg-sunken p-0.5", className)}
    >
      {options.map((o) => (
        <ToggleGroup.Item
          key={o.value}
          value={o.value}
          title={o.title}
          aria-label={o.name}
          className={cn("flex h-7 min-w-0 flex-1 items-center justify-center gap-1 rounded-chip px-2.5 text-[12px] text-ink-muted transition-colors duration-[120ms] hover:text-ink data-[state=on]:bg-raised data-[state=on]:text-ink data-[state=on]:shadow-[var(--control-shadow)] [&_svg]:size-4 [&_svg]:shrink-0", itemClassName)}
        >
          {o.label}
        </ToggleGroup.Item>
      ))}
    </ToggleGroup.Root>
  );
}
