import { describe, expect, it } from "vitest";
import {
  nameKey,
  parseClause,
  parseMarketData,
  type Segment,
} from "@/lib/market-cache/parse";

const D = "2026-06-20";

describe("parseClause", () => {
  const cases: Array<[string, { name: string; valuation?: number; revenue?: number }]> = [
    ["Mistral AI raise at $20B", { name: "Mistral AI", valuation: 20e9 }],
    ["Databricks to raise at $165B", { name: "Databricks", valuation: 165e9 }],
    ["Ramp's new $44b valuation", { name: "Ramp", valuation: 44e9 }],
    ["Anthropic at $900b valuation", { name: "Anthropic", valuation: 900e9 }],
    ["SpaceX at $1.473T valuation", { name: "SpaceX", valuation: 1.473e12 }],
    ["Revolut $200b IPO target", { name: "Revolut", valuation: 200e9 }],
    ["Legora (legal) raises at $5.9b", { name: "Legora", valuation: 5.9e9 }],
    ["China's DeepSeek raise at $50B", { name: "DeepSeek", valuation: 50e9 }],
    ["Cursor acquired by SpaceX for $60B, stock", { name: "Cursor", valuation: 60e9 }],
    ["Supabase 2x to $10B", { name: "Supabase", valuation: 10e9 }],
    ["Cursor ARR hits $4.0B", { name: "Cursor", revenue: 4e9 }],
    ["Lambda hits $1B in revenue", { name: "Lambda", revenue: 1e9 }],
    ["Anthropic $30B revenue, 3x in 3 months!", { name: "Anthropic", revenue: 30e9 }],
    ["Perplexity $500M ARR, 2x in 1 month", { name: "Perplexity", revenue: 500e6 }],
  ];

  for (const [clause, want] of cases) {
    it(`parses "${clause}"`, () => {
      const d = parseClause(clause, D);
      expect(d).not.toBeNull();
      expect(d!.name).toBe(want.name);
      if (want.valuation !== undefined) expect(d!.valuation).toBeCloseTo(want.valuation, -6);
      else expect(d!.valuation).toBeUndefined();
      if (want.revenue !== undefined) expect(d!.revenue).toBeCloseTo(want.revenue, -6);
      else expect(d!.revenue).toBeUndefined();
    });
  }

  it("skips amounts with no valuation/revenue cue", () => {
    expect(parseClause("OpenAI $842B", D)).toBeNull();
  });

  it("skips multiplier-only items with no absolute figure", () => {
    expect(parseClause("Fireworks 3.75x valuation in 8 months", D)).toBeNull();
  });
});

describe("parseMarketData merge", () => {
  it("keeps the latest valuation and revenue per company across issues", () => {
    const segments: Segment[] = [
      { text: "Anthropic at $900b valuation", asOf: "2026-05-02" },
      { text: "Anthropic $30B revenue, 3x in 3 months", asOf: "2026-04-11" },
      { text: "Cursor ARR hits $4.0B; Databricks to raise at $165B", asOf: "2026-06-13" },
      { text: "Cursor acquired by SpaceX for $60B", asOf: "2026-06-20" },
    ];
    const data = parseMarketData(segments);
    const by = (n: string) => data.find((d) => d.nameKey === nameKey(n));

    // Cursor: valuation from the newest issue, revenue from the older one.
    expect(by("Cursor")!.valuation).toBeCloseTo(60e9, -6);
    expect(by("Cursor")!.revenue).toBeCloseTo(4e9, -6);
    // Anthropic carries both a valuation and a revenue figure.
    expect(by("Anthropic")!.valuation).toBeCloseTo(900e9, -6);
    expect(by("Anthropic")!.revenue).toBeCloseTo(30e9, -6);
    expect(by("Databricks")!.valuation).toBeCloseTo(165e9, -6);
  });
});
