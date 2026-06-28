import { describe, expect, it } from "vitest";
import { buildCanonicalRecord, provider } from "@/lib/canonical";
import type { CompanyWithRelations } from "@/lib/types";

const company = (valuations: { post_money: number; date: string; source: string }[]) =>
  ({
    id: "c",
    name: "Acme",
    valuations: valuations.map((v) => ({ ...v, round: null })),
    investments: [],
    funding_rounds: [],
    news: [],
  }) as unknown as CompanyWithRelations;

describe("provider", () => {
  it("reduces source labels to providers", () => {
    expect(provider("grok:x:social")).toBe("grok");
    expect(provider("agdillon (cache)")).toBe("agdillon");
    expect(provider("pdf:deck.pdf")).toBe("document");
    expect(provider("Manual entry")).toBe("manual");
    expect(provider("exa")).toBe("exa");
  });
});

describe("buildCanonicalRecord", () => {
  it("corroborates across agreeing providers and picks the latest", () => {
    const rec = buildCanonicalRecord(
      company([
        { post_money: 9e9, date: "2026-03-11", source: "grok:x" },
        { post_money: 8.9e9, date: "2026-03-10", source: "exa" },
      ]),
      { market: { source: "agdillon", valuation: 9.1e9, valuation_date: "2026-03-12", revenue: 4e9, as_of: "2026-03-12" } },
    );
    expect(rec.valuation.value).toBe(9.1e9); // latest
    expect(rec.valuation.corroboration).toBe(3); // grok, exa, agdillon all within 15%
    expect(rec.valuation.conflict).toBe(false);
    expect(rec.revenue.value).toBe(4e9);
    expect(rec.sources).toContain("agdillon");
  });

  it("flags a conflict when a provider diverges materially", () => {
    const rec = buildCanonicalRecord(
      company([
        { post_money: 9e9, date: "2026-03-11", source: "grok:x" },
        { post_money: 3e9, date: "2026-03-01", source: "exa" }, // -67%
      ]),
    );
    expect(rec.valuation.value).toBe(9e9);
    expect(rec.valuation.conflict).toBe(true);
    expect(rec.valuation.corroboration).toBe(1); // only grok agrees with itself
  });

  it("does not flag historical rounds (far apart in time) as conflicts", () => {
    const rec = buildCanonicalRecord(
      company([
        { post_money: 9e9, date: "2026-03-11", source: "grok:x" },
        { post_money: 1.16e9, date: "2023-04-25", source: "exa" }, // old round
      ]),
    );
    expect(rec.valuation.value).toBe(9e9);
    expect(rec.valuation.conflict).toBe(false);
    expect(rec.valuation.observations).toHaveLength(1); // only contemporaneous
  });

  it("handles no data", () => {
    const rec = buildCanonicalRecord(company([]));
    expect(rec.valuation.value).toBeNull();
    expect(rec.valuation.corroboration).toBe(0);
  });
});
