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
  it("cleanly maps multi-word and domain source labels", () => {
    expect(provider("AG Dillon")).toBe("agdillon");
    expect(provider("SEC EDGAR (Form D)")).toBe("sec-edgar");
    expect(provider("private-market aggregate (unverified)")).toBe("aggregate");
    expect(provider("unverified — primary source pending")).toBe("unverified");
    expect(provider("techcrunch.com")).toBe("techcrunch.com");
    expect(provider("bloomberg.com")).toBe("bloomberg.com");
  });
  it("normalizes any akta source to the stable \"akta\" provider key", () => {
    expect(provider("akta.pro")).toBe("akta");
    expect(provider("akta.pro:news")).toBe("akta");
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

  // Regression (sync-overwrite bug): a NEWER bare tool parse (exa/grok, tier 3)
  // must never out-headline the reconciled market cache (tier 2). Observed live:
  // sync's exa rows ($380B Jun 12 / $70B Jul 4) replaced the $1T/$30B market
  // consensus of May 28 purely by recency.
  it("market-cache consensus beats a newer bare tool parse", () => {
    const co = {
      ...company([
        { post_money: 380e9, date: "2026-06-12", source: "exa" },
        { post_money: 380e9, date: "2026-02-12", source: "grok:x:social" },
      ]),
      revenue: 70e9,
      revenue_source: "exa",
      revenue_date: "2026-07-04",
    } as unknown as CompanyWithRelations;
    const rec = buildCanonicalRecord(co, {
      market: {
        source: "private-market aggregate (unverified)",
        valuation: 1e12,
        valuation_date: "2026-05-28",
        revenue: 30e9,
        as_of: "2026-05-28",
      },
      self: {
        source: "private-market aggregate (unverified) (cache)",
        valuation: 1e12,
        revenue: 30e9,
        valuation_date: "2026-05-28",
      },
    });
    expect(rec.valuation.value).toBe(1e12);
    expect(rec.valuation.asOf).toBe("2026-05-28");
    expect(rec.revenue.value).toBe(30e9);
    // The diverging tool parses stay visible and still raise the conflict flag.
    expect(rec.valuation.conflict).toBe(true);
  });

  it("prefers the akta observation when two trusted sources tie on date", () => {
    const rec = buildCanonicalRecord(
      company([
        { post_money: 90e9, date: "2026-05-01", source: "techcrunch.com" },
        { post_money: 100e9, date: "2026-05-01", source: "akta.pro" },
      ]),
    );
    // Both are tier-1 trusted and same-dated; akta wins the duplicate tie-break.
    expect(rec.valuation.value).toBe(100e9);
    expect(rec.valuation.asOf).toBe("2026-05-01");
  });

  it("a primary-verified publisher beats the market cache even when older", () => {
    const rec = buildCanonicalRecord(
      company([{ post_money: 500e9, date: "2026-05-01", source: "techcrunch.com" }]),
      {
        market: {
          source: "private-market aggregate (unverified)",
          valuation: 1e12,
          valuation_date: "2026-05-28",
          revenue: null,
          as_of: "2026-05-28",
        },
      },
    );
    expect(rec.valuation.value).toBe(500e9); // tier 1 outranks tier 2
  });
});
