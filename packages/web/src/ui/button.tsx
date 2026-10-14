/**
 * Button and IconButton, Shadcn's shape in the cavitas material: every control
 * is a pill; `solid` is filled ink and reserved for the action that leaves a
 * file behind; the rest are ghost or a hairline outline.
 */
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "./cn";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-[13px] font-medium transition-colors duration-[120ms] ease-[cubic-bezier(0.16,1,0.3,1)] disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        ghost: "text-ink hover:bg-whisper",
        outline: "border border-line text-ink hover:bg-whisper",
        solid: "bg-ink text-on-ink hover:bg-ink-strong-hover",
        danger: "border border-line text-danger hover:bg-whisper",
      },
      size: { sm: "h-7 px-3", md: "h-8 px-4", icon: "size-8", iconSm: "size-7", corner: "size-[var(--corner-hit)] rounded-chip" },
    },
    defaultVariants: { variant: "ghost", size: "md" },
  },
);

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { asChild?: boolean };

/**
 * A pill button.
 *
 * @param props.variant - ghost (default), outline, solid or danger.
 * @param props.size - sm, md, icon, iconSm, or corner (the size a pane toggle floats at).
 * @param props.asChild - render the child element with the button's classes.
 */
export function Button({ className, variant, size, asChild, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
