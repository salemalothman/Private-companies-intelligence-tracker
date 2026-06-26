import { businessModelMix, type RevenueSegment } from "@/lib/business-model";
import type { Company } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Monochrome ink ramp — premium, flat, on-brand for the breakdown. */
const SEGMENT_COLOR: Record<RevenueSegment["key"], string> = {
  enterprise: "bg-foreground",
  government: "bg-foreground/70",
  services: "bg-foreground/45",
  consumer: "bg-foreground/25",
};

/**
 * Estimated revenue distribution across the four core business-model segments,
 * derived from the company profile. Renders a stacked allocation bar plus a
 * labelled breakdown list.
 */
export function BusinessModelAnalysis({
  company,
}: {
  company: Pick<Company, "name" | "sector" | "description">;
}) {
  const mix = businessModelMix(company);
  const visible = mix.filter((m) => m.pct > 0);

  return (
    <div className="border-t border-border pt-5">
      <h3 className="text-sm font-medium">Business Model Analysis</h3>
      <p className="mt-0.5 text-xs text-muted-foreground">
        Estimated revenue distribution inferred from {company.name}&rsquo;s
        profile.
      </p>

      {/* Stacked allocation bar */}
      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {visible.map((m) => (
          <div
            key={m.key}
            className={cn("h-full", SEGMENT_COLOR[m.key])}
            style={{ width: `${m.pct}%` }}
            title={`${m.label}: ${m.pct}%`}
          />
        ))}
      </div>

      {/* Breakdown list */}
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {mix.map((m) => (
          <li key={m.key} className="flex items-center gap-2.5">
            <span
              className={cn(
                "h-2.5 w-2.5 shrink-0 rounded-[3px]",
                SEGMENT_COLOR[m.key],
              )}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {m.label}
            </span>
            <span className="text-sm font-semibold tabular-nums">{m.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
