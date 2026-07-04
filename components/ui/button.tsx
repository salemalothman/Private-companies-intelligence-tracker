import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  // Explicit transition properties (never transition-all) + a subtle press
  // scale for tactile feedback — interruptible CSS transitions, and the
  // global prefers-reduced-motion block collapses both for motion-sensitive
  // users. 0.97 stays within the craft bar's "never below 0.95".
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform,filter] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        // The ONE designated-primary action per surface (deep-dive, add
        // company) — brand blue, not ink, so it reads as the screen's live
        // wire. Premium treatment: a subtle top→bottom gradient for depth, a
        // brand-tinted soft shadow that deepens on hover, and a gentle
        // brightness lift — never a flat fill, never a glow. --primary stays
        // ink; this is not a repaint.
        brand:
          "bg-gradient-to-b from-brand to-brand-deep text-brand-foreground shadow-sm shadow-brand/35 hover:shadow-md hover:shadow-brand/30 hover:brightness-[1.06] active:brightness-95",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        // Taller tap targets on mobile (touch), denser on desktop (pointer).
        // sm is 40px on touch — density belongs to cursors, not thumbs
        // (Apple HIG 44pt / ux-guidelines 44px; 40px + gap is the floor).
        default: "h-10 px-4 py-2 sm:h-9",
        sm: "h-10 rounded-md px-3 text-xs sm:h-8",
        lg: "h-11 rounded-md px-8 sm:h-10",
        icon: "h-10 w-10 sm:h-9 sm:w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
