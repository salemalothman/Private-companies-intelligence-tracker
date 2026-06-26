"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Radar } from "lucide-react";
import { refreshCompetitors } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function RefreshCompetitorsButton({
  companyId,
  hasData,
}: {
  companyId: string;
  hasData: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const res = await refreshCompetitors(companyId);
      if (res.error) {
        setError(res.error);
      } else {
        setDone(true);
        router.refresh();
        setTimeout(() => setDone(false), 2000);
      }
    });
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button
        size="sm"
        variant="outline"
        onClick={run}
        disabled={pending}
        title="Find competitors and their latest valuations via Grok + SEC"
      >
        {done ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <Radar className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
        )}
        {pending
          ? "Scanning…"
          : done
            ? "Updated"
            : hasData
              ? "Refresh"
              : "Find competitors"}
      </Button>
    </div>
  );
}
