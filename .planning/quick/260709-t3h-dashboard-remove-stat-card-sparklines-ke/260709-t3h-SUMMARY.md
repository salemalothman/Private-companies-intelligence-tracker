---
phase: quick
plan: 260709-t3h
subsystem: dashboard
tags: [ui, dashboard, presentation]
requires: []
provides:
  - "Dashboard stat cards without sparklines (full number + label legible)"
  - "Allocation donut with total relocated from center overlay to header stat line"
affects:
  - components/dashboard/summary-cards.tsx
  - components/dashboard/portfolio-charts.tsx
  - app/(app)/dashboard/page.tsx
tech-stack:
  added: []
  patterns:
    - "Mirror the Portfolio-value header stat pattern (label-eyebrow + text-xl font-semibold tabular-nums) for inline card totals"
key-files:
  created: []
  modified:
    - components/dashboard/summary-cards.tsx
    - components/dashboard/portfolio-charts.tsx
    - app/(app)/dashboard/page.tsx
decisions:
  - "Kept lib/metrics.ts untouched — presentation-only change; unrealizedGainSeries/companyCountSeries remain exported for potential reuse, just no longer consumed by the dashboard"
  - "Total stat placed at top-right of the allocation header via flex justify-between so legend chips wrap beneath the title without colliding"
metrics:
  duration: ~15m
  completed: 2026-07-09
---

# Quick 260709-t3h: Dashboard Stat-Card Sparklines + Allocation Donut Total Summary

Two presentation-only dashboard tweaks: removed the four KPI stat-card sparklines so icon + full number + full label render without truncation, and relocated the allocation donut's center "Total $X" overlay to a legible header stat line, leaving the donut center clean.

## What Was Built

**Task 1 — Remove stat-card sparklines** (`23a0127`)
- Deleted the `Sparkline` component, the `SummarySeries` interface, and all `series` wiring from `SummaryCards`.
- Removed now-unused imports: `Area, AreaChart, ResponsiveContainer` from recharts and the `PortfolioValuePoint` type.
- Trimmed the `ACCENTS` map to just `.chip` (icon-chip color); dropped the sparkline-only `.stroke` values.
- Simplified each card from a `flex items-center justify-between` two-column layout (number left, sparkline right) to a plain block card (`rounded-2xl border border-border bg-card p-5`); removed the `min-w-0` wrapper and `truncate` on the label so full labels ("Invested Capital", "Unrealized Gain") render.
- Preserved icon chip, `AnimatedNumber`/value figure with `.tabular-nums`, hero-gradient/success/destructive `numberClass`, and the `sub` suffix — no value, format, or color changes.
- In `app/(app)/dashboard/page.tsx`: `SummaryCards` now receives only `summary`; dropped the unused `unrealizedGainSeries` and `companyCountSeries` metric imports (kept `portfolioValueSeries` + `investedCapitalSeries`, still consumed by `PortfolioCharts`) and updated the stale sparkline comment.

**Task 2 — Move allocation donut total to header** (`610809b`)
- Removed the `pointer-events-none absolute inset-0 ...` center overlay ("Total" + `formatCurrency(allocationTotal)`); donut center is now empty.
- Restructured the allocation `header` into a `flex flex-wrap items-start justify-between gap-4` row: title + legend chips on the left, a right-aligned "Total" stat line (`label-eyebrow` over `text-xl font-semibold tabular-nums`) on the right — mirroring the Portfolio-value header pattern.
- Simplified the chart wrapper from `relative h-full w-full` to `h-full w-full` (no overlay left to position).
- `allocationTotal` derivation, the `RadialBarChart`, rings, colors, and tooltip are unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Quality Gates

- `npx tsc --noEmit`: clean
- `npx next lint` (changed files): clean, no warnings or errors
- `npm run test`: 274 passed (29 files) — no regression; no test touches these presentation components
- Visual human-verify checkpoint (Task 3): deferred to the orchestrator's live preview (not executor responsibility)

## Self-Check: PASSED

- FOUND: components/dashboard/summary-cards.tsx (modified, no recharts/Sparkline)
- FOUND: components/dashboard/portfolio-charts.tsx (modified, header total, no overlay)
- FOUND: app/(app)/dashboard/page.tsx (modified, SummaryCards receives only summary)
- FOUND commit: 23a0127 (Task 1)
- FOUND commit: 610809b (Task 2)
