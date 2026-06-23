import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  CalendarClock,
  DollarSign,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn, formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import type {
  PortfolioSummary,
  ValuationChange,
} from "@/lib/metrics";

interface UpcomingEvent {
  id: string;
  name: string;
  label: string;
  date: string | null;
}

export function SummaryCards({
  summary,
  changes,
  events,
}: {
  summary: PortfolioSummary;
  changes: ValuationChange[];
  events: UpcomingEvent[];
}) {
  const gainPositive = summary.unrealizedGain >= 0;

  const stats = [
    {
      label: "Portfolio Value",
      value: formatCurrency(summary.portfolioValue),
      icon: DollarSign,
      accent: "text-primary",
    },
    {
      label: "Invested Capital",
      value: formatCurrency(summary.totalInvested),
      icon: Wallet,
      accent: "text-muted-foreground",
    },
    {
      label: gainPositive ? "Unrealized Gain" : "Unrealized Loss",
      value: `${gainPositive ? "+" : ""}${formatCurrency(summary.unrealizedGain)}`,
      sub: formatPercent(summary.totalReturnPct, { signed: true }),
      icon: TrendingUp,
      accent: gainPositive ? "text-success" : "text-destructive",
    },
    {
      label: "Companies",
      value: String(summary.companyCount),
      sub: `${summary.activeCount} active`,
      icon: Building2,
      accent: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{s.label}</span>
                <s.icon className={cn("h-4 w-4", s.accent)} />
              </div>
              <div
                className={cn(
                  "mt-2 text-2xl font-bold tabular-nums tracking-tight",
                  s.accent,
                )}
              >
                {s.value}
              </div>
              {s.sub && (
                <div className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {s.sub}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 text-sm font-medium">Latest valuation changes</h3>
            {changes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No changes yet.</p>
            ) : (
              <ul className="space-y-2">
                {changes.map((c) => {
                  const up = c.changePct >= 0;
                  return (
                    <li key={c.id}>
                      <Link
                        href={`/companies/${c.id}`}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                      >
                        <span className="flex items-center gap-2">
                          <span className="font-medium">{c.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(c.date)}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "flex items-center gap-1 tabular-nums",
                            up ? "text-success" : "text-destructive",
                          )}
                        >
                          {up ? (
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          ) : (
                            <ArrowDownRight className="h-3.5 w-3.5" />
                          )}
                          {formatPercent(c.changePct, { signed: true })}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-medium">
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
              Upcoming events
            </h3>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No upcoming events. Recent activity will appear here.
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((e) => (
                  <li
                    key={e.id}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="font-medium">{e.name}</span>
                    <span className="text-muted-foreground">
                      {e.label} · {formatDate(e.date)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
