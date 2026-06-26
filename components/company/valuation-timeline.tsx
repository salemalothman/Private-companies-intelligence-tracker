"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatCurrency } from "@/lib/utils";
import type { Valuation } from "@/lib/types";
import { valuationAmount } from "@/lib/metrics";

interface Point {
  date: string;
  value: number;
  label: string;
  kind: "round" | "investment";
}

const ROUND_COLOR = "hsl(var(--chart-1))";
const INVEST_COLOR = "hsl(var(--chart-3))";

/** Distinct marker for the user's investment entry vs. company rounds. */
function renderDot(props: {
  cx?: number;
  cy?: number;
  index?: number;
  payload?: Point;
}) {
  const { cx, cy, index, payload } = props;
  if (cx == null || cy == null) return <g key={`d-${index}`} />;
  const isInvestment = payload?.kind === "investment";
  return (
    <circle
      key={`d-${index}`}
      cx={cx}
      cy={cy}
      r={isInvestment ? 6.5 : 4}
      fill={isInvestment ? INVEST_COLOR : ROUND_COLOR}
      stroke={isInvestment ? "hsl(var(--background))" : "none"}
      strokeWidth={isInvestment ? 2.5 : 0}
    />
  );
}

export function ValuationTimeline({
  valuations,
  investment,
}: {
  valuations: Valuation[];
  investment?: { date: string; value: number } | null;
}) {
  // Company's three most recent valuation rounds.
  const rounds: Point[] = [...valuations]
    .filter((v) => v.date && valuationAmount(v) != null)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3)
    .map((v) => ({
      date: v.date,
      value: valuationAmount(v) as number,
      label: v.round ?? "Valuation round",
      kind: "round" as const,
    }));

  // The user's investment entry point, marked distinctly.
  const investPoint: Point[] = investment
    ? [
        {
          date: investment.date,
          value: investment.value,
          label: "Your investment",
          kind: "investment" as const,
        },
      ]
    : [];

  // Filter to only these points, sorted chronologically.
  const data: Point[] = [...rounds, ...investPoint].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  if (data.length === 0) {
    return (
      <div className="flex h-[260px] items-center justify-center rounded-lg border border-dashed border-border text-sm text-muted-foreground">
        Add a valuation or record an investment to see the timeline.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="h-[260px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 16, top: 8 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="hsl(var(--border))"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickFormatter={(d) => String(d).slice(0, 7)}
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
              formatter={(v: number, _n, p) => [
                formatCurrency(Number(v)),
                (p?.payload as Point | undefined)?.label ?? "Valuation",
              ]}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke={ROUND_COLOR}
              strokeWidth={2}
              dot={renderDot}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="flex items-center gap-5 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ background: ROUND_COLOR }}
          />
          Valuation round
        </span>
        {investment && (
          <span className="flex items-center gap-1.5">
            <span
              className="inline-block h-3 w-3 rounded-full ring-2 ring-background"
              style={{ background: INVEST_COLOR }}
            />
            Your investment · {formatCurrency(investment.value)}
          </span>
        )}
      </div>
    </div>
  );
}
