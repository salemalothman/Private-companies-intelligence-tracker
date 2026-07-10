import { describe, expect, it } from "vitest";
import type {
  CompanyAnalysisRow,
  CompanyWithRelations,
  CompetitorRow,
  Investment,
  Valuation,
} from "@/lib/types";
import type {
  AnalysisSections,
  AnalysisValuation,
  OverviewSections,
} from "@/lib/agents/deep-dive-types";
import {
  buildCompanyReportModel,
  formatTag,
  slugifyCompanyName,
  type ReportSection,
} from "@/lib/reports/company-report-model";

// --- fixtures -------------------------------------------------------------

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

function company(p: Partial<CompanyWithRelations> = {}): CompanyWithRelations {
  return {
    id: "c",
    user_id: "u",
    name: "Acme Robotics",
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

const FULL_VALUATION: AnalysisValuation = {
  base_revenue: { value: 100_000_000, source: "sec-edgar" },
  current_valuation: 1_000_000_000,
  peer_multiple: { median: 10, p25: 5, p75: 20, n_peers: 6, n_sec_verified: 4 },
  growth: {
    base: 0.3,
    bear: 0.1,
    bull: 0.5,
    confidence: "med",
    rationale: "sector growth",
  },
};

const FULL_SECTIONS: OverviewSections = {
  executive_summary: {
    thesis: { text: "Category leader.", basis: "estimate", confidence: "med" },
    value_prop: { text: "Automates X.", basis: "fact", confidence: "high" },
    strengths: [{ text: "Strong IP.", basis: "fact", confidence: "high" }],
    weaknesses: [{ text: "Concentration.", basis: "estimate", confidence: "low" }],
    positioning: { text: "Top quartile.", basis: "estimate", confidence: "med" },
    most_likely_outcome: { text: "Strategic exit.", basis: "estimate", confidence: "low" },
  },
  technology: {
    narrative: { text: "Proprietary stack.", basis: "fact", confidence: "high" },
    moat_rating: 8,
  },
  business_model: { text: "SaaS + usage.", basis: "fact", confidence: "high" },
  unit_economics: { text: "Improving margins.", basis: "estimate", confidence: "med" },
  historical_financials: {
    gross_margin: { text: "~70%.", basis: "estimate", confidence: "med" },
    burn_rate: { text: "Moderate.", basis: "estimate", confidence: "low" },
  },
  market_opportunity: {
    tam: { text: "$50B+.", basis: "estimate", confidence: "med" },
    sam: { text: "$10B.", basis: "estimate", confidence: "low" },
  },
  strategic_moat: {
    switching_costs: 7,
    network_flywheel: 5,
    distribution_regulatory: null,
    ip: 9,
    narrative: { text: "Sticky workflows.", basis: "estimate", confidence: "med" },
  },
  competitors: {
    threat_tiers: { RivalCo: "direct", AdjacentCo: "indirect" },
    capability_matrix: {
      target: "Acme Robotics",
      threats: [
        {
          name: "RivalCo",
          ip_depth: 6,
          gtm_velocity: 8,
          capital_efficiency: 4,
          workflow_retention: 12, // out of range → null via clampRating
        },
      ],
    },
    narrative: { text: "Two credible threats.", basis: "estimate", confidence: "med" },
  },
  historical_analogue: { text: "Like UiPath 2018.", basis: "estimate", confidence: "low" },
  outlook_and_exit: { text: "IPO window 2028+.", basis: "estimate", confidence: "low" },
  ic_conclusion: {
    rating: "buy",
    bull: { text: "Wins the vertical.", basis: "estimate", confidence: "med" },
    bear: { text: "Compression risk.", basis: "estimate", confidence: "med" },
    recommendation: { text: "Hold and add.", basis: "estimate", confidence: "med" },
  },
};

function analysis(p: Partial<CompanyAnalysisRow> = {}): CompanyAnalysisRow {
  return {
    id: "a",
    company_id: "c",
    user_id: "u",
    generated_at: "2026-07-01T00:00:00Z",
    model: "grok-4.3",
    sections: FULL_SECTIONS as AnalysisSections,
    valuation: FULL_VALUATION,
    created_at: "2026-07-01T00:00:00Z",
    updated_at: "2026-07-01T00:00:00Z",
    ...p,
  };
}

function competitor(p: Partial<CompetitorRow>): CompetitorRow {
  return {
    id: crypto.randomUUID(),
    company_id: "c",
    user_id: "u",
    name: "RivalCo",
    valuation: null,
    valuation_date: null,
    revenue: null,
    revenue_basis: null,
    source: null,
    basis: null,
    sec_verified: false,
    is_self: false,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...p,
  };
}

const OPTS = { generatedAt: "2026-07-10", stale: false };

function section<T extends ReportSection["id"]>(
  sections: ReportSection[],
  id: T,
): Extract<ReportSection, { id: T }> {
  const s = sections.find((x) => x.id === id);
  if (!s) throw new Error(`section ${id} missing`);
  return s as Extract<ReportSection, { id: T }>;
}

// --- section ordering -----------------------------------------------------

describe("buildCompanyReportModel — section ordering", () => {
  it("returns all sections in the approved layout order for a full analysis", () => {
    const m = buildCompanyReportModel(company(), analysis(), [competitor({})], OPTS);
    expect(m.sections.map((s) => s.id)).toEqual([
      "executive_summary",
      "business_moat",
      "competitive_landscape",
      "valuation_comps",
      "historical_analogue",
      "outlook_exit",
      "ic_conclusion",
    ]);
  });

  it("omits absent sections for a partial/legacy row without throwing", () => {
    const m = buildCompanyReportModel(
      company(),
      analysis({ sections: {} }),
      [],
      OPTS,
    );
    expect(m.sections.map((s) => s.id)).toEqual(["valuation_comps"]);
  });

  it("tolerates a legacy row with no valuation at all", () => {
    const legacy = analysis({
      sections: {},
      valuation: null as unknown as AnalysisValuation,
    });
    const m = buildCompanyReportModel(company(), legacy, [], OPTS);
    expect(m.sections).toEqual([]);
  });
});

// --- tag formatting -------------------------------------------------------

describe("formatTag", () => {
  it("renders estimate + med as [est · med]", () => {
    expect(
      formatTag({ text: "x", basis: "estimate", confidence: "med" }),
    ).toBe("[est · med]");
  });

  it("renders fact + high as [fact · high]", () => {
    expect(formatTag({ text: "x", basis: "fact", confidence: "high" })).toBe(
      "[fact · high]",
    );
  });

  it("degrades gracefully when basis is missing", () => {
    expect(formatTag({ text: "x", confidence: "low" })).toBe("[low]");
  });

  it("degrades gracefully when confidence is missing", () => {
    expect(formatTag({ text: "x", basis: "fact" })).toBe("[fact]");
  });

  it("returns null for null/undefined/empty fields", () => {
    expect(formatTag(null)).toBeNull();
    expect(formatTag(undefined)).toBeNull();
    expect(formatTag({ text: "x" })).toBeNull();
  });
});

// --- moat bars ------------------------------------------------------------

describe("moat bars", () => {
  it("maps score/10 to a bar fraction and skips null dimensions", () => {
    const m = buildCompanyReportModel(company(), analysis(), [], OPTS);
    const moat = section(m.sections, "business_moat");
    expect(moat.moatBars).toEqual([
      { label: "Switching costs", score: 7, fraction: 0.7 },
      { label: "Network flywheel", score: 5, fraction: 0.5 },
      { label: "IP", score: 9, fraction: 0.9 },
    ]);
  });

  it("drops out-of-range scores instead of fabricating a clamped value", () => {
    const sections: OverviewSections = {
      strategic_moat: { switching_costs: 12, network_flywheel: 0.5, ip: 9 },
    };
    const m = buildCompanyReportModel(company(), analysis({ sections: sections as AnalysisSections }), [], OPTS);
    const moat = section(m.sections, "business_moat");
    // 12 and 0.5 are outside the honest 1–10 domain → dropped, never clamped.
    expect(moat.moatBars).toEqual([{ label: "IP", score: 9, fraction: 0.9 }]);
  });

  it("omits the whole section when no moat data survives clamping", () => {
    const sections: OverviewSections = {
      strategic_moat: { switching_costs: 12, ip: 0 },
    };
    const m = buildCompanyReportModel(company(), analysis({ sections: sections as AnalysisSections }), [], OPTS);
    expect(m.sections.some((s) => s.id === "business_moat")).toBe(false);
  });
});

// --- comps ----------------------------------------------------------------

describe("valuation comps", () => {
  it("derives 5 rows from buildCompsTable with the stored inputs", () => {
    const m = buildCompanyReportModel(company(), analysis(), [], OPTS);
    const comps = section(m.sections, "valuation_comps");
    expect(comps.rows).toHaveLength(5);
    expect(comps.rows[0].year).toBe(2026);
    // 2026 base cell: 100M × (1.3)^0 × 10 = 1B
    expect(comps.rows[0].base).toBe(1_000_000_000);
    expect(comps.cells[0].base).toBe("$1.00B");
  });

  it("propagates null base_revenue to — cells, never 0", () => {
    const a = analysis({
      valuation: {
        ...FULL_VALUATION,
        base_revenue: { value: null, source: null },
      },
    });
    const m = buildCompanyReportModel(company(), a, [], OPTS);
    const comps = section(m.sections, "valuation_comps");
    for (const c of comps.cells) {
      expect(c.bear).toBe("—");
      expect(c.base).toBe("—");
      expect(c.bull).toBe("—");
    }
  });

  it("propagates null multiples to — cells for the affected scenario", () => {
    const a = analysis({
      valuation: {
        ...FULL_VALUATION,
        peer_multiple: { ...FULL_VALUATION.peer_multiple, p25: null },
      },
    });
    const m = buildCompanyReportModel(company(), a, [], OPTS);
    const comps = section(m.sections, "valuation_comps");
    expect(comps.cells[0].bear).toBe("—");
    expect(comps.cells[0].base).not.toBe("—");
  });

  it("carries the illustrative-comps disclaimer and provenance counts", () => {
    const m = buildCompanyReportModel(company(), analysis(), [], OPTS);
    const comps = section(m.sections, "valuation_comps");
    expect(comps.disclaimer.toLowerCase()).toContain(
      "illustrative comps, not a forecast",
    );
    expect(comps.provenance.nPeers).toBe(6);
    expect(comps.provenance.nSecVerified).toBe(4);
    expect(comps.provenance.baseRevenue).toBe("$100.00M");
    expect(comps.provenance.multiples).toEqual({
      p25: "5.0x",
      median: "10.0x",
      p75: "20.0x",
    });
  });
});

// --- IC badge -------------------------------------------------------------

describe("IC badge mapping", () => {
  const cases: [string, "green" | "muted" | "red", string][] = [
    ["strong_buy", "green", "Strong Buy"],
    ["buy", "green", "Buy"],
    ["hold", "muted", "Hold"],
    ["sell", "red", "Sell"],
  ];
  for (const [rating, color, label] of cases) {
    it(`maps ${rating} → ${color}`, () => {
      const sections: OverviewSections = {
        ic_conclusion: { rating: rating as "buy" },
      };
      const m = buildCompanyReportModel(company(), analysis({ sections: sections as AnalysisSections }), [], OPTS);
      const ic = section(m.sections, "ic_conclusion");
      expect(ic.badge).toEqual({ rating, label, color });
    });
  }

  it("yields a null badge when no rating is stored", () => {
    const sections: OverviewSections = {
      ic_conclusion: {
        recommendation: { text: "Hold.", basis: "estimate", confidence: "med" },
      },
    };
    const m = buildCompanyReportModel(company(), analysis({ sections: sections as AnalysisSections }), [], OPTS);
    expect(section(m.sections, "ic_conclusion").badge).toBeNull();
  });
});

// --- slug -----------------------------------------------------------------

describe("slugifyCompanyName", () => {
  it("produces filesystem-safe slugs", () => {
    expect(slugifyCompanyName("Acme Robotics")).toBe("acme-robotics");
    expect(slugifyCompanyName("Möbius & Co. (US)")).toBe("m-bius-co-us");
    expect(slugifyCompanyName("  --  ")).toBe("company");
  });
});

// --- stale + snapshot -----------------------------------------------------

describe("model metadata", () => {
  it("threads the stale flag through to the model", () => {
    const stale = buildCompanyReportModel(company(), analysis(), [], {
      generatedAt: "2026-07-10",
      stale: true,
    });
    expect(stale.stale).toBe(true);
    expect(
      buildCompanyReportModel(company(), analysis(), [], OPTS).stale,
    ).toBe(false);
  });

  it("computes snapshot stats from metrics (invested + est. value)", () => {
    const c = company({
      investments: [inv({ amount: 5_000_000, ownership_pct: 1 })],
      valuations: [val({ date: "2026-01-01", post_money: 2_000_000_000 })],
    });
    const m = buildCompanyReportModel(c, analysis(), [], OPTS);
    const values = Object.fromEntries(m.snapshot.map((s) => [s.label, s.value]));
    expect(values["Invested"]).toBe("$5.00M");
    expect(values["Est. value"]).toBe("$20.00M");
  });

  it("uses the company name and slug in the model header fields", () => {
    const m = buildCompanyReportModel(company(), analysis(), [], OPTS);
    expect(m.companyName).toBe("Acme Robotics");
    expect(m.slug).toBe("acme-robotics");
    expect(m.generatedAt).toBe("2026-07-10");
  });
});

// --- competitive landscape ------------------------------------------------

describe("competitive landscape", () => {
  it("keeps threat tiers and clamps capability scores honestly", () => {
    const m = buildCompanyReportModel(company(), analysis(), [], OPTS);
    const comp = section(m.sections, "competitive_landscape");
    expect(comp.tiers).toEqual([
      { name: "RivalCo", tier: "direct" },
      { name: "AdjacentCo", tier: "indirect" },
    ]);
    expect(comp.matrix?.target).toBe("Acme Robotics");
    const row = comp.matrix?.threats[0];
    expect(row?.ip_depth).toBe(6);
    // 12 is out of the honest 1–10 domain → null, never clamped to 10.
    expect(row?.workflow_retention).toBeNull();
  });
});
