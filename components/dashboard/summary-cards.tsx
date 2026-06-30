"use client";

import Link from "next/link";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { EditOverviewDialog } from "@/components/company/overview-form";
import { cn, formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import {
  DEFAULT_FUND_FEES,
  type PortfolioSummary,
  type ValuationChange,
} from "@/lib/metrics";
import type { Company } from "@/lib/types";

export function SummaryCards({
  summary,
  changes,
  companies = [],
}: {
  summary: PortfolioSummary;
  changes: ValuationChange[];
  /** Full company records, so each change row gets an inline Edit dialog. */
  companies?: Company[];
}) {
  const gainPositive = summary.unrealizedGain >= 0;
  const byId = new Map(companies.map((c) => [c.id, c]));

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

      <div className="grid gap-5">
        <ListPanel title="Latest valuation changes" value="changes" defaultOpen>
          {changes.length === 0 ? (
            <Empty>No changes yet.</Empty>
          ) : (
            changes.map((c) => {
              const up = c.changePct >= 0;
              const company = byId.get(c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between px-5 py-3 text-sm transition-colors hover:bg-muted/40"
                >
                  <Link
                    href={`/companies/${c.id}`}
                    className="flex items-baseline gap-2 hover:text-primary"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(c.date)}
                    </span>
                  </Link>
                  <span className="flex items-center gap-2">
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
                    {company && (
                      <EditOverviewDialog
                        company={company}
                        defaults={{
                          carry_pct: DEFAULT_FUND_FEES.carryPct,
                          mgmt_fee_pct: DEFAULT_FUND_FEES.mgmtFeePct,
                        }}
                        iconOnly
                      />
                    )}
                  </span>
                </div>
              );
            })
          )}
        </ListPanel>
      </div>
    </div>
  );
}

function ListPanel({
  title,
  value,
  defaultOpen,
  children,
}: {
  title: string;
  value: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Accordion type="single" collapsible defaultValue={defaultOpen ? value : undefined}>
      <AccordionItem
        value={value}
        className="overflow-hidden rounded-xl border border-border"
      >
        <AccordionTrigger className="label-eyebrow px-5 py-3 hover:bg-muted/40 data-[state=open]:border-b data-[state=open]:border-border">
          {title}
        </AccordionTrigger>
        <AccordionContent>
          <div className="divide-y divide-border/70">{children}</div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-5 py-4 text-sm text-muted-foreground">{children}</p>
  );
}
