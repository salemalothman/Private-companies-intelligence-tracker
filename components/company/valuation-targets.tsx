"use client";

import * as React from "react";
import { ShieldCheck } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalysisValuation } from "@/lib/agents/deep-dive-types";
import {
  buildCompsTable,
  clampGrowth,
  COMPS_YEARS,
  GROWTH_MIN,
  GROWTH_MAX,
  type CompsRow,
  type MultiplePercentile,
} from "@/lib/valuation/comps";
import { ConfidenceChip, DeepDiveEmpty } from "@/components/company/confidence-chip";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatCurrency, formatMultiple, formatPercent } from "@/lib/utils";

/**
 * The interactive "Valuation Targets" tab (VAL-02/03/04/05).
 *
 * A client component that owns the growth-% input and p25/median/p75 selector
 * and recomputes the 2026–2030 Bear/Base/Bull implied-valuation table + recharts
 * chart LIVE, client-side, via `buildCompsTable` (Plan 01) — the ONLY source of
 * $ figures here. No math is duplicated; null cells render "—", never 0.
 *
 * States:
 *  - EMPTY (null valuation) → `DeepDiveEmpty` CTA.
 *  - INSUFFICIENT (null base_revenue OR all three peer multiples null) → an
 *    honest dashed panel naming exactly what is missing + the disclaimer.
 *  - INTERACTIVE → inputs/provenance panel, live table + chart, always-on
 *    "not a forecast" disclaimer.
 *
 * XSS/honesty: all Grok-originated text (base_revenue.source, growth.rationale)
 * is rendered as JSX children only (React auto-escaped); no dangerouslySetInnerHTML.
 */

const DISCLAIMER =
  "Implied by peer comparables under the shown assumptions — not a forecast.";

const SCENARIOS: { key: "bear" | "base" | "bull"; label: string; color: string }[] =
  [
    { key: "bear", label: "Bear", color: "hsl(var(--chart-1))" },
    { key: "base", label: "Base", color: "hsl(var(--chart-2))" },
    { key: "bull", label: "Bull", color: "hsl(var(--chart-3))" },
  ];

const PERCENTILES: { key: MultiplePercentile; label: string }[] = [
  { key: "p25", label: "P25" },
  { key: "median", label: "Median" },
  { key: "p75", label: "P75" },
];

/** The peer multiple applied to a given scenario under the current percentile.
 * `percentile: null` = the scenario defaults (bear→p25, base→median, bull→p75). */
function appliedMultiple(
  valuation: AnalysisValuation,
  percentile: MultiplePercentile | null,
  scenario: "bear" | "base" | "bull",
): number | null {
  const pm = valuation.peer_multiple;
  if (percentile) {
    // Percentile override collapses all three columns onto one multiple.
    return pm[percentile];
  }
  return scenario === "bear" ? pm.p25 : scenario === "bull" ? pm.p75 : pm.median;
}

/** The growth rate applied to a given scenario: the user override when set,
 * otherwise the scenario's own agent-proposed rate (null = no proposal). */
function scenarioGrowth(
  valuation: AnalysisValuation,
  growthOverride: number | null,
  scenario: "bear" | "base" | "bull",
): number | null {
  if (growthOverride != null) return clampGrowth(growthOverride);
  return valuation.growth[scenario];
}

/** Human tooltip exposing a cell's inputs: revenue × (1+g)^n × multiple = value. */
function cellTooltip(
  baseRevenue: number | null,
  growth: number | null,
  multiple: number | null,
  n: number,
  value: number | null,
): string {
  if (value == null || baseRevenue == null || growth == null || multiple == null) {
    return "Insufficient comps inputs";
  }
  return `${formatCurrency(baseRevenue)} × (1${
    growth >= 0 ? "+" : ""
  }${formatPercent(growth)})^${n} × ${formatMultiple(multiple)} = ${formatCurrency(
    value,
  )}`;
}

export function ValuationTargets({
  valuation,
  deepDiveAction,
}: {
  valuation: AnalysisValuation | null;
  deepDiveAction?: React.ReactNode;
}) {
  // (A) EMPTY STATE — no analysis at all.
  if (!valuation) {
    return (
      <DeepDiveEmpty
        message="Run deep-dive to model valuation targets."
        action={deepDiveAction}
      />
    );
  }

  return <ValuationTargetsBody valuation={valuation} />;
}

/** Split so hooks only run when `valuation` is non-null (Rules of Hooks). */
function ValuationTargetsBody({ valuation }: { valuation: AnalysisValuation }) {
  const pm = valuation.peer_multiple;
  const hasBaseRevenue = valuation.base_revenue.value != null;
  const hasMultiple = pm.p25 != null || pm.median != null || pm.p75 != null;

  // Interactive state — null = no override, so each scenario uses its own
  // agent-proposed growth (bear/base/bull) and its own percentile (p25/median/
  // p75). A user edit collapses all three onto the single chosen lever (VAL-04).
  const [growthOverride, setGrowthOverride] = React.useState<number | null>(
    null,
  );
  const [percentile, setPercentile] =
    React.useState<MultiplePercentile | null>(null);

  // The LIVE recompute (VAL-04): rows depend only on stored inputs + overrides.
  const rows = React.useMemo<CompsRow[]>(
    () =>
      buildCompsTable(valuation, {
        growth: growthOverride,
        multiplePercentile: percentile ?? undefined,
      }),
    [valuation, growthOverride, percentile],
  );

  // (B) INSUFFICIENT STATE — null base revenue OR no peer multiples at all.
  if (!hasBaseRevenue || !hasMultiple) {
    const missing: string[] = [];
    if (!hasBaseRevenue) missing.push("No base revenue on record");
    if (!hasMultiple) missing.push("No SEC-verified peer multiples yet");
    return (
      <div className="space-y-3">
        <div className="space-y-2 rounded-lg border border-dashed border-border bg-muted/20 p-5">
          <div className="label-eyebrow">Insufficient comps inputs</div>
          <ul className="list-inside list-disc text-sm text-muted-foreground">
            {missing.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            A valuation-targets table needs a base revenue and at least one peer
            multiple. Nothing is projected until both are available.
          </p>
        </div>
        <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>
      </div>
    );
  }

  // (C) INTERACTIVE STATE. The input shows the override when set, else the
  // agent-proposed base rate; empty when the model made no proposal (never 0).
  const displayedGrowth =
    growthOverride != null
      ? clampGrowth(growthOverride)
      : valuation.growth.base;
  const growthPctValue =
    displayedGrowth == null ? "" : Math.round(displayedGrowth * 1000) / 10;

  const chartData = rows.map((r) => ({
    year: r.year,
    bear: r.bear,
    base: r.base,
    bull: r.bull,
  }));

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-6">
        <div className="space-y-1.5">
          <label
            htmlFor="growth-override"
            className="label-eyebrow block"
          >
            Annual growth
          </label>
          <div className="flex items-center gap-2">
            <input
              id="growth-override"
              type="number"
              inputMode="decimal"
              step={1}
              min={GROWTH_MIN * 100}
              max={GROWTH_MAX * 100}
              value={growthPctValue}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setGrowthOverride(null); // back to scenario presets
                  return;
                }
                const pct = Number(raw);
                if (Number.isFinite(pct)) setGrowthOverride(pct / 100);
              }}
              className="h-9 w-24 rounded-md border border-border bg-background px-2 text-sm tabular-nums"
              aria-label="Annual growth rate percentage"
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="label-eyebrow block">Peer multiple</span>
          <div
            className="inline-flex rounded-md border border-border p-0.5"
            role="group"
            aria-label="Peer multiple percentile"
          >
            {/* Auto = the scenario defaults (Bear p25 · Base median · Bull p75). */}
            <button
              type="button"
              onClick={() => setPercentile(null)}
              aria-pressed={percentile === null}
              title="Scenario defaults: Bear p25 · Base median · Bull p75"
              className={cn(
                "rounded px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                percentile === null
                  ? "bg-foreground/[0.08] text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Auto
            </button>
            {PERCENTILES.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPercentile(p.key)}
                aria-pressed={percentile === p.key}
                className={cn(
                  "rounded px-3 py-1 text-xs font-medium tabular-nums transition-colors",
                  percentile === p.key
                    ? "bg-foreground/[0.08] text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="space-y-3">
        <div className="h-[260px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ left: 8, right: 16, top: 8 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="hsl(var(--border))"
                vertical={false}
              />
              <XAxis
                dataKey="year"
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                tickFormatter={(v) => formatCurrency(Number(v))}
                tickLine={false}
                axisLine={false}
                width={60}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "hsl(var(--popover))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number, name) => [
                  formatCurrency(Number(v)),
                  String(name).charAt(0).toUpperCase() + String(name).slice(1),
                ]}
              />
              {SCENARIOS.map((s) => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  name={s.label}
                  stroke={s.color}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-5 px-1 text-xs text-muted-foreground">
          {SCENARIOS.map((s) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 rounded-full"
                style={{ background: s.color }}
              />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Table — every cell exposes its inputs on hover (VAL-05). */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Year</TableHead>
              {SCENARIOS.map((s) => (
                <TableHead key={s.key} className="text-right">
                  {s.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const n = row.year - COMPS_YEARS[0];
              return (
                <TableRow key={row.year}>
                  <TableCell className="tabular-nums font-medium">
                    {row.year}
                  </TableCell>
                  {SCENARIOS.map((s) => {
                    const value = row[s.key];
                    const multiple = appliedMultiple(valuation, percentile, s.key);
                    const growth = scenarioGrowth(valuation, growthOverride, s.key);
                    return (
                      <TableCell
                        key={s.key}
                        className="text-right tabular-nums"
                        title={cellTooltip(
                          valuation.base_revenue.value,
                          growth,
                          multiple,
                          n,
                          value,
                        )}
                      >
                        {value != null ? formatCurrency(value) : "—"}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <p className="text-xs text-muted-foreground">{DISCLAIMER}</p>

      {/* Inputs / provenance panel (VAL-05). */}
      <Card>
        <CardContent className="space-y-5 p-5">
          <div className="label-eyebrow">Inputs &amp; provenance</div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="label-eyebrow">Base revenue</div>
              <p className="text-sm tabular-nums">
                {formatCurrency(valuation.base_revenue.value)}
              </p>
              {valuation.base_revenue.source ? (
                <p className="text-xs text-muted-foreground">
                  {valuation.base_revenue.source}
                </p>
              ) : null}
            </div>

            <div className="space-y-1">
              <div className="label-eyebrow">Current valuation</div>
              <p className="text-sm tabular-nums">
                {formatCurrency(valuation.current_valuation)}
              </p>
            </div>
          </div>

          {/* Peer multiples + SEC provenance. */}
          <div className="space-y-2">
            <div className="label-eyebrow">Peer multiple (V / R)</div>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums">
              <span>P25 {formatMultiple(pm.p25)}</span>
              <span>Median {formatMultiple(pm.median)}</span>
              <span>P75 {formatMultiple(pm.p75)}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="tabular-nums">
                {pm.n_peers} peers · {pm.n_sec_verified} SEC-verified
              </span>
              {pm.n_sec_verified > 0 ? (
                <span
                  className="inline-flex items-center gap-1 text-success"
                  title="A matching SEC Form D filing was found"
                >
                  <ShieldCheck className="h-3.5 w-3.5" /> SEC
                </span>
              ) : null}
            </div>
          </div>

          {/* Agent growth proposal — null rates render as "no proposal" (never 0). */}
          <div className="space-y-2">
            <div className="label-eyebrow">Growth proposal (agent)</div>
            {valuation.growth.base == null &&
            valuation.growth.bear == null &&
            valuation.growth.bull == null ? (
              <p className="text-sm text-muted-foreground">
                No growth proposal from the model — re-run the deep-dive, or set
                a growth rate above.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm tabular-nums">
                <span>
                  Bear{" "}
                  {valuation.growth.bear != null
                    ? formatPercent(valuation.growth.bear)
                    : "—"}
                </span>
                <span>
                  Base{" "}
                  {valuation.growth.base != null
                    ? formatPercent(valuation.growth.base)
                    : "—"}
                </span>
                <span>
                  Bull{" "}
                  {valuation.growth.bull != null
                    ? formatPercent(valuation.growth.bull)
                    : "—"}
                </span>
                <ConfidenceChip
                  basis="estimate"
                  confidence={valuation.growth.confidence}
                />
              </div>
            )}
            {valuation.growth.rationale ? (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {valuation.growth.rationale}
              </p>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
