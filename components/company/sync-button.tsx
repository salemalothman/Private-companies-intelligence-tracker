"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, RefreshCw } from "lucide-react";
import { syncCompany } from "@/app/(app)/companies/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function SyncButton({ companyId }: { companyId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    start(async () => {
      const res = await syncCompany(companyId);
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
      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}
      <Button
        size="sm"
        variant="outline"
        onClick={run}
        disabled={pending}
        title="Fetch funding rounds, valuations, news, and competitors"
      >
        {done ? (
          <Check className="h-3.5 w-3.5 text-success" />
        ) : (
          <RefreshCw className={cn("h-3.5 w-3.5", pending && "animate-spin")} />
        )}
        {pending ? "Syncing…" : done ? "Synced" : "Sync data"}
      </Button>
    </div>
  );
}
