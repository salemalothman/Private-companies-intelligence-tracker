"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  Check,
  Handshake,
  TrendingUp,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { markEventsSeen } from "@/app/(app)/dashboard/actions";
import { AlertPrefsDialog } from "@/components/dashboard/alert-prefs-dialog";
import type { ActivityEvent, AlertPrefsView } from "@/lib/queries";

const ICON: Record<string, LucideIcon> = {
  funding_round: Banknote,
  valuation: TrendingUp,
  contract_win: Handshake,
  competitor: Users,
};

export function ActivityFeed({
  events,
  unseen,
  prefs,
}: {
  events: ActivityEvent[];
  unseen: number;
  prefs: AlertPrefsView;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-medium">Portfolio activity</CardTitle>
          {unseen > 0 && <Badge variant="default">{unseen} new</Badge>}
        </div>
        <div className="flex items-center gap-1">
          {unseen > 0 && (
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => start(() => markEventsSeen().then(() => router.refresh()))}
            >
              <Check className="h-3.5 w-3.5" /> Mark all read
            </Button>
          )}
          <AlertPrefsDialog prefs={prefs} />
        </div>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No activity yet — funding rounds, valuation moves, contract wins, and
            new competitors will appear here as data refreshes.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {events.map((e) => {
              const Icon = ICON[e.type] ?? TrendingUp;
              return (
                <li key={e.id}>
                  <button
                    onClick={() => router.push(`/companies/${e.company_id}`)}
                    className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-muted/40"
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                        e.seen ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5">
                        {!e.seen && (
                          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                        )}
                        <span className="truncate text-sm">
                          {e.company && (
                            <span className="font-medium">{e.company} · </span>
                          )}
                          {e.title}
                        </span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                        {e.detail && <span>{e.detail}</span>}
                        <span>
                          {e.source ? `${e.source} · ` : ""}
                          {formatDate(e.occurred_at ?? e.created_at)}
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
