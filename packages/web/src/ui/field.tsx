/**
 * Text fields in the chrome's material: a hairline box at the control radius,
 * 13 px text, the ink border while focused. `Textarea` grows with its text.
 */
import type { ComponentProps } from "react";
import { cn } from "./cn";

const FIELD = "block w-full min-w-0 rounded-control border border-line bg-raised px-2.5 text-[13px] text-ink outline-none transition-colors duration-[120ms] placeholder:text-ink-faint hover:border-line-strong focus-visible:border-ink disabled:opacity-60 aria-[invalid=true]:border-danger/60";

/** A one-line input. */
export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cn(FIELD, "h-8", className)} {...props} />;
}

/** A paragraph input, three lines tall at rest, growing with its text. */
export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea rows={3} className={cn(FIELD, "field-sizing-content min-h-[68px] resize-none py-[7px] leading-[18px]", className)} {...props} />;
}
