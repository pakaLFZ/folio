/**
 * Tabs: a row of pills in a sunken well, the cavitas Segmented shape.
 */
import { Tabs as TabsPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "./cn";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

/** The well holding the tab triggers. */
export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex gap-0.5 rounded-control bg-sunken p-0.5", className)} {...props} />;
}

/** One tab: quiet until selected, then a raised pill. */
export function TabsTrigger({ className, ...props }: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "flex h-7 flex-1 items-center justify-center gap-1 rounded-chip px-2.5 text-[12px] text-ink-muted transition-colors duration-[120ms] hover:text-ink data-[state=active]:bg-raised data-[state=active]:text-ink data-[state=active]:shadow-[var(--control-shadow)] [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}
