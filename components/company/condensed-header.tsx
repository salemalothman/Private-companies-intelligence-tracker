"use client";

import { useEffect, useRef, useState } from "react";
import { m, useScroll } from "motion/react";
import { cn } from "@/lib/utils";

/**
 * Condensing header for the company page: the full header + stat cards stay
 * static in flow (zero layout thrash); this renders (a) a zero-height sentinel
 * placed in flow where it's mounted (just below the stat cards) and (b) a
 * separate fixed compact strip that fades/slides in once the sentinel scrolls
 * off. 200ms opacity/translate CSS transition only — no per-frame scroll JS.
 *
 * Desktop-only (`hidden md:flex`): on phones the sticky MobileTopBar already
 * owns the top edge; stacking two chrome bars there is clutter.
 *
 * Stats arrive as server-formatted strings with accents as string unions —
 * functions/LucideIcons can't cross the RSC boundary.
 */
export function CondensedHeader({
  name,
  logoUrl,
  stats,
}: {
  name: string;
  logoUrl: string | null;
  stats: {
    label: string;
    value: string;
    accent?: "brand" | "success" | "destructive";
  }[];
}) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  // Page scroll progress for the brand hairline — a motion value driving
  // scaleX directly (transform-only, no React re-render per frame).
  const { scrollYProgress } = useScroll();

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => setShown(!entry.isIntersecting),
      { rootMargin: "-8px 0px 0px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinelRef} aria-hidden="true" className="h-0" />
      <div
        aria-hidden={!shown}
        className={cn(
          "fixed inset-x-0 top-0 z-30 hidden h-12 items-center gap-4 border-b border-border bg-background/90 px-4 backdrop-blur transition-[opacity,transform] duration-200 md:flex lg:left-60 lg:px-6",
          shown
            ? "translate-y-0 opacity-100"
            : "pointer-events-none -translate-y-2 opacity-0",
        )}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={logoUrl}
            alt=""
            className="h-7 w-7 rounded-md border border-border object-cover"
          />
        ) : (
          <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-card text-xs font-bold text-primary">
            {name.charAt(0)}
          </span>
        )}
        <span className="text-sm font-semibold">{name}</span>
        {/* Reading-progress hairline along the strip's bottom edge. */}
        <m.span
          aria-hidden="true"
          className="bg-gradient-brand absolute inset-x-0 bottom-0 h-0.5 origin-left"
          style={{ scaleX: scrollYProgress }}
        />
        <div className="ml-auto flex items-center gap-6">
          {stats.map((s) => (
            <span key={s.label} className="flex items-baseline gap-1.5">
              <span className="label-eyebrow">{s.label}</span>
              <span
                className={cn(
                  "text-sm font-semibold tabular-nums",
                  s.accent === "brand" && "text-brand",
                  s.accent === "success" && "text-success",
                  s.accent === "destructive" && "text-destructive",
                )}
              >
                {s.value}
              </span>
            </span>
          ))}
        </div>
      </div>
    </>
  );
}
