/**
 * Pure comps model for the Valuation Targets tab (design spec §4).
 *
 * This module is the ONLY source of $ figures in Phase 5. It maps a stored
 * `AnalysisValuation` (unchanged) plus optional user overrides into a table of
 * {year, bear, base, bull} implied-valuation rows for 2026–2030:
 *
 *   projected_revenue(year) = base_revenue × (1 + growth)^n   (n = year − 2026)
 *   implied_valuation(year) = projected_revenue(year) × applied V/R multiple
 *
 * No React, no I/O — an isomorphic, deterministic, directly unit-testable module
 * usable from both the RSC page and the client tab. Nulls propagate honestly: a
 * null base_revenue or null applied multiple yields a `null` cell (rendered as
 * "—"), never a fabricated 0.
 */

import type { AnalysisValuation } from "@/lib/agents/deep-dive-types";

/** The comps horizon, base year first. `n` for any year is `year − BASE_YEAR`. */
export const COMPS_YEARS = [2026, 2027, 2028, 2029, 2030] as const;

/** Base year: the 2026 exponent is 0, so its cell carries no growth factor. */
export const BASE_YEAR = 2026;

/**
 * Override bounds for a user-supplied growth rate (design spec / CONTEXT: the tab
 * allows −50%..+300%). Exported so the Wave-2 tab can bound its input control to
 * the same range the math enforces.
 */
export const GROWTH_MIN = -0.5;
export const GROWTH_MAX = 3.0;

/** The three preset scenarios. */
export type ScenarioKey = "bear" | "base" | "bull";

/** Which peer-multiple percentile a scenario (or override) applies. */
export type MultiplePercentile = "p25" | "median" | "p75";

/**
 * The subset of `AnalysisValuation` the comps math reads. Typed as a `Pick` so a
 * caller can pass the full stored object directly without reshaping it.
 */
export type CompsInputs = Pick<
  AnalysisValuation,
  "base_revenue" | "peer_multiple" | "growth"
>;

/**
 * Optional user overrides (VAL-04). When `growth` is set it replaces ALL three
 * scenario growth rates (a single user lever). When `multiplePercentile` is set
 * it replaces the per-scenario percentile mapping with that one percentile for
 * every column. Both are recomputed through the same `buildCompsTable`.
 */
export interface CompsOverrides {
  growth?: number | null;
  multiplePercentile?: MultiplePercentile;
}

/** One table row: implied valuation per scenario for a single year (null-honest). */
export interface CompsRow {
  year: number;
  bear: number | null;
  base: number | null;
  bull: number | null;
}

/**
 * Bound a user-supplied growth rate to [GROWTH_MIN, GROWTH_MAX], or return null
 * for absent/non-finite input. We deliberately return null (never a fabricated
 * default) so the caller can distinguish "no override" from a real 0 rate.
 */
export function clampGrowth(g: number | null | undefined): number | null {
  if (g == null || !Number.isFinite(g)) return null;
  if (g < GROWTH_MIN) return GROWTH_MIN;
  if (g > GROWTH_MAX) return GROWTH_MAX;
  return g;
}

/**
 * A single implied-valuation cell. Null base revenue OR null growth OR null
 * multiple → null (honest "insufficient inputs" cell); never coerced to 0.
 */
function impliedValuation(
  baseRevenue: number | null,
  growth: number | null,
  multiple: number | null,
  n: number,
): number | null {
  if (baseRevenue == null || growth == null || multiple == null) return null;
  return baseRevenue * (1 + growth) ** n * multiple;
}

/**
 * Build the 2026–2030 comps table from stored inputs and optional user overrides.
 *
 * Default mapping (design spec §4): bear = growth.bear × peer_multiple.p25,
 * base = growth.base × median, bull = growth.bull × p75. An `overrides.growth`
 * (clamped via `clampGrowth`) replaces all three growth rates; an
 * `overrides.multiplePercentile` replaces all three multiples with that single
 * percentile. Always returns exactly `COMPS_YEARS.length` (5) rows.
 */
export function buildCompsTable(
  inputs: CompsInputs,
  overrides?: CompsOverrides,
): CompsRow[] {
  const baseRevenue = inputs.base_revenue.value;
  const { p25, median, p75 } = inputs.peer_multiple;

  // Growth per scenario: a single override (clamped) collapses all three.
  // Stored rates may be null ("no proposal") — nulls flow to null cells.
  const overrideGrowth =
    overrides?.growth == null ? null : clampGrowth(overrides.growth);
  const growth: Record<ScenarioKey, number | null> =
    overrideGrowth == null
      ? { bear: inputs.growth.bear, base: inputs.growth.base, bull: inputs.growth.bull }
      : { bear: overrideGrowth, base: overrideGrowth, bull: overrideGrowth };

  // Multiple per scenario: an override percentile collapses all three onto it.
  const percentiles: Record<MultiplePercentile, number | null> = {
    p25,
    median,
    p75,
  };
  const chosen = overrides?.multiplePercentile
    ? percentiles[overrides.multiplePercentile]
    : null;
  const multiple: Record<ScenarioKey, number | null> = chosen
    ? { bear: chosen, base: chosen, bull: chosen }
    : { bear: p25, base: median, bull: p75 };

  return COMPS_YEARS.map((year) => {
    const n = year - BASE_YEAR;
    return {
      year,
      bear: impliedValuation(baseRevenue, growth.bear, multiple.bear, n),
      base: impliedValuation(baseRevenue, growth.base, multiple.base, n),
      bull: impliedValuation(baseRevenue, growth.bull, multiple.bull, n),
    };
  });
}
