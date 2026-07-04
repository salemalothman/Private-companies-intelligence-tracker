"use client";

import { Children } from "react";
import { m } from "motion/react";

/**
 * Staggered entrance for a set of sibling cards/items (fade + rise, first
 * in-view only). The stagger index is HARD-CAPPED so long lists never turn
 * into a slow cascade — items past `max` animate together with the last step.
 * Never use on tables or lists that can exceed ~20 items.
 */
export function StaggerList({
  children,
  className,
  itemClassName,
  stagger = 0.05,
  max = 12,
}: {
  children: React.ReactNode;
  className?: string;
  itemClassName?: string;
  stagger?: number;
  max?: number;
}) {
  return (
    <div className={className}>
      {Children.map(children, (child, i) => (
        <m.div
          className={itemClassName}
          initial={{ opacity: 0, y: 8 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{
            duration: 0.35,
            ease: [0.21, 0.47, 0.32, 0.98],
            delay: Math.min(i, max) * stagger,
          }}
        >
          {child}
        </m.div>
      ))}
    </div>
  );
}
