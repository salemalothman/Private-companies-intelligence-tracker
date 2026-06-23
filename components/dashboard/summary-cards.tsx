import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { cn, formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import type { PortfolioSummary, ValuationChange } from "@/lib/metrics";

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
      sub: null as string | null,
      accent: "text-foreground",
    },
    {
      label: "Invested Capital",
      value: formatCurrency(summary.totalInvested),
      sub: null,
      accent: "text-foreground",
    },
    {
      label: gainPositive ? "Unrealized Gain" : "Unrealized Loss",
      value: `${gainPositive ? "+" : ""}${formatCurrency(summary.unrealizedGain)}`,
      sub: formatPercent(summary.totalReturnPct, { signed: true }),
      accent: gainPositive ? "text-success" : "text-destructive",
    },
    {
      label: "Companies",
      value: String(summary.companyCount),
      sub: `${summary.activeCount} active`,
      accent: "text-foreground",
    },
  ];

  return (
    <div className="space-y-5">
      {/* KPI strip — flat, hairline-divided, data-forward */}
      <div className="grid grid-cols-2 divide-x divide-y divide-border overflow-hidden rounded-xl border border-border lg:grid-cols-4 lg:divide-y-0">
        {stats.map((s) => (
          <div key={s.label} className="px-5 py-5 lg:px-6">
            <div className="label-eyebrow">{s.label}</div>
            <div
              className={cn(
                "mt-2.5 text-[1.7rem] font-semibold leading-none tabular-nums tracking-tight",
                s.accent,
              )}
            >
              {s.value}
            </div>
            <div className="mt-2 h-4 text-xs text-muted-foreground tabular-nums">
              {s.sub ?? ""}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <ListPanel title="Latest valuation changes">
          {changes.length === 0 ? (
            <Empty>No changes yet.</Empty>
          ) : (
            changes.map((c) => {
              const up = c.changePct >= 0;
              return (
                <Link
                  key={c.id}
                  href={`/companies/${c.id}`}
                  className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-baseline gap-2">
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
              );
            })
          )}
        </ListPanel>

        <ListPanel title="Upcoming events">
          {events.length === 0 ? (
            <Empty>Recent activity will appear here.</Empty>
          ) : (
            events.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between px-5 py-3 text-sm"
              >
                <span className="font-medium">{e.name}</span>
                <span className="text-muted-foreground tabular-nums">
                  {e.label} · {formatDate(e.date)}
                </span>
              </div>
            ))
          )}
        </ListPanel>
      </div>
    </div>
  );
}

function ListPanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <div className="label-eyebrow border-b border-border px-5 py-3">
        {title}
      </div>
      <div className="divide-y divide-border/70">{children}</div>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-4 text-sm text-muted-foreground">{children}</p>
  );
}
