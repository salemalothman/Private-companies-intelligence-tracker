"use client";

import { RefreshCw } from "lucide-react";
import { syncCompany } from "@/app/(app)/companies/actions";
import { TimedActionButton } from "@/components/company/timed-action-button";

export function SyncButton({ companyId }: { companyId: string }) {
  return (
    <TimedActionButton
      action={() => syncCompany(companyId)}
      kind="sync"
      variant="outline"
      idleIcon={RefreshCw}
      pendingIconClassName="animate-spin"
      doneIconClassName="text-success"
      idleLabel="Sync data"
      pendingLabel="Syncing…"
      doneLabel="Synced"
      title="Fetch funding rounds, valuations, news, and competitors"
    />
  );
}
