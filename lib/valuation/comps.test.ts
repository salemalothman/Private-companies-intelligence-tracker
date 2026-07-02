import { describe, expect, it } from "vitest";

import {
  buildCompsTable,
  clampGrowth,
  COMPS_YEARS,
  GROWTH_MAX,
  GROWTH_MIN,
} from "@/lib/valuation/comps";
import type { CompsInputs } from "@/lib/valuation/comps";

/**
 * A valid CompsInputs factory mirroring Replit's live stored row (design spec §4
 * fixture): base_revenue $240M, peer_multiple {13.5 / 14.5 / 15.5},
 * growth {0.25 / 0.45 / 0.70}. Each test tweaks a single field so the assertion
 * isolates exactly one behaviour of the pure math.
 */
function makeInputs(over: Partial<CompsInputs> = {}): CompsInputs {
  return {
    base_revenue: { value: 240_000_000, source: "techcrunch" },
    peer_multiple: {
      median: 14.5,
      p25: 13.5,
      p75: 15.5,
      n_peers: 14,
      n_sec_verified: 2,
    },
    growth: {
      base: 0.45,
      bear: 0.25,
      bull: 0.7,
      confidence: "med",
      rationale: "sector history",
    },
    ...over,
  };
}

describe("COMPS_YEARS", () => {
  it("is exactly 2026..2030 (base year 2026, n = year − 2026)", () => {
    expect([...COMPS_YEARS]).toEqual([2026, 2027, 2028, 2029, 2030]);
  });
});

describe("buildCompsTable — math", () => {
  it("returns 5 rows keyed by each comps year", () => {
    const rows = buildCompsTable(makeInputs());
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.year)).toEqual([2026, 2027, 2028, 2029, 2030]);
  });

  it("computes the 2026 (n=0) cells as revenue × multiple with no growth factor", () => {
    const rows = buildCompsTable(makeInputs());
    const y2026 = rows.find((r) => r.year === 2026)!;
    // 240e6 × 14.5 = 3.48e9 (base uses median)
    expect(y2026.base).toBe(3_480_000_000);
    // 240e6 × 15.5 = 3.72e9 (bull uses p75)
    expect(y2026.bull).toBe(3_720_000_000);
    // 240e6 × 13.5 = 3.24e9 (bear uses p25)
    expect(y2026.bear).toBe(3_240_000_000);
  });

  it("compounds growth for 2027 (n=1): base = 240e6 × (1+0.45)^1 × 14.5 = 5.046e9", () => {
    const rows = buildCompsTable(makeInputs());
    const y2027 = rows.find((r) => r.year === 2027)!;
    expect(y2027.base).toBeCloseTo(5_046_000_000, 0);
  });
});

describe("buildCompsTable — scenario → percentile mapping", () => {
  it("pairs bear/base/bull with peer_multiple p25/median/p75 respectively", () => {
    const base = buildCompsTable(makeInputs());
    const b2026 = base.find((r) => r.year === 2026)!;
    // Bear→p25, base→median, bull→p75 (all distinct here).
    expect(b2026.bear).toBe(240_000_000 * 13.5);
    expect(b2026.base).toBe(240_000_000 * 14.5);
    expect(b2026.bull).toBe(240_000_000 * 15.5);
  });

  it("changing only p75 moves bull but leaves bear/base untouched", () => {
    const before = buildCompsTable(makeInputs());
    const after = buildCompsTable(
      makeInputs({
        peer_multiple: {
          median: 14.5,
          p25: 13.5,
          p75: 20,
          n_peers: 14,
          n_sec_verified: 2,
        },
      }),
    );
    const b = before.find((r) => r.year === 2026)!;
    const a = after.find((r) => r.year === 2026)!;
    expect(a.bull).not.toBe(b.bull);
    expect(a.bull).toBe(240_000_000 * 20);
    expect(a.bear).toBe(b.bear);
    expect(a.base).toBe(b.base);
  });

  it("uses each scenario's own growth rate (bear<base<bull compounding)", () => {
    const rows = buildCompsTable(makeInputs());
    const y2030 = rows.find((r) => r.year === 2030)!; // n = 4
    // bear: 240e6 × 1.25^4 × 13.5
    expect(y2030.bear).toBeCloseTo(240_000_000 * 1.25 ** 4 * 13.5, 0);
    // base: 240e6 × 1.45^4 × 14.5
    expect(y2030.base).toBeCloseTo(240_000_000 * 1.45 ** 4 * 14.5, 0);
    // bull: 240e6 × 1.70^4 × 15.5
    expect(y2030.bull).toBeCloseTo(240_000_000 * 1.7 ** 4 * 15.5, 0);
  });
});

describe("buildCompsTable — null propagation (never fabricate 0)", () => {
  it("null base_revenue.value → every cell in every row is strictly null", () => {
    const rows = buildCompsTable(
      makeInputs({ base_revenue: { value: null, source: null } }),
    );
    expect(rows).toHaveLength(5);
    for (const row of rows) {
      expect(row.bear).toBeNull();
      expect(row.base).toBeNull();
      expect(row.bull).toBeNull();
    }
  });

  it("null peer_multiple.median → only the base column is null; bear/bull compute", () => {
    const rows = buildCompsTable(
      makeInputs({
        peer_multiple: {
          median: null,
          p25: 13.5,
          p75: 15.5,
          n_peers: 14,
          n_sec_verified: 2,
        },
      }),
    );
    const y2026 = rows.find((r) => r.year === 2026)!;
    expect(y2026.base).toBeNull();
    expect(y2026.bear).toBe(240_000_000 * 13.5);
    expect(y2026.bull).toBe(240_000_000 * 15.5);
  });

  it("emits null (not 0) for a missing multiple", () => {
    const rows = buildCompsTable(
      makeInputs({
        peer_multiple: {
          median: 14.5,
          p25: null,
          p75: 15.5,
          n_peers: 14,
          n_sec_verified: 2,
        },
      }),
    );
    const y2026 = rows.find((r) => r.year === 2026)!;
    expect(y2026.bear).toBeNull();
    expect(y2026.bear).not.toBe(0);
  });
});

describe("clampGrowth", () => {
  it("bounds to [GROWTH_MIN, GROWTH_MAX] = [-0.5, 3.0]", () => {
    expect(GROWTH_MIN).toBe(-0.5);
    expect(GROWTH_MAX).toBe(3.0);
    expect(clampGrowth(-2)).toBe(-0.5);
    expect(clampGrowth(5)).toBe(3.0);
  });

  it("passes an in-range value through unchanged", () => {
    expect(clampGrowth(0.45)).toBe(0.45);
    expect(clampGrowth(GROWTH_MIN)).toBe(-0.5);
    expect(clampGrowth(GROWTH_MAX)).toBe(3.0);
  });

  it("returns null for non-finite / absent input (never fabricated)", () => {
    expect(clampGrowth(NaN)).toBeNull();
    expect(clampGrowth(null)).toBeNull();
    expect(clampGrowth(undefined)).toBeNull();
    expect(clampGrowth(Infinity)).toBeNull();
  });
});

describe("buildCompsTable — overrides", () => {
  it("a single growth override recomputes ALL three columns from that one rate", () => {
    const rows = buildCompsTable(makeInputs(), { growth: 0.1 });
    const y2027 = rows.find((r) => r.year === 2027)!; // n = 1
    // Every column now compounds at 1.10, but keeps its own default percentile.
    expect(y2027.bear).toBeCloseTo(240_000_000 * 1.1 * 13.5, 0);
    expect(y2027.base).toBeCloseTo(240_000_000 * 1.1 * 14.5, 0);
    expect(y2027.bull).toBeCloseTo(240_000_000 * 1.1 * 15.5, 0);
  });

  it("multiplePercentile override applies the one chosen percentile to all columns", () => {
    const rows = buildCompsTable(makeInputs(), {
      growth: 0.1,
      multiplePercentile: "p25",
    });
    const y2026 = rows.find((r) => r.year === 2026)!; // n = 0 → no growth factor
    // base 2026 cell = base_revenue × p25 when the percentile is overridden.
    expect(y2026.base).toBe(240_000_000 * 13.5);
    expect(y2026.bear).toBe(240_000_000 * 13.5);
    expect(y2026.bull).toBe(240_000_000 * 13.5);
  });

  it("clamps an out-of-range override growth via clampGrowth before use", () => {
    const rows = buildCompsTable(makeInputs(), { growth: 99 });
    const y2027 = rows.find((r) => r.year === 2027)!; // n = 1, growth clamped to 3.0
    expect(y2027.base).toBeCloseTo(240_000_000 * (1 + GROWTH_MAX) * 14.5, 0);
  });
});
