"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles } from "lucide-react";
import { runDeepDiveAction } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Run deep-dive" header trigger — a distinct control, SEPARATE from Sync.
 *
 * Mirrors `SyncButton`'s `useTransition` staged-progress pattern (FND-04): while
 * pending it steps the label through "Gathering context…" → "Analysing…" so the
 * single long Grok pass reads as staged rather than a frozen spinner. The status
 * text is exposed via `role="progressbar"` + `aria-live="polite"` for assistive
 * tech. On success it `router.refresh()`es so the revalidated server render
 * surfaces the new analysis; a re-run overwrites the stored row (agent upsert).
 *
 * Lucide icons render here inside this client component only — none are passed as
 * props across the server→client boundary (forwardRef can't cross it).
 */

const STAGES = ["Gathering context…", "Analysing…"] as const;

export function DeepDiveButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState(0);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Advance the staged label while the action runs; reset when it settles.
  useEffect(() => {
    if (!pending) {
      setStage(0);
      return;
    }
    const t = setTimeout(() => setStage((s) => Math.min(s + 1, STAGES.length - 1)), 1200);
    return () => clearTimeout(t);
  }, [pending, stage]);

  useEffect(
    () => () => {
      if (doneTimer.current) clearTimeout(doneTimer.current);
    },
    [],
  );

  function run() {
    setError(null);
    setDone(false);
    start(async () => {
      const res = await runDeepDiveAction(companyId);
      if (res.error) {
        setError(res.error);
      } else {
        setDone(true);
        router.refresh();
        doneTimer.current = setTimeout(() => setDone(false), 2000);
      }
    });
  }

  const label = pending ? STAGES[stage] : done ? "Generated" : "Run deep-dive";

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        onClick={run}
        disabled={pending}
        title="Generate a grounded deep-dive analysis for this company"
      >
        {done ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Sparkles className={cn("h-3.5 w-3.5", pending && "animate-pulse")} />
        )}
        <span
          role="progressbar"
          aria-live="polite"
          aria-busy={pending}
          aria-label={pending ? label : undefined}
        >
          {label}
        </span>
      </Button>
    </div>
  );
}
