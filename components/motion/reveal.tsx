"use client";

import { m } from "motion/react";

/**
 * Scroll-triggered entrance: fade + small rise the first time the element
 * scrolls into view. A client leaf that wraps server-rendered children — never
 * convert the content itself to a client component.
 *
 * Rules of use:
 * - BELOW-FOLD content only. Above-fold content is already animated by the
 *   route template; double-animating the fold reads as jank.
 * - Never wrap large tables (they must render instantly).
 * - `once: true` — reveals never re-trigger on scroll-up (content that
 *   disappears on re-scroll erodes trust in a data product).
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 8,
}: {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  y?: number;
}) {
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.4, ease: [0.21, 0.47, 0.32, 0.98], delay }}
    >
      {children}
    </m.div>
  );
}
