/**
 * Radio groups and checkboxes (radix) in the chrome's material: a 16 px
 * hairline mark that fills with ink when chosen, beside a 13 px label; the
 * whole row is the target.
 */
import { Check } from "lucide-react";
import { Checkbox as CheckboxPrimitive, RadioGroup as RadioPrimitive } from "radix-ui";
import { useId, type ComponentProps, type ReactNode } from "react";
import { cn } from "./cn";

const ROW = "flex min-h-8 cursor-pointer items-center gap-2.5 rounded-control px-2 text-[13px] text-ink transition-colors duration-[120ms] hover:bg-whisper has-[:disabled]:cursor-default has-[:disabled]:hover:bg-transparent";
const MARK = "flex size-4 shrink-0 items-center justify-center border border-line-strong bg-raised transition-colors duration-[120ms] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus data-[state=checked]:border-ink data-[state=checked]:bg-ink disabled:opacity-60";

export const RadioGroup = ({ className, ...props }: ComponentProps<typeof RadioPrimitive.Root>) => <RadioPrimitive.Root className={cn("flex flex-col", className)} {...props} />;

/** One radio choice with its label. */
export function RadioItem({ value, children, disabled }: { value: string; children: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={ROW}>
      <RadioPrimitive.Item id={id} value={value} disabled={disabled} className={cn(MARK, "rounded-full")}>
        <RadioPrimitive.Indicator className="size-1.5 rounded-full bg-on-ink" />
      </RadioPrimitive.Item>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}

/** A checkbox with its label. */
export function CheckItem({ checked, onChange, children, disabled }: { checked: boolean; onChange: (on: boolean) => void; children: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={ROW}>
      <CheckboxPrimitive.Root id={id} checked={checked} disabled={disabled} onCheckedChange={(v) => onChange(v === true)} className={cn(MARK, "rounded-chip")}>
        <CheckboxPrimitive.Indicator className="text-on-ink [&_svg]:size-3"><Check strokeWidth={3} /></CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
      <span className="min-w-0 flex-1">{children}</span>
    </label>
  );
}
