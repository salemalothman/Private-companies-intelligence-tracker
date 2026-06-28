"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrency, formatPercent } from "@/lib/utils";
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
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {empty ? (
          <div className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">
            Not enough data yet
          </div>
        ) : (
          <div className="h-[220px]">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

export function PortfolioCharts({
  valueSeries,
  allocation,
  performers,
}: {
  valueSeries: PortfolioValuePoint[];
  allocation: SectorSlice[];
  performers: PerformerRow[];
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Portfolio valuation growth" empty={valueSeries.length < 2}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={valueSeries} margin={{ left: 8, right: 8, top: 8 }}>
            <defs>
              <linearGradient id="pv" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CHART[0]} stopOpacity={0.4} />
                <stop offset="95%" stopColor={CHART[0]} stopOpacity={0} />
              </linearGradient>
            </defs>
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
              formatter={(v) => [formatCurrency(Number(v)), "Value"]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={CHART[0]}
              strokeWidth={2}
              fill="url(#pv)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Allocation by sector" empty={allocation.length === 0}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={allocation}
              dataKey="value"
              nameKey="sector"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
            >
              {allocation.map((_, i) => (
                <Cell key={i} fill={CHART[i % CHART.length]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, n) => [formatCurrency(Number(v)), String(n)]}
            />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="Top performing companies" empty={performers.length === 0}>
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
            <Bar dataKey="changePct" radius={[0, 4, 4, 0]}>
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
