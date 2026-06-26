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
    source: p.source ?? "grok:x",
    basis: p.basis ?? null,
    sec_verified: p.sec_verified ?? false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
  };
}

describe("buildCompetitorRanking", () => {
  const target = {
    name: "Replit",
    valuation: 3_000_000_000,
    valuationDate: "2025-09-10",
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
