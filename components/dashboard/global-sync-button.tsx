"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncAllCompanies } from "@/app/(app)/dashboard/actions";

/** Pipeline stages surfaced in the loading state, in execution order. */
const STAGES = [
  "Enriching company data…",
  "Updating competitive landscape…",
  "Verifying latest financials…",
  "Scanning events & market signals…",
  "Validating valuation timelines…",
  "Sanitizing source citations…",
];

/**
 * Triggers the global sync pipeline across the whole portfolio (enrichment,
 * competitor modernization, financial verification, events, timeline
 * validation, and source sanitization). The same pipeline runs weekly via cron.
 * Shows a live, staged progress indicator while running.
 */
export function GlobalSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);

  // While the sync is in flight, advance a smooth progress bar (capped below
  // 100% until the server responds) and cycle through the real pipeline stages.
  useEffect(() => {
    if (!pending) return;
    setProgress(6);
    setStage(0);
    const startedAt = Date.now();
    const id = setInterval(() => {
      setProgress((p) => Math.min(93, p + Math.random() * 4 + 1));
      setStage(Math.min(STAGES.length - 1, Math.floor((Date.now() - startedAt) / 2400)));
    }, 350);
    return () => clearInterval(id);
  }, [pending]);

  function sync() {
    setMsg(null);
    start(async () => {
      const r = await syncAllCompanies();
      if ("error" in r) {
        setMsg(r.error);
      } else {
        setMsg(
          `Synced ${r.enriched}/${r.companies} companies · +${r.competitorsAdded} competitors · ` +
            `${r.sanitized.rewritten} citations cleaned · ${r.timeline.stripped} timeline anomalies stripped · ` +
            `${r.signalsBlocked} wrong-entity signals blocked` +
            (r.status === "partial" ? " (partial)" : ""),
        );
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button onClick={sync} disabled={pending}>
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        {pending ? "Syncing…" : "Sync"}
      </Button>

      {pending && (
        <div className="w-72 rounded-lg border border-border bg-card p-3 shadow-sm">
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
              {STAGES[stage]}
            </span>
            <span className="text-[11px] tabular-nums text-muted-foreground">
              {Math.round(progress)}%
            </span>
          </div>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {!pending && msg && (
        <p className="max-w-xs text-right text-xs text-muted-foreground">{msg}</p>
      )}
    </div>
  );
}
