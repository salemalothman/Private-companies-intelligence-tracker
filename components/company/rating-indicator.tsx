import type { Rating1to10 } from "@/lib/agents/deep-dive-types";
import { cn } from "@/lib/utils";

/**
 * A flat, monochrome 1–10 rating indicator matching the "Premium Minimal Flat"
 * design system: a `label-eyebrow` caption, the numeric value in `tabular-nums`
 * with a `/10` denominator, and a 10-segment hairline bar filled with the
 * `bg-foreground` ink ramp (filled = `bg-foreground`, empty = `bg-muted`),
 * mirroring the monochrome aesthetic of `BusinessModelAnalysis`.
 *
 * Presentational only — NO hooks and NO lucide-icon props — so it is safe to
 * render from a Server Component (this is why `overview-sections.tsx` can stay
 * a Server Component). Do NOT add "use client".
 *
 * A null/absent `value` renders an em-dash and NO bar: a missing rating is shown
 * as "no rating", never fabricated to a filled score.
 */
export function RatingIndicator({
  label,
  value,
  className,
}: {
  label: string;
  value: Rating1to10 | null | undefined;
  className?: string;
}) {
  const hasValue = value != null;
  const filled = hasValue ? Math.max(0, Math.min(10, value)) : 0;

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="label-eyebrow">{label}</span>
        <span className="text-sm font-semibold tabular-nums">
          {hasValue ? (
            <>
              {value}
              <span className="text-muted-foreground">/10</span>
            </>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </span>
      </div>
      {hasValue && (
        <div
          className="flex items-center gap-0.5"
          role="img"
          aria-label={`${label}: ${value} out of 10`}
        >
          {Array.from({ length: 10 }, (_, i) => (
            <span
              key={i}
              aria-hidden="true"
              className={cn(
                "h-1.5 flex-1 rounded-[1px] border border-border",
                i < filled ? "bg-foreground" : "bg-muted",
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}
