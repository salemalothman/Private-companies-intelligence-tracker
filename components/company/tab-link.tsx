"use client";

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Deep-link into a company tab group (and optionally a section within it)
 * from the bento cards. Writes the SAME shallow `history.replaceState` URL
 * update as UrlTabs — NEVER a <Link>/router navigation, which would remount
 * the route template and replay the page transition just to switch tabs.
 * UrlTabs reads the param via useSearchParams (Next syncs it with shallow
 * history updates); the section rail picks up `?section=` and scrolls.
 */
export function TabLink({
  tab,
  section,
  children,
  className,
}: {
  tab: string;
  section?: string;
  children: React.ReactNode;
  className?: string;
}) {
  function go() {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tab);
    if (section) params.set("section", section);
    else params.delete("section");
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?${params.toString()}`,
    );
  }

  return (
    <button
      type="button"
      onClick={go}
      className={cn(
        "group inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
      <ArrowRight
        aria-hidden="true"
        className="h-3 w-3 transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}
