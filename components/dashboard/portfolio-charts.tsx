"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn, formatCurrency, formatPercent } from "@/lib/utils";
import type {
  PerformerRow,
  PortfolioValuePoint,
  SectorSlice,
} from "@/lib/metrics";

const CHART = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const axis = { stroke: "hsl(var(--muted-foreground))", fontSize: 11 };

function ChartCard({
  title,
  header,
  children,
  empty,
  className,
  height = 260,
}: {
  title: string;
  /** Optional richer header row (replaces the plain title). */
  header?: React.ReactNode;
  children: React.ReactNode;
  empty: boolean;
  className?: string;
  height?: number;
}) {
  return (
    <Card className={cn("rounded-2xl", className)}>
      <CardHeader className="pb-2">
        {header ?? <CardTitle className="text-sm font-medium">{title}</CardTitle>}
      </CardHeader>
      <CardContent>
        {empty ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground"
            style={{ height }}
          >
            Not enough data yet
          </div>
        ) : (
          <div style={{ height }}>{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

/** Merge the value series with cumulative invested-as-of each date, so the
 * hero chart can show the dashed cost-basis line under the value curve. Both
 * inputs are REAL recorded series — no interpolation beyond step-holding the
 * last known invested total. */
function mergeSeries(
  valueSeries: PortfolioValuePoint[],
  investedSeries: PortfolioValuePoint[],
): { date: string; value: number; invested: number }[] {
  return valueSeries.map((p) => {
    const t = new Date(p.date).getTime();
    let invested = 0;
    for (const q of investedSeries) {
      if (new Date(q.date).getTime() <= t) invested = q.value;
      else break;
    }
    return { date: p.date, value: p.value, invested };
  });
}

export function PortfolioCharts({
  valueSeries,
  investedSeries,
  allocation,
  performers,
}: {
  valueSeries: PortfolioValuePoint[];
  investedSeries: PortfolioValuePoint[];
  allocation: SectorSlice[];
  performers: PerformerRow[];
}) {
  const merged = mergeSeries(valueSeries, investedSeries);
  const currentValue = valueSeries.at(-1)?.value ?? null;
  const totalInvested = investedSeries.at(-1)?.value ?? null;
  const allocationTotal = allocation.reduce((s, a) => s + a.value, 0);
  // Radial rings read outside-in; cap at 5 sectors (the palette's width).
  const rings = allocation.slice(0, 5);

  return (
    // Proportional 3-col grid, no orphan cells: the value curve is the hero
    // (2/3 width), allocation completes the row, performers spans the full
    // width below — horizontal bars are the one chart that improves with width.
    <div className="grid gap-4 lg:grid-cols-3">
      <ChartCard
        title="Portfolio value"
        empty={valueSeries.length < 2}
        className="lg:col-span-2"
        header={
          <div className="flex flex-wrap items-start justify-between gap-4">
            <CardTitle className="text-sm font-medium">Portfolio value</CardTitle>
            <div className="flex items-baseline gap-6">
              <span>
                <span className="label-eyebrow block">Current</span>
                <span className="text-xl font-semibold tabular-nums text-brand">
                  {formatCurrency(currentValue)}
                </span>
              </span>
              <span>
                <span className="label-eyebrow block">Invested</span>
                <span className="text-xl font-semibold tabular-nums text-muted-foreground">
                  {formatCurrency(totalInvested)}
                </span>
              </span>
            </div>
          </div>
        }
      >
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={merged} margin={{ left: 8, right: 8, top: 8 }}>
            {/* Brand-hued hero fill — id unique to this file (duplicate SVG ids
                across mounted charts resolve to the first in the DOM). */}
            <defs>
              <linearGradient id="pvBrandFill" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="hsl(var(--brand))"
                  stopOpacity={0.3}
                />
                <stop
                  offset="60%"
                  stopColor="hsl(var(--chart-5))"
                  stopOpacity={0.12}
                />
                <stop
                  offset="95%"
                  stopColor="hsl(var(--chart-5))"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={axis}
              tickFormatter={(d) => String(d).slice(0, 7)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={axis}
              tickFormatter={(v) => formatCurrency(Number(v))}
              tickLine={false}
              axisLine={false}
              width={56}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, name) => [
                formatCurrency(Number(v)),
                name === "invested" ? "Invested (cost basis)" : "Value",
              ]}
            />
            {/* Dashed cost-basis comparison under the hero curve. */}
            <Area
              type="stepAfter"
              dataKey="invested"
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={1.5}
              strokeDasharray="5 5"
              fill="none"
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--brand))"
              strokeWidth={2.25}
              fill="url(#pvBrandFill)"
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard
        title="Allocation by sector"
        empty={allocation.length === 0}
        header={
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <CardTitle className="text-sm font-medium">
                Allocation by sector
              </CardTitle>
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                {rings.map((a, i) => (
                  <span
                    key={a.sector}
                    className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ background: CHART[i % CHART.length] }}
                    />
                    {a.sector}
                  </span>
                ))}
              </div>
            </div>
            <span className="text-right">
              <span className="label-eyebrow block">Total</span>
              <span className="text-xl font-semibold tabular-nums">
                {formatCurrency(allocationTotal)}
              </span>
            </span>
          </div>
        }
      >
        <div className="h-full w-full">
          <ResponsiveContainer width="100%" height="100%">
            <RadialBarChart
              data={rings}
              innerRadius="42%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
            >
              <RadialBar
                dataKey="value"
                background={{ fill: "hsl(var(--muted))" }}
                cornerRadius={8}
                isAnimationActive
                animationDuration={700}
                animationEasing="ease-out"
              >
                {rings.map((_, i) => (
                  <Cell key={i} fill={CHART[i % CHART.length]} />
                ))}
              </RadialBar>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(v, _n, p) => [
                  formatCurrency(Number(v)),
                  (p?.payload as SectorSlice | undefined)?.sector ?? "Sector",
                ]}
              />
            </RadialBarChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>

      <ChartCard
        title="Top performing companies"
        empty={performers.length === 0}
        className="lg:col-span-3"
        height={220}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={performers}
            layout="vertical"
            margin={{ left: 8, right: 16 }}
          >
            <XAxis
              type="number"
              tick={axis}
              tickFormatter={(v) => formatPercent(Number(v))}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={axis}
              width={90}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v) => [formatPercent(Number(v), { signed: true }), "Change"]}
            />
            <Bar
              dataKey="changePct"
              radius={[0, 4, 4, 0]}
              isAnimationActive
              animationDuration={600}
              animationEasing="ease-out"
            >
              {performers.map((p, i) => (
                <Cell
                  key={i}
                  fill={p.changePct >= 0 ? "hsl(var(--chart-2))" : "hsl(var(--destructive))"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  fontSize: 12,
  color: "hsl(var(--popover-foreground))",
};
