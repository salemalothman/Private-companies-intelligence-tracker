"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { syncAllCompanies } from "@/app/(app)/dashboard/actions";

/**
 * Triggers the global sync pipeline across the whole portfolio (enrichment,
 * competitor modernization, financial verification, signal disambiguation, and
 * source-citation sanitization). The same pipeline runs weekly via cron.
 */
export function GlobalSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

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
    <div className="flex flex-col items-end gap-1">
      <Button onClick={sync} disabled={pending}>
        <RefreshCw className={cn("h-4 w-4", pending && "animate-spin")} />
        {pending ? "Syncing…" : "Sync"}
      </Button>
      {msg && (
        <p className="max-w-xs text-right text-xs text-muted-foreground">{msg}</p>
      )}
    </div>
  );
}
