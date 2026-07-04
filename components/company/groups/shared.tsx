import { cn } from "@/lib/utils";
import type { Sentiment } from "@/lib/types";

/**
 * Shared server-side bits for the company tab groups. All content here moved
 * verbatim from the old single-file page (behavior-preserving extraction).
 */

/**
 * A rail-addressable section inside a tab group: `id` + `data-section` are the
 * SectionRail scroll-spy contract; `scroll-mt-28` clears the condensed sticky
 * strip when a deep link or rail click scrolls the heading to the top.
 */
export function GroupSection({
  id,
  eyebrow,
  children,
}: {
  id: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} data-section aria-label={eyebrow ?? id} className="scroll-mt-28">
      {eyebrow && <div className="label-eyebrow mb-3">{eyebrow}</div>}
      {children}
    </section>
  );
}

export function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-lg font-semibold tabular-nums", accent)}>
        {value}
      </div>
    </div>
  );
}

export function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

export function sentimentVariant(
  s: Sentiment | null,
): "success" | "destructive" | "muted" {
  if (s === "positive") return "success";
  if (s === "negative") return "destructive";
  return "muted";
}
