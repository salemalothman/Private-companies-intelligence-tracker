import { describe, expect, it } from "vitest";
import {
  computePeerMultiple,
  deriveBaseRevenue,
  normalizeSections,
} from "@/lib/agents/deep-dive";
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

describe("normalizeSections", () => {
  const lf = (text: string) => ({
    text,
    basis: "estimate" as const,
    confidence: "med" as const,
  });

  it("maps a full raw object into the typed shape, clamping all ratings", () => {
    const raw = {
      executive_summary: {
        thesis: lf("thesis"),
        strengths: [lf("s1"), lf("s2")],
        weaknesses: [lf("w1")],
      },
      technology: { narrative: lf("tech"), moat_rating: 8 },
      product_portfolio: lf("products"),
      vertical_customer: lf("verticals"),
      business_model: lf("model"),
      unit_economics: lf("econ"),
      market_opportunity: { tam: lf("$Xbn"), sam: lf("$Ybn"), som: lf("$Zbn") },
      strategic_moat: {
        switching_costs: 7,
        network_flywheel: 9,
        distribution_regulatory: 4,
        ip: 6,
        narrative: lf("moat"),
      },
      historical_analogue: lf("analogue"),
      outlook_and_exit: lf("outlook"),
      ic_conclusion: {
        rating: "buy",
        bull: lf("bull"),
        bear: lf("bear"),
        recommendation: lf("rec"),
      },
    };
    const s = normalizeSections(raw);
    expect(s.technology?.moat_rating).toBe(8);
    expect(s.strategic_moat?.switching_costs).toBe(7);
    expect(s.strategic_moat?.network_flywheel).toBe(9);
    expect(s.executive_summary?.strengths).toHaveLength(2);
    expect(s.market_opportunity?.tam?.text).toBe("$Xbn");
    expect(s.ic_conclusion?.rating).toBe("buy");
    expect(s.historical_analogue?.text).toBe("analogue");
  });

  it("drops an ic rating that is not one of the four enum values", () => {
    const s = normalizeSections({ ic_conclusion: { rating: "invalid", bull: lf("b") } });
    expect(s.ic_conclusion?.rating).toBeUndefined();
    expect(s.ic_conclusion?.bull?.text).toBe("b");
  });

  it("strips probability/price-target keys from outlook_and_exit (guardrail)", () => {
    const raw = {
      outlook_and_exit: {
        text: "outlook narrative",
        basis: "estimate",
        confidence: "med",
        probability: 0.7,
        price_target: 100,
      },
    };
    const s = normalizeSections(raw);
    expect(s.outlook_and_exit?.text).toBe("outlook narrative");
    expect((s.outlook_and_exit as unknown as Record<string, unknown>).probability).toBeUndefined();
    expect((s.outlook_and_exit as unknown as Record<string, unknown>).price_target).toBeUndefined();
  });

  it("clamps an out-of-domain moat_rating (12) to null", () => {
    const s = normalizeSections({ technology: { narrative: lf("t"), moat_rating: 12 } });
    expect(s.technology?.moat_rating).toBeNull();
  });

  it("returns {} for null / undefined / non-object input and never throws", () => {
    expect(normalizeSections(null)).toEqual({});
    expect(normalizeSections(undefined)).toEqual({});
    expect(normalizeSections(42)).toEqual({});
    expect(normalizeSections("nope")).toEqual({});
    expect(normalizeSections([])).toEqual({});
  });
});

describe("normalizeSections competitors", () => {
  const lf = (text: string) => ({
    text,
    basis: "estimate" as const,
    confidence: "med" as const,
  });

  const allowed = ["Target Co", "Cursor", "Cognition", "Lovable"];

  it("preserves a full competitors object with in-list threats + valid tiers", () => {
    const raw = {
      competitors: {
        threat_tiers: {
          Cursor: "direct",
          Cognition: "indirect",
          Lovable: "emerging",
        },
        capability_matrix: {
          target: "Target Co",
          threats: [
            {
              name: "Cursor",
              ip_depth: 8,
              gtm_velocity: 9,
              capital_efficiency: 6,
              workflow_retention: 7,
            },
            {
              name: "Cognition",
              ip_depth: 5,
              gtm_velocity: 4,
              capital_efficiency: 3,
              workflow_retention: 6,
            },
            {
              name: "Lovable",
              ip_depth: 2,
              gtm_velocity: 3,
              capital_efficiency: 4,
              workflow_retention: 5,
            },
          ],
        },
        narrative: lf("competitive picture"),
      },
    };
    const s = normalizeSections(raw, allowed);
    expect(s.competitors?.threat_tiers).toEqual({
      Cursor: "direct",
      Cognition: "indirect",
      Lovable: "emerging",
    });
    expect(s.competitors?.capability_matrix?.target).toBe("Target Co");
    expect(s.competitors?.capability_matrix?.threats).toHaveLength(3);
    expect(s.competitors?.capability_matrix?.threats[0]).toEqual({
      name: "Cursor",
      ip_depth: 8,
      gtm_velocity: 9,
      capital_efficiency: 6,
      workflow_retention: 7,
    });
    expect(s.competitors?.narrative?.text).toBe("competitive picture");
  });

  it("drops an unknown tier value and keeps a valid one", () => {
    const s = normalizeSections(
      { competitors: { threat_tiers: { Cursor: "unknown", Cognition: "direct" } } },
      allowed,
    );
    expect(s.competitors?.threat_tiers).toEqual({ Cognition: "direct" });
  });

  it("drops a tier name that is not in the allow-list (case-insensitive match kept)", () => {
    const s = normalizeSections(
      { competitors: { threat_tiers: { NotRanked: "direct", cursor: "indirect" } } },
      allowed,
    );
    // "cursor" matches "Cursor" case-insensitively; "NotRanked" is dropped.
    expect(s.competitors?.threat_tiers).toEqual({ cursor: "indirect" });
  });

  it("drops a matrix threat whose name is not in the allow-list", () => {
    const s = normalizeSections(
      {
        competitors: {
          capability_matrix: {
            target: "Target Co",
            threats: [
              { name: "Cursor", ip_depth: 5, gtm_velocity: 5, capital_efficiency: 5, workflow_retention: 5 },
              { name: "Ghost", ip_depth: 5, gtm_velocity: 5, capital_efficiency: 5, workflow_retention: 5 },
            ],
          },
        },
      },
      allowed,
    );
    const threats = s.competitors?.capability_matrix?.threats ?? [];
    expect(threats).toHaveLength(1);
    expect(threats[0].name).toBe("Cursor");
  });

  it("caps matrix threats at the first 3 after filtering", () => {
    const s = normalizeSections(
      {
        competitors: {
          capability_matrix: {
            target: "Target Co",
            threats: [
              { name: "Cursor", ip_depth: 5, gtm_velocity: 5, capital_efficiency: 5, workflow_retention: 5 },
              { name: "Cognition", ip_depth: 5, gtm_velocity: 5, capital_efficiency: 5, workflow_retention: 5 },
              { name: "Lovable", ip_depth: 5, gtm_velocity: 5, capital_efficiency: 5, workflow_retention: 5 },
              { name: "Target Co", ip_depth: 5, gtm_velocity: 5, capital_efficiency: 5, workflow_retention: 5 },
            ],
          },
        },
      },
      allowed,
    );
    expect(s.competitors?.capability_matrix?.threats).toHaveLength(3);
  });

  it("clamps out-of-domain matrix scores (0 or 12) to null", () => {
    const s = normalizeSections(
      {
        competitors: {
          capability_matrix: {
            target: "Target Co",
            threats: [
              { name: "Cursor", ip_depth: 0, gtm_velocity: 12, capital_efficiency: 5, workflow_retention: 8 },
            ],
          },
        },
      },
      allowed,
    );
    const t = s.competitors?.capability_matrix?.threats[0];
    expect(t?.ip_depth).toBeNull();
    expect(t?.gtm_velocity).toBeNull();
    expect(t?.capital_efficiency).toBe(5);
    expect(t?.workflow_retention).toBe(8);
  });

  it("yields no competitors key for empty / absent competitors input", () => {
    expect(normalizeSections({}, allowed).competitors).toBeUndefined();
    expect(normalizeSections({ competitors: {} }, allowed).competitors).toBeUndefined();
    expect(normalizeSections({ competitors: 42 }, allowed).competitors).toBeUndefined();
  });

  it("enum-coerces tiers with an empty allow-list (back-compat, no name filtering)", () => {
    const s = normalizeSections({
      competitors: { threat_tiers: { AnyName: "direct", Bogus: "sideways" } },
    });
    // Empty allow-list: names are not filtered, but tier still enum-coerced.
    expect(s.competitors?.threat_tiers).toEqual({ AnyName: "direct" });
  });
});

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
