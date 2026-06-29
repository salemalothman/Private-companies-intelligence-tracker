import { describe, expect, it } from "vitest";
import type {
  CompanyWithRelations,
  FundingRound,
  Investment,
  Valuation,
} from "@/lib/types";
import {
  companyChangePct,
  companyInvested,
  companyTableRow,
  currentOwnershipPct,
  currentValue,
  currentValueOrCost,
  dealAnalytics,
  dealFees,
  entryValuation,
  fundAnalytics,
  grossIRR,
  holdingYears,
  impliedEntryPrice,
  initialOwnershipFraction,
  investmentEntryPoint,
  latestValuation,
  moic,
  portfolioSummary,
  portfolioValueSeries,
  previousValuation,
  sectorAllocation,
  sharesHeld,
  topPerformers,
} from "@/lib/metrics";

function inv(p: Partial<Investment>): Investment {
  return {
    id: crypto.randomUUID(),
    company_id: "c",
    user_id: "u",
    investment_date: "2023-01-01",
    amount: 0,
    share_price: null,
    shares: null,
    ownership_pct: null,
    investor_name: null,
    round: null,
    terms: null,
    notes: null,
    created_at: "2023-01-01",
    ...p,
  };
}

function val(p: Partial<Valuation>): Valuation {
  return {
    id: crypto.randomUUID(),
    company_id: "c",
    date: "2023-01-01",
    round: null,
    pre_money: null,
    post_money: null,
    share_price: null,
    source: null,
    confidence: "medium",
    created_at: "2023-01-01",
    ...p,
  };
}

function round(p: Partial<FundingRound>): FundingRound {
  return {
    id: crypto.randomUUID(),
    company_id: "c",
    round: "Seed",
    date: "2023-01-01",
    amount_raised: null,
    valuation: null,
    investors: null,
    lead_investor: null,
    share_price: null,
    source: null,
    created_at: "2023-01-01",
    ...p,
  };
}

function company(p: Partial<CompanyWithRelations>): CompanyWithRelations {
  return {
    id: "c",
    user_id: "u",
    name: "Acme",
    website: null,
    logo_url: null,
    sector: "AI",
    country: "US",
    founded_year: null,
    founders: null,
    description: null,
    status: "active",
    realized_proceeds: 0,
    carry_pct: null,
    mgmt_fee_pct: null,
    revenue: null,
    revenue_source: null,
    revenue_date: null,
    created_at: "2023-01-01",
    updated_at: "2023-01-01",
    investments: [],
    valuations: [],
    funding_rounds: [],
    news: [],
    ...p,
  };
}

describe("valuation selection", () => {
  it("picks the latest and previous by date", () => {
    const c = company({
      valuations: [
        val({ date: "2023-01-01", post_money: 50_000_000 }),
        val({ date: "2025-01-01", post_money: 1_000_000_000 }),
        val({ date: "2024-01-01", post_money: 250_000_000 }),
      ],
    });
    expect(latestValuation(c.valuations)?.post_money).toBe(1_000_000_000);
    expect(previousValuation(c.valuations)?.post_money).toBe(250_000_000);
  });

  it("prefers post-money, falls back to pre-money", () => {
    const c = company({
      valuations: [val({ date: "2024-01-01", pre_money: 200_000_000 })],
    });
    expect(latestValuation(c.valuations)?.pre_money).toBe(200_000_000);
  });
});

describe("invested + ownership + current value", () => {
  it("sums invested capital across rounds", () => {
    const c = company({
      investments: [inv({ amount: 500_000 }), inv({ amount: 250_000 })],
    });
    expect(companyInvested(c)).toBe(750_000);
  });

  it("uses the most recent investment's ownership", () => {
    const c = company({
      investments: [
        inv({ investment_date: "2023-01-01", ownership_pct: 1.0 }),
        inv({ investment_date: "2024-06-01", ownership_pct: 0.6 }),
      ],
    });
    expect(currentOwnershipPct(c)).toBe(0.6);
  });

  it("estimates current value as ownership % × latest valuation", () => {
    const c = company({
      investments: [inv({ ownership_pct: 0.05 })],
      valuations: [val({ date: "2025-01-01", post_money: 2_000_000_000 })],
    });
    // 0.05% of $2B = $1,000,000
    expect(currentValue(c)).toBe(1_000_000);
  });

  it("falls back to cost basis when no valuation exists", () => {
    const c = company({ investments: [inv({ amount: 300_000 })] });
    expect(currentValue(c)).toBeNull();
    expect(currentValueOrCost(c)).toBe(300_000);
  });
});

describe("change %", () => {
  it("computes round-over-round growth", () => {
    const c = company({
      valuations: [
        val({ date: "2024-01-01", post_money: 250_000_000 }),
        val({ date: "2025-01-01", post_money: 1_000_000_000 }),
      ],
    });
    expect(companyChangePct(c)).toBeCloseTo(3.0); // +300%
  });

  it("returns null with a single valuation", () => {
    const c = company({ valuations: [val({ post_money: 100 })] });
    expect(companyChangePct(c)).toBeNull();
  });
});

describe("portfolio summary", () => {
  it("aggregates invested, value, gain, and return %", () => {
    const a = company({
      id: "a",
      investments: [inv({ amount: 1_000_000, ownership_pct: 0.1 })],
      valuations: [val({ date: "2025-01-01", post_money: 3_000_000_000 })],
    });
    // value = 0.1% of $3B = $3,000,000
    const b = company({
      id: "b",
      sector: "Fintech",
      investments: [inv({ amount: 4_000_000 })], // no valuation -> cost basis
    });
    const s = portfolioSummary([a, b]);
    expect(s.totalInvested).toBe(5_000_000);
    expect(s.portfolioValue).toBe(7_000_000); // 3M + 4M
    expect(s.unrealizedGain).toBe(2_000_000);
    expect(s.totalReturnPct).toBeCloseTo(0.4); // +40%
    expect(s.companyCount).toBe(2);
  });

  it("handles an empty portfolio", () => {
    const s = portfolioSummary([]);
    expect(s.totalInvested).toBe(0);
    expect(s.portfolioValue).toBe(0);
    expect(s.totalReturnPct).toBeNull();
  });
});

describe("aggregations", () => {
  it("groups allocation by sector", () => {
    const a = company({ id: "a", sector: "AI", investments: [inv({ amount: 100 })] });
    const b = company({ id: "b", sector: "AI", investments: [inv({ amount: 200 })] });
    const c = company({ id: "c", sector: "Fintech", investments: [inv({ amount: 50 })] });
    const alloc = sectorAllocation([a, b, c]);
    expect(alloc[0]).toEqual({ sector: "AI", value: 300 });
    expect(alloc.find((s) => s.sector === "Fintech")?.value).toBe(50);
  });

  it("ranks top performers by change %", () => {
    const a = company({
      id: "a",
      name: "A",
      valuations: [
        val({ date: "2024-01-01", post_money: 100 }),
        val({ date: "2025-01-01", post_money: 400 }),
      ],
    });
    const b = company({
      id: "b",
      name: "B",
      valuations: [
        val({ date: "2024-01-01", post_money: 100 }),
        val({ date: "2025-01-01", post_money: 150 }),
      ],
    });
    const top = topPerformers([b, a]);
    expect(top[0].name).toBe("A"); // +300% beats +50%
  });

  it("builds a portfolio value time series", () => {
    const a = company({
      id: "a",
      investments: [inv({ ownership_pct: 10 })],
      valuations: [
        val({ date: "2023-01-01", post_money: 1000 }),
        val({ date: "2024-01-01", post_money: 2000 }),
      ],
    });
    const series = portfolioValueSeries([a]);
    expect(series).toHaveLength(2);
    expect(series[0]).toEqual({ date: "2023-01-01", value: 100 }); // 10% of 1000
    expect(series[1]).toEqual({ date: "2024-01-01", value: 200 }); // 10% of 2000
  });
});


describe("investment analytics", () => {
  const now = new Date("2026-06-23");

  it("derives entry valuation, implied price, shares, and initial ownership", () => {
    const c = company({
      investments: [
        inv({ investment_date: "2026-06-22", amount: 360_000, shares: 1286 }),
      ],
      valuations: [val({ date: "2026-06-22", post_money: 10_120_000_000 })],
    });
    expect(entryValuation(c)).toBe(10_120_000_000);
    expect(sharesHeld(c)).toBe(1286);
    expect(impliedEntryPrice(c)!).toBeCloseTo(279.94, 1);
    // 360k / 10.12B = 0.00003557 -> ~0.0036%
    expect(initialOwnershipFraction(c)! * 100).toBeCloseTo(0.0036, 4);
    expect(holdingYears(c, now)!).toBeCloseTo(1 / 365.25, 4);
  });

  it("marks the investment entry point at the prevailing valuation", () => {
    const c = company({
      investments: [inv({ investment_date: "2026-06-22", amount: 360_000 })],
      valuations: [
        val({ date: "2023-04-25", post_money: 1_160_000_000 }),
        val({ date: "2026-03-14", post_money: 9_000_000_000 }),
      ],
    });
    // entry date = investment date; value = latest round on/before entry
    expect(investmentEntryPoint(c)).toEqual({
      date: "2026-06-22",
      value: 9_000_000_000,
    });
  });

  it("falls back to ownership-implied valuation when no rounds precede entry", () => {
    const c = company({
      investments: [
        inv({ investment_date: "2025-01-01", amount: 250_000, ownership_pct: 0.5 }),
      ],
      valuations: [],
    });
    // 250k / (0.5/100) = 50M implied valuation
    expect(investmentEntryPoint(c)).toEqual({
      date: "2025-01-01",
      value: 50_000_000,
    });
  });

  it("returns null with no investment date", () => {
    expect(investmentEntryPoint(company({ investments: [] }))).toBeNull();
  });

  it("computes MOIC and annualized gross IRR on a markup", () => {
    const c = company({
      investments: [inv({ investment_date: "2024-06-23", amount: 100_000 })],
      valuations: [
        val({ date: "2024-06-23", post_money: 100_000_000 }),
        val({ date: "2026-06-23", post_money: 300_000_000 }),
      ],
    });
    // value = 100k * (300M/100M) = 300k -> MOIC 3x
    expect(moic(c)).toBeCloseTo(3.0);
    // IRR over ~2y: 3^(1/2)-1 = 0.732
    expect(grossIRR(c, now)!).toBeCloseTo(0.732, 2);
  });

  it("adds realized proceeds into total value and MOIC", () => {
    const c = company({
      realized_proceeds: 50_000,
      investments: [inv({ investment_date: "2025-06-23", amount: 100_000 })],
      valuations: [val({ date: "2025-06-23", post_money: 100_000_000 })],
    });
    const d = dealAnalytics(c, 100_000, { carryPct: 20, mgmtFeePct: 7 }, now);
    expect(d.currentValue).toBe(100_000);
    expect(d.totalValue).toBe(150_000); // 100k current + 50k realized
    expect(d.moic).toBeCloseTo(1.5);
    expect(d.pctOfCost).toBeCloseTo(1.0);
  });

  it("aggregates the fund with carry and management fees", () => {
    const win = company({
      id: "win",
      investments: [inv({ investment_date: "2024-06-23", amount: 100_000 })],
      valuations: [
        val({ date: "2024-06-23", post_money: 100_000_000 }),
        val({ date: "2026-06-23", post_money: 300_000_000 }),
      ],
    });
    const flat = company({
      id: "flat",
      investments: [inv({ investment_date: "2024-06-23", amount: 100_000 })],
      valuations: [val({ date: "2024-06-23", post_money: 100_000_000 })],
    });
    const f = fundAnalytics([win, flat], { carryPct: 20, mgmtFeePct: 7 }, now);
    expect(f.totalInvested).toBe(200_000);
    expect(f.totalValue).toBe(400_000); // 300k + 100k
    expect(f.gainLoss).toBe(200_000);
    expect(f.moic).toBeCloseTo(2.0);
    // carry = 20% of 200k gain = 40k
    expect(f.carry).toBeCloseTo(40_000);
    // mgmt = 7% * invested * ~2y for both = 0.07*200k*2 = 28k
    expect(f.mgmtFees).toBeCloseTo(28_000, -2);
    expect(f.netValue).toBeCloseTo(400_000 - 40_000 - f.mgmtFees);
  });

  it("returns null IRR for future-dated (negative holding) entries", () => {
    const c = company({
      investments: [inv({ investment_date: "2026-07-20", amount: 360_000 })],
      valuations: [val({ date: "2026-07-20", post_money: 2_100_000_000 })],
    });
    expect(holdingYears(c, now)!).toBeLessThan(0);
    expect(grossIRR(c, now)).toBeNull();
  });
});

describe("deal-specific fees", () => {
  const now = new Date("2026-06-23");
  const defaults = { carryPct: 20, mgmtFeePct: 7 };

  function deal(overrides: Partial<CompanyWithRelations>) {
    return company({
      investments: [inv({ investment_date: "2024-06-23", amount: 100_000 })],
      valuations: [
        val({ date: "2024-06-23", post_money: 100_000_000 }),
        val({ date: "2026-06-23", post_money: 300_000_000 }),
      ],
      ...overrides,
    });
  }

  it("uses the fund default when a deal has no override", () => {
    const f = dealFees(deal({}), defaults, now);
    expect(f.carryPct).toBe(20);
    expect(f.mgmtFeePct).toBe(7);
    expect(f.isCustomCarry).toBe(false);
    // value = 300k, gain = 200k -> carry 20% = 40k
    expect(f.carry).toBeCloseTo(40_000);
  });

  it("applies a deal-level carry override instead of the default", () => {
    const f = dealFees(deal({ carry_pct: 30 }), defaults, now);
    expect(f.carryPct).toBe(30);
    expect(f.isCustomCarry).toBe(true);
    expect(f.carry).toBeCloseTo(60_000); // 30% of 200k
    // mgmt still uses default
    expect(f.mgmtFeePct).toBe(7);
  });

  it("computes net value and net MOIC per deal", () => {
    const f = dealFees(deal({ carry_pct: 0, mgmt_fee_pct: 0 }), defaults, now);
    expect(f.carry).toBe(0);
    expect(f.mgmtFee).toBe(0);
    expect(f.netValue).toBe(300_000);
    expect(f.netMoic).toBeCloseTo(3.0);
  });

  it("aggregates carry deal-by-deal (losers don't offset winners' carry)", () => {
    const winner = deal({ id: "w" }); // +200k gain
    const loser = company({
      id: "l",
      investments: [inv({ investment_date: "2024-06-23", amount: 100_000 })],
      valuations: [
        val({ date: "2024-06-23", post_money: 100_000_000 }),
        val({ date: "2026-06-23", post_money: 40_000_000 }), // down -> -60k
      ],
    });
    const f = fundAnalytics([winner, loser], defaults, now);
    // Deal-by-deal: carry = 20% of winner's 200k = 40k (loser contributes 0).
    // A flat whole-fund waterfall on net gain (200k-60k=140k) would be only 28k.
    expect(f.carry).toBeCloseTo(40_000);
  });

  it("mixes per-deal overrides in the fund aggregate", () => {
    const a = deal({ id: "a", carry_pct: 10 }); // 10% of 200k = 20k
    const b = deal({ id: "b", carry_pct: 30 }); // 30% of 200k = 60k
    const f = fundAnalytics([a, b], defaults, now);
    expect(f.carry).toBeCloseTo(80_000);
  });
});

describe("company table row", () => {
  it("assembles the row shape used by the dashboard table", () => {
    const c = company({
      investments: [
        inv({ investment_date: "2023-06-01", amount: 500_000, ownership_pct: 0.05 }),
      ],
      valuations: [
        val({ date: "2024-01-01", round: "Series A", post_money: 250_000_000 }),
        val({ date: "2025-01-01", round: "Series B", post_money: 1_000_000_000 }),
      ],
      funding_rounds: [round({ round: "Series B", date: "2025-01-01" })],
    });
    const r = companyTableRow(c);
    expect(r.amountInvested).toBe(500_000);
    expect(r.ownershipPct).toBe(0.05);
    expect(r.lastValuation).toBe(1_000_000_000);
    expect(r.previousValuation).toBe(250_000_000);
    expect(r.changePct).toBeCloseTo(3.0);
    expect(r.lastFundingRound).toBe("Series B");
    expect(r.investmentDate).toBe("2023-06-01");
  });
});
