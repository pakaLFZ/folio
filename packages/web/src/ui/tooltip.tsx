/**
 * Tooltip: an opaque card in the chrome's type, after a short delay.
 */
import { Tooltip as T } from "radix-ui";
import type { ReactNode } from "react";

/**
 * Wrap a control with a tooltip.
 *
 * @param props.label - the tooltip text.
 * @param props.children - the control (must accept a ref).
 */
export function Tip({ label, children, side = "bottom" }: { label: ReactNode; children: ReactNode; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <T.Root delayDuration={350}>
      <T.Trigger asChild>{children}</T.Trigger>
      <T.Portal>
        <T.Content side={side} sideOffset={6} className="z-[30] max-w-72 rounded-card border border-line bg-surface px-2.5 py-1.5 text-[12px] leading-snug text-ink shadow-[var(--glass-lift)]">
          {label}
        </T.Content>
      </T.Portal>
    </T.Root>
  );
}

export const TipProvider = T.Provider;
