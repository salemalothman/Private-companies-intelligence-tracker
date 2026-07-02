import { describe, expect, it } from "vitest";
import { computePeerMultiple, deriveBaseRevenue } from "@/lib/agents/deep-dive";
import { clampRating } from "@/lib/agents/deep-dive-types";
import type { RankedEntity } from "@/lib/competitors/rank";
import type { CanonicalRecord } from "@/lib/canonical";

describe("clampRating", () => {
  it("passes a valid in-domain integer through unchanged", () => {
    expect(clampRating(5)).toBe(5);
    expect(clampRating(1)).toBe(1);
    expect(clampRating(10)).toBe(10);
  });

  it("rejects out-of-domain values as null (never fabricated beyond 1-10)", () => {
    expect(clampRating(0)).toBeNull();
    expect(clampRating(11)).toBeNull();
    expect(clampRating(-3)).toBeNull();
    expect(clampRating(12)).toBeNull();
  });

  it("floors fractional ratings to an integer within domain", () => {
    expect(clampRating(7.8)).toBe(7);
    expect(clampRating(1.9)).toBe(1);
  });

  it("returns null for non-finite / missing input", () => {
    expect(clampRating(null)).toBeNull();
    expect(clampRating(undefined)).toBeNull();
    expect(clampRating(NaN)).toBeNull();
    expect(clampRating(Infinity)).toBeNull();
  });
});

function peer(p: Partial<RankedEntity>): RankedEntity {
  return {
    name: p.name ?? "Peer",
    valuation: p.valuation ?? null,
    valuationDate: p.valuationDate ?? null,
    revenue: p.revenue ?? null,
    multiple: p.multiple ?? null,
    basis: p.basis ?? null,
    source: p.source ?? null,
    secVerified: p.secVerified ?? false,
    isTarget: p.isTarget ?? false,
  };
}

describe("computePeerMultiple", () => {
  it("computes median/p25/p75 across SEC-verified peers with finite multiples", () => {
    const ranked = [
      peer({ name: "Target", multiple: 99, secVerified: false, isTarget: true }),
      peer({ name: "A", multiple: 2, secVerified: true }),
      peer({ name: "B", multiple: 4, secVerified: true }),
      peer({ name: "C", multiple: 6, secVerified: true }),
      peer({ name: "D", multiple: 8, secVerified: true }),
    ];
    const pm = computePeerMultiple(ranked);
    // R-7 (Excel PERCENTILE.INC) linear-interpolation over [2,4,6,8]:
    // median=5, p25=3.5, p75=6.5.
    expect(pm.median).toBeCloseTo(5);
    expect(pm.p25).toBeCloseTo(3.5);
    expect(pm.p75).toBeCloseTo(6.5);
    expect(pm.n_sec_verified).toBe(4);
    expect(pm.n_peers).toBe(4); // 4 non-target ranked peers
  });

  it("excludes the target and non-SEC-verified / null-multiple peers from percentiles", () => {
    const ranked = [
      peer({ name: "Target", multiple: 100, isTarget: true, secVerified: true }),
      peer({ name: "Verified", multiple: 10, secVerified: true }),
      peer({ name: "Unverified", multiple: 999, secVerified: false }),
      peer({ name: "NoMultiple", multiple: null, secVerified: true }),
    ];
    const pm = computePeerMultiple(ranked);
    // Only "Verified" (10) feeds the percentiles.
    expect(pm.median).toBeCloseTo(10);
    expect(pm.p25).toBeCloseTo(10);
    expect(pm.p75).toBeCloseTo(10);
    expect(pm.n_sec_verified).toBe(1);
    expect(pm.n_peers).toBe(3); // three non-target peers considered
  });

  it("returns all-null percentiles (never fabricated) when no SEC-verified peer has a multiple", () => {
    const ranked = [
      peer({ name: "Target", multiple: 100, isTarget: true }),
      peer({ name: "Unverified", multiple: 12, secVerified: false }),
      peer({ name: "VerifiedNoMultiple", multiple: null, secVerified: true }),
    ];
    const pm = computePeerMultiple(ranked);
    expect(pm.median).toBeNull();
    expect(pm.p25).toBeNull();
    expect(pm.p75).toBeNull();
    expect(pm.n_sec_verified).toBe(0);
    expect(pm.n_peers).toBe(2);
  });
});

describe("deriveBaseRevenue", () => {
  function canonical(revenue: CanonicalRecord["revenue"]): CanonicalRecord {
    return {
      valuation: { value: null, asOf: null, observations: [], corroboration: 0, conflict: false },
      revenue,
      multiple: null,
      sources: [],
    };
  }

  it("reads the canonical revenue value + its as-of source, never inventing", () => {
    const rec = canonical({
      value: 100_000_000,
      asOf: "2025-06-01",
      observations: [
        { source: "exa", value: 90_000_000, date: "2024-01-01" },
        { source: "sec-edgar", value: 100_000_000, date: "2025-06-01" },
      ],
      corroboration: 1,
      conflict: false,
    });
    const br = deriveBaseRevenue(rec);
    expect(br.value).toBe(100_000_000);
    expect(br.source).toBe("sec-edgar");
  });

  it("returns null value + null source when revenue is unknown", () => {
    const rec = canonical({
      value: null,
      asOf: null,
      observations: [],
      corroboration: 0,
      conflict: false,
    });
    const br = deriveBaseRevenue(rec);
    expect(br.value).toBeNull();
    expect(br.source).toBeNull();
  });
});
