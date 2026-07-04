"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { m } from "motion/react";
import { resolveCompanyTab } from "@/lib/company-tabs";
import { cn } from "@/lib/utils";

/**
 * Sticky in-page section rail with scroll-spy, for the long tab groups.
 *
 * - Renders INSIDE the group's TabsContent (inactive tabs are unmounted by
 *   Radix, so a page-level rail could never observe or scroll them).
 * - Scroll-spy via one IntersectionObserver over the [data-section] targets
 *   (band: 30% from the top), highlighting the active item with a brand text
 *   color + a spring-tracked hairline dot.
 * - Honors `?section=` (written by TabLink / legacy ?tab= aliases): scrolls
 *   the target into view on mount and whenever the param changes. Reading the
 *   param client-side keeps the page RSC non-dynamic.
 * - Anchor jumps use scrollIntoView smooth — the global reduced-motion CSS
 *   block collapses smooth scrolling for motion-sensitive users.
 */
export function SectionRail({
  sections,
}: {
  sections: { id: string; label: string }[];
}) {
  const [active, setActive] = useState<string | null>(sections[0]?.id ?? null);
  const searchParams = useSearchParams();
  // Resolve through the legacy map too: `?tab=valuation-targets` (a pre-grouping
  // deep link) carries no ?section=, but must still scroll to #targets.
  const { section } = resolveCompanyTab(
    searchParams.get("tab"),
    searchParams.get("section"),
  );

  // Deep-link scroll: on mount + on ?section= change. Deliberately stateless
  // and re-runnable — no "already scrolled" ref and no cancellation flag
  // beyond timer cleanup, because React's dev double-effect would otherwise
  // cancel run 1 and early-return run 2 (the ref survives the remount),
  // killing the scroll entirely. Each attempt is position-guarded instead:
  // it only scrolls while the target is clearly off (never fights the user),
  // and the late re-asserts cover charts mounting below shifting layout and
  // Next's initial scroll restoration resetting to top on hard loads.
  useEffect(() => {
    if (!section) return;
    const go = (behavior: ScrollBehavior) => {
      const el = document.getElementById(section);
      if (!el) return;
      if (Math.abs(el.getBoundingClientRect().top - 112) > 150) {
        el.scrollIntoView({ behavior, block: "start" });
      }
    };
    const raf = requestAnimationFrame(() => go("smooth"));
    const t1 = setTimeout(() => go("auto"), 450);
    const t2 = setTimeout(() => go("auto"), 1100);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [section]);

  // Scroll-spy.
  useEffect(() => {
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter((el): el is HTMLElement => el !== null);
    if (targets.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) setActive(e.target.id);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (const t of targets) observer.observe(t);
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav
      aria-label="Sections"
      className="sticky top-24 hidden w-40 shrink-0 self-start xl:block"
    >
      <ul className="space-y-1 border-l border-border">
        {sections.map((s) => (
          <li key={s.id} className="relative">
            {active === s.id && (
              <m.span
                layoutId="rail-dot"
                aria-hidden="true"
                className="absolute -left-px top-1/2 h-4 w-px -translate-y-1/2 bg-brand"
                transition={{ type: "spring", stiffness: 500, damping: 40 }}
              />
            )}
            <a
              href={`#${s.id}`}
              onClick={(e) => {
                e.preventDefault();
                document
                  .getElementById(s.id)
                  ?.scrollIntoView({ behavior: "smooth", block: "start" });
              }}
              className={cn(
                "block py-1 pl-4 text-xs transition-colors",
                active === s.id
                  ? "font-medium text-brand"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
