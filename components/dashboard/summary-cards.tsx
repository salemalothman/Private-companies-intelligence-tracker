"use client";

import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  PiggyBank,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  CollapsibleSection,
  SectionEmpty,
} from "@/components/dashboard/collapsible-section";
import {
  AnimatedNumber,
  type AnimatedNumberFormat,
} from "@/components/motion/animated-number";
import { cn, formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import type { PortfolioSummary, ValuationChange } from "@/lib/metrics";

/**
 * KPI stat cards, reference aesthetic: soft rounded card, pastel icon chip,
 * bold count-up figure, and a muted label. No sparkline — icon + number +
 * full label render cleanly without truncation.
 */

const ACCENTS = {
  violet: {
    chip: "bg-chart-4/15 text-chart-4",
  },
  cyan: {
    chip: "bg-chart-5/15 text-chart-5",
  },
  green: {
    chip: "bg-success/15 text-success",
  },
  red: {
    chip: "bg-destructive/15 text-destructive",
  },
  orange: {
    chip: "bg-chart-3/15 text-chart-3",
  },
} as const;
type AccentKey = keyof typeof ACCENTS;

export function SummaryCards({ summary }: { summary: PortfolioSummary }) {
  const gainPositive = summary.unrealizedGain >= 0;

  const cards: {
    label: string;
    value: string;
    sub?: string;
    accent: AccentKey;
    icon: React.ReactNode;
    numberClass?: string;
    raw?: { value: number; format: AnimatedNumberFormat };
  }[] = [
    {
      label: "Portfolio Value",
      value: formatCurrency(summary.portfolioValue),
      accent: "violet",
      icon: <Wallet className="h-[18px] w-[18px]" />,
      // The app's single hero-gradient number.
      numberClass: "text-gradient-brand",
      raw: { value: summary.portfolioValue, format: "currency" },
    },
    {
      label: "Invested Capital",
      value: formatCurrency(summary.totalInvested),
      accent: "cyan",
      icon: <PiggyBank className="h-[18px] w-[18px]" />,
      raw: { value: summary.totalInvested, format: "currency" },
    },
    {
      // Static value (no counter): the +/− sign is semantic and must never
      // flicker through intermediate states.
      label: gainPositive ? "Unrealized Gain" : "Unrealized Loss",
      value: `${gainPositive ? "+" : ""}${formatCurrency(summary.unrealizedGain)}`,
      sub: formatPercent(summary.totalReturnPct, { signed: true }) || undefined,
      accent: gainPositive ? "green" : "red",
      icon: <TrendingUp className="h-[18px] w-[18px]" />,
      numberClass: gainPositive ? "text-success" : "text-destructive",
    },
    {
      label: "Companies",
      value: String(summary.companyCount),
      sub: `${summary.activeCount} active`,
      accent: "orange",
      icon: <Building2 className="h-[18px] w-[18px]" />,
      raw: { value: summary.companyCount, format: "count" },
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map((c) => (
        <div
          key={c.label}
          className="rounded-2xl border border-border bg-card p-5"
        >
          <span
            className={cn(
              "inline-flex h-9 w-9 items-center justify-center rounded-full",
              ACCENTS[c.accent].chip,
            )}
            aria-hidden="true"
          >
            {c.icon}
          </span>
          <div
            className={cn(
              "mt-3 text-2xl font-semibold leading-none tracking-tight tabular-nums",
              c.numberClass ?? "text-foreground",
            )}
          >
            {c.raw ? (
              <AnimatedNumber value={c.raw.value} format={c.raw.format} />
            ) : (
              c.value
            )}
          </div>
          <div className="mt-1.5 text-xs text-muted-foreground">
            {c.label}
            {c.sub ? <span className="tabular-nums"> · {c.sub}</span> : null}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The "Latest valuation changes" list — split out of the KPI strip so the
 * dashboard can sequence stats → charts → changes (reference layout). */
export function ValuationChangesList({ changes }: { changes: ValuationChange[] }) {
  return (
    <CollapsibleSection
      title="Latest valuation changes"
      defaultOpen
      className="rounded-2xl"
    >
      {changes.length === 0 ? (
        <SectionEmpty>No changes yet.</SectionEmpty>
      ) : (
        <div className="divide-y divide-border/70">
          {changes.map((c) => {
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
          })}
        </div>
      )}
    </CollapsibleSection>
  );
}
