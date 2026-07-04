"use client";

import { useEffect, useRef, useState } from "react";
import { animate, useInView, useReducedMotion } from "motion/react";
import { cn, formatCurrency, formatMultiple, formatPercent } from "@/lib/utils";

/**
 * Format keys resolved to the shared lib/utils formatters CLIENT-SIDE — a
 * function prop can't cross the RSC boundary, so server callers pass the raw
 * number + a key and the exact same formatter the server used renders the
 * final string (parity is unit-tested).
 */
const FORMATTERS = {
  currency: (n: number) => formatCurrency(n),
  percent: (n: number) => formatPercent(n),
  signedPercent: (n: number) => formatPercent(n, { signed: true }),
  multiple: (n: number) => formatMultiple(n),
  count: (n: number) => String(Math.round(n)),
} as const;

export type AnimatedNumberFormat = keyof typeof FORMATTERS;

/**
 * A financial figure that counts up from 0 the first time it scrolls into
 * view — and NEVER lies at rest:
 *
 * - SSR/initial render is the FINAL formatted string (no hydration flash, no
 *   CLS, and crawlers/reduced-motion users simply see the real value).
 * - The count-up runs once, in-view only, writing text imperatively so React
 *   isn't re-rendered per frame; on completion the exact final string is
 *   restored.
 * - `tabular-nums` + a `ch`-reserved min-width keep layout rock-still while
 *   digits change width.
 * - `useReducedMotion` → static value, no animation.
 */
export function AnimatedNumber({
  value,
  format,
  className,
  duration = 0.8,
}: {
  value: number;
  format: AnimatedNumberFormat;
  className?: string;
  duration?: number;
}) {
  const fmt = FORMATTERS[format];
  const finalText = fmt(value);
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const reduced = useReducedMotion();
  const [played, setPlayed] = useState(false);

  useEffect(() => {
    if (!inView || played || reduced || value === 0) return;
    const el = ref.current;
    if (!el) return;
    setPlayed(true);
    const controls = animate(0, value, {
      duration,
      ease: "circOut",
      onUpdate: (v) => {
        el.textContent = fmt(v);
      },
      onComplete: () => {
        // Exact parity with the server-rendered string — never a rounded echo.
        el.textContent = finalText;
      },
    });
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView, played, reduced, value]);

  return (
    <span
      ref={ref}
      className={cn("inline-block tabular-nums", className)}
      style={{ minWidth: `${finalText.length}ch` }}
    >
      {finalText}
    </span>
  );
}
