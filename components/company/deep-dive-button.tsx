"use client";

import { Sparkles } from "lucide-react";
import { runDeepDiveAction } from "@/app/(app)/companies/actions";
import { TimedActionButton } from "@/components/company/timed-action-button";

/**
 * "Run deep-dive" header trigger — a distinct control, SEPARATE from Sync.
 *
 * Delegates all timing/progress scaffolding to {@link TimedActionButton}: while
 * pending it steps the label through "Gathering context…" → "Analysing…" so the
 * single long Grok pass reads as staged rather than a frozen spinner. The status
 * text is exposed via `role="status"` + `aria-live="polite"` for assistive tech.
 * On success it `router.refresh()`es so the revalidated server render surfaces
 * the new analysis; a re-run overwrites the stored row (agent upsert).
 *
 * Lucide icons render inside client components only — the Sparkles component is
 * passed to another client component, never across the server→client boundary.
 */

const STAGES = ["Gathering context…", "Analysing…"] as const;

export function DeepDiveButton({ companyId }: { companyId: string }) {
  return (
    <TimedActionButton
      action={() => runDeepDiveAction(companyId)}
      kind="deep-dive"
      variant="mono"
      idleIcon={Sparkles}
      pendingIconClassName="animate-pulse"
      idleLabel="Run deep-dive"
      pendingLabel={STAGES}
      doneLabel="Generated"
      title="Generate a grounded deep-dive analysis for this company"
    />
  );
}
