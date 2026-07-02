"use client";

import * as React from "react";
import { Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Shared honesty-labelling primitives for generated deep-dive content (FND-05/06).
 *
 * `ConfidenceChip` renders a quiet Fact/Estimate badge plus a Low/Med/High
 * confidence indicator, built on the existing `Badge`, matching the "Premium
 * Minimal Flat" design system (hairline, reduced-opacity tints, no saturated
 * brand default). It accepts the exact `basis`/`confidence` literals from
 * `LabelledField` in lib/agents/deep-dive-types.ts (`"med"`, not `"medium"`).
 *
 * `DeepDiveEmpty` is the compact "Run deep-dive" empty state shown in enriched
 * areas before the first generation, with an optional `action` slot so the
 * trigger button (Plan 04) can be dropped in.
 *
 * The label/variant/level mappings are extracted as exported pure helpers so
 * they can be unit-tested under the repo's node-only Vitest env (which cannot
 * render React).
 */

export type Basis = "fact" | "estimate";
export type Confidence = "low" | "med" | "high";

/** Human-facing label for a basis literal. */
export function basisLabel(basis: Basis): string {
  return basis === "fact" ? "Fact" : "Estimate";
}

/**
 * Badge variant per basis. Fact reads slightly more affirmed (`success` tint at
 * low opacity); Estimate stays `muted` — both quiet per the design system.
 */
export function basisVariant(basis: Basis): "success" | "muted" {
  return basis === "fact" ? "success" : "muted";
}

/** Human-facing label for a confidence level. */
export function confidenceLabel(confidence: Confidence): string {
  return confidence === "low" ? "Low" : confidence === "med" ? "Med" : "High";
}

/** Number of filled steps (out of 3) for a confidence level's dot indicator. */
export function confidenceSteps(confidence: Confidence): number {
  return confidence === "low" ? 1 : confidence === "med" ? 2 : 3;
}

const CONFIDENCE_LEVELS: Confidence[] = ["low", "med", "high"];

/**
 * A quiet Fact/Estimate + Low/Med/High chip. Presentational only — no hooks and
 * no lucide-icon props — so it is safe to use from Server Components.
 */
export function ConfidenceChip({
  basis,
  confidence,
  className,
}: {
  basis: Basis;
  confidence: Confidence;
  className?: string;
}) {
  const filled = confidenceSteps(confidence);
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <Badge variant={basisVariant(basis)}>{basisLabel(basis)}</Badge>
      <span
        className="inline-flex items-center gap-1"
        role="img"
        aria-label={`Confidence: ${confidenceLabel(confidence)}`}
        title={`Confidence: ${confidenceLabel(confidence)}`}
      >
        <span className="flex items-center gap-0.5" aria-hidden="true">
          {CONFIDENCE_LEVELS.map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-1.5 w-1.5 rounded-full border border-border",
                i < filled ? "bg-foreground/70" : "bg-transparent",
              )}
            />
          ))}
        </span>
        <span className="label-eyebrow">{confidenceLabel(confidence)}</span>
      </span>
    </span>
  );
}

/**
 * Compact empty state for enriched areas before the first deep-dive run.
 * `action` is an optional slot for the trigger button (Plan 04).
 */
export function DeepDiveEmpty({
  message = "Run deep-dive to generate this analysis.",
  action,
  className,
}: {
  message?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-6 py-8 text-center",
        className,
      )}
    >
      <Sparkles className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  );
}
