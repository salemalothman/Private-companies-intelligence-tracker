"use client";

import { m } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Interactive card feel within the flat aesthetic: a −2px hover lift and a
 * gentle press squeeze. Transform runs through motion (spring, interruptible);
 * the shadow runs through CSS (`hover:shadow-md transition-shadow`) — the
 * cheapest split, since animating box-shadow via JS repaints every frame.
 * Border color never changes (hairline discipline).
 */
export function PressCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <m.div
      className={cn(
        "transition-shadow duration-200 hover:shadow-md",
        className,
      )}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
    >
      {children}
    </m.div>
  );
}
