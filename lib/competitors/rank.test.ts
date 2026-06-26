import { describe, expect, it } from "vitest";
import { buildCompetitorRanking } from "@/lib/competitors/rank";
import type { CompetitorRow } from "@/lib/types";

function comp(p: Partial<CompetitorRow>): CompetitorRow {
  return {
    id: p.id ?? crypto.randomUUID(),
    company_id: "co",
    user_id: "u",
    name: p.name ?? "Rival",
    valuation: p.valuation ?? null,
    valuation_date: p.valuation_date ?? null,
    revenue: p.revenue ?? null,
    revenue_basis: p.revenue_basis ?? null,
    source: p.source ?? "grok:x",
    basis: p.basis ?? null,
    sec_verified: p.sec_verified ?? false,
    is_self: p.is_self ?? false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

describe("buildCompetitorRanking", () => {
  const target = {
    name: "Replit",
    valuation: 3_000_000_000,
    valuationDate: "2025-09-10",
    revenue: 100_000_000,
  };

  it("includes the target and sorts by valuation, highest first", () => {
    const ranked = buildCompetitorRanking(target, [
      comp({ name: "Cursor", valuation: 9_000_000_000 }),
      comp({ name: "Vercel", valuation: 3_250_000_000 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual(["Cursor", "Vercel", "Replit"]);
    expect(ranked.find((r) => r.name === "Replit")!.isTarget).toBe(true);
  });

  it("places unknown valuations last, name-ordered", () => {
    const ranked = buildCompetitorRanking(target, [
      comp({ name: "Zeta", valuation: null }),
      comp({ name: "Alpha", valuation: null }),
      comp({ name: "Cursor", valuation: 9_000_000_000 }),
    ]);
    expect(ranked.map((r) => r.name)).toEqual([
      "Cursor",
      "Replit",
      "Alpha",
      "Zeta",
    ]);
  });

  it("computes the valuation-to-revenue multiple, null when revenue missing", () => {
    const ranked = buildCompetitorRanking(target, [
      comp({ name: "Cursor", valuation: 9_000_000_000, revenue: 300_000_000 }),
      comp({ name: "Cognition", valuation: 10_000_000_000, revenue: null }),
    ]);
    const by = (n: string) => ranked.find((r) => r.name === n)!;
    expect(by("Replit").multiple).toBeCloseTo(30); // 3B / 100M
    expect(by("Cursor").multiple).toBeCloseTo(30); // 9B / 300M
    expect(by("Cognition").multiple).toBeNull(); // no revenue
  });

  it("carries through provenance + sec verification for competitors", () => {
    const ranked = buildCompetitorRanking(target, [
      comp({
        name: "Cursor",
        valuation: 9_000_000_000,
        basis: "Series C per @AaronGDillon",
        sec_verified: true,
      }),
    ]);
    const cursor = ranked.find((r) => r.name === "Cursor")!;
    expect(cursor.basis).toBe("Series C per @AaronGDillon");
    expect(cursor.secVerified).toBe(true);
    expect(cursor.isTarget).toBe(false);
  });
});
