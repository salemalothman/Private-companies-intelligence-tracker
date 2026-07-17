import { describe, expect, it } from "vitest";
import {
  extractIndustryMentions,
  mapAktaFinancial,
  mapAktaNews,
  mapAktaProfile,
  normalizeDeepSearchArticles,
  resolveIndustryCodes,
} from "@/lib/connectors/akta";

describe("mapAktaProfile", () => {
  it("maps akta firmographic JSON to a ConnectorCompanyProfile", () => {
    const profile = mapAktaProfile({
      name: "Acme Robotics",
      website: "acme.example",
      product_category: "Industrial Automation",
      country: "United States",
      founded_year: 2019,
      description: "Autonomous warehouse robots.",
      founders: ["Ada Lovelace", "Grace Hopper"],
    });
    expect(profile).toEqual({
      name: "Acme Robotics",
      website: "acme.example",
      sector: "Industrial Automation",
      country: "United States",
      foundedYear: 2019,
      description: "Autonomous warehouse robots.",
      founders: ["Ada Lovelace", "Grace Hopper"],
    });
  });

  it("falls back to industry for sector and omits empty founders", () => {
    const profile = mapAktaProfile({
      name: "Beta Corp",
      industry: "Fintech",
      founders: [],
    });
    expect(profile?.sector).toBe("Fintech");
    expect(profile?.founders).toBeUndefined();
  });

  it("returns null for empty / nameless firmographic data", () => {
    expect(mapAktaProfile(null)).toBeNull();
    expect(mapAktaProfile(undefined)).toBeNull();
    expect(mapAktaProfile({})).toBeNull();
  });
});

describe("mapAktaNews", () => {
  it("maps native summary + sentiment with a publisher-domain source", () => {
    const news = mapAktaNews([
      {
        title: "Acme raises Series C",
        summary: "AI-written summary of the round.",
        sentiment: "positive",
        url: "https://techcrunch.com/acme",
        date: "2026-05-01T10:00:00Z",
        publisher: { domain: "techcrunch.com" },
      },
    ]);
    expect(news).toEqual([
      {
        title: "Acme raises Series C",
        source: "techcrunch.com",
        url: "https://techcrunch.com/acme",
        date: "2026-05-01",
        summary: "AI-written summary of the round.",
        sentiment: "positive",
      },
    ]);
  });

  it("falls back to akta.pro when no publisher metadata is present", () => {
    const news = mapAktaNews([
      { title: "Acme opens new office", sentiment: "neutral" },
    ]);
    expect(news[0].source).toBe("akta.pro");
    expect(news[0].sentiment).toBe("neutral");
  });

  it("drops untitled items and returns [] for empty input", () => {
    expect(mapAktaNews([{ title: "  " }, {}])).toEqual([]);
    expect(mapAktaNews(null)).toEqual([]);
    expect(mapAktaNews(undefined)).toEqual([]);
  });
});

describe("mapAktaFinancial", () => {
  it("surfaces estimate figures with an estimate basis string, never as fact", () => {
    const metric = mapAktaFinancial({
      revenue: 4.2e8,
      valuation: 3.1e9,
      valuation_date: "2026-04-01",
    });
    expect(metric?.valuation).toBe(3.1e9);
    expect(metric?.revenue).toBe(4.2e8);
    expect(metric?.valuationDate).toBe("2026-04-01");
    expect(metric?.basis).toMatch(/estimate/i);
    expect(metric?.revenueBasis).toMatch(/estimate/i);
    expect(metric?.source).toMatch(/akta/i);
  });

  it("returns null when no financial estimate is available", () => {
    expect(mapAktaFinancial(null)).toBeNull();
    expect(mapAktaFinancial({})).toBeNull();
  });
});

describe("resolveIndustryCodes", () => {
  it("keeps hits at/above the similarity floor, capped and comma-joined", () => {
    const codes = resolveIndustryCodes([
      { code: "5415", industry_name: "Software", similarity: 0.9 },
      { code: "5417", industry_name: "R&D", similarity: 0.5 },
      { code: "5182", industry_name: "Data", similarity: 0.45 },
      { code: "9999", industry_name: "Noise", similarity: 0.44 },
      { code: "1111", industry_name: "Extra", similarity: 0.8 },
    ]);
    // 0.44 dropped (below floor); capped at 3 codes.
    expect(codes).toBe("5415,5417,5182");
  });

  it("honors custom floor/cap and coerces numeric codes", () => {
    const codes = resolveIndustryCodes(
      [
        { code: 100, similarity: 0.7 },
        { code: 200, similarity: 0.6 },
      ],
      { floor: 0.65, cap: 5 },
    );
    expect(codes).toBe("100");
  });

  it("returns an empty string for empty / malformed input", () => {
    expect(resolveIndustryCodes(null)).toBe("");
    expect(resolveIndustryCodes(undefined)).toBe("");
    expect(resolveIndustryCodes([])).toBe("");
    expect(resolveIndustryCodes([{ industry_name: "no code", similarity: 0.9 }])).toBe("");
  });
});

describe("extractIndustryMentions", () => {
  const basisRe = /industry-news mention/i;

  it("extracts mentions under the `companies` field, ranked by frequency", () => {
    const out = extractIndustryMentions(
      [
        { companies: [{ name: "Rival A" }, { name: "Rival B" }] },
        { companies: [{ name: "Rival A" }] },
      ],
      "Target Co",
    );
    expect(out.map((c) => c.name)).toEqual(["Rival A", "Rival B"]);
    expect(out[0].source).toMatch(/akta/i);
    expect(out[0].basis).toMatch(basisRe);
  });

  it("extracts mentions under the `company_mentions` field", () => {
    const out = extractIndustryMentions(
      [{ company_mentions: [{ company_name: "Peer X", uuid: "u1" }] }],
      "Target Co",
    );
    expect(out.map((c) => c.name)).toEqual(["Peer X"]);
  });

  it("extracts mentions under the `mentions` field", () => {
    const out = extractIndustryMentions(
      [{ mentions: [{ name: "Peer Y" }, { name: "Peer Y" }, { name: "Peer Z" }] }],
      "Target Co",
    );
    expect(out.map((c) => c.name)).toEqual(["Peer Y", "Peer Z"]);
  });

  it("excludes the target company (case-insensitive) and unnamed mentions", () => {
    const out = extractIndustryMentions(
      [{ companies: [{ name: "target co" }, { name: "  " }, { name: "Real Peer" }] }],
      "Target Co",
    );
    expect(out.map((c) => c.name)).toEqual(["Real Peer"]);
  });

  it("returns [] for empty / malformed input without throwing", () => {
    expect(extractIndustryMentions([], "T")).toEqual([]);
    expect(extractIndustryMentions(null, "T")).toEqual([]);
    expect(extractIndustryMentions(undefined, "T")).toEqual([]);
    expect(extractIndustryMentions([{ companies: "not-an-array" }], "T")).toEqual([]);
    expect(extractIndustryMentions([42, "junk", {}], "T")).toEqual([]);
  });
});

describe("normalizeDeepSearchArticles", () => {
  it("normalizes raw articles to news items with a publisher-domain source", () => {
    const out = normalizeDeepSearchArticles([
      {
        title: "Target ships v2",
        summary: "Native summary.",
        sentiment: "positive",
        url: "https://theverge.com/x",
        date: "2026-06-02T09:00:00Z",
        publisher: { domain: "theverge.com" },
      },
    ]);
    expect(out).toEqual([
      {
        title: "Target ships v2",
        source: "theverge.com",
        url: "https://theverge.com/x",
        date: "2026-06-02",
        summary: "Native summary.",
        sentiment: "positive",
      },
    ]);
  });

  it("falls back to akta.pro and drops untitled / empty input", () => {
    const out = normalizeDeepSearchArticles([
      { title: "No publisher", sentiment: "neutral" },
      { title: "   " },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].source).toBe("akta.pro");
    expect(normalizeDeepSearchArticles(null)).toEqual([]);
    expect(normalizeDeepSearchArticles(undefined)).toEqual([]);
  });
});

// Fixtures below mirror the exact shapes observed from the live akta API on
// 2026-07-17 (Canva, uuid 00000l1) — the docs don't publish these field names.
describe("live API shapes (2026-07-17)", () => {
  it("maps firmographic company_description and live news fields", () => {
    const profile = mapAktaProfile({
      name: "Canva",
      legal_name: "Canva",
      website: "http://www.canva.com",
      company_type: "Private",
      founded_year: 2013,
      company_description: "Canva is an online visual communication platform.",
      headcount_range: "5001-10000",
      operating_status: "Active",
      ownership_category: "Privately Held",
    } as Parameters<typeof mapAktaProfile>[0]);
    expect(profile?.description).toBe(
      "Canva is an online visual communication platform.",
    );
    expect(profile?.foundedYear).toBe(2013);
  });

  it("maps live news: ai_summary, published_date, display-name publisher → url domain", () => {
    const out = mapAktaNews([
      {
        title: "Canva wants your vibe-coded sites to not look vibe-coded",
        ai_summary: "Canva launched a website beautifier.",
        sentiment: "Neutral",
        publisher: "SmartCompany",
        published_date: "2026-07-17T00:53:19",
        url: "https://www.smartcompany.com.au/technology/canva-beautifier/",
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe("Canva launched a website beautifier.");
    expect(out[0].date).toBe("2026-07-17");
    expect(out[0].sentiment).toBe("neutral");
    // Display name "SmartCompany" is not a domain — derive from the URL.
    expect(out[0].source).toBe("smartcompany.com.au");
  });

  it("falls back to akta.pro when neither publisher nor url yields a domain", () => {
    const out = mapAktaNews([{ title: "T", publisher: "SomeOutlet" }]);
    expect(out[0].source).toBe("akta.pro");
  });

  it("parses live financial_estimate bands into transparent midpoints/floors", () => {
    const fin = mapAktaFinancial({
      revenue_estimate: { code: "1B-5B", label: "$1B-$5B" },
      valuation_estimate: { code: "OVER-25B", label: "$25B+" },
    });
    expect(fin?.revenue).toBe(3e9); // midpoint of $1B–$5B
    expect(fin?.valuation).toBe(25e9); // floor of the open-ended band
    expect(fin?.revenueBasis).toBe(
      "akta.pro financial estimate ($1B-$5B band)",
    );
    expect(fin?.basis).toBe("akta.pro financial estimate ($25B+ band)");
  });

  it("halves UNDER bands and still accepts plain numbers", () => {
    const fin = mapAktaFinancial({
      revenue_estimate: { code: "UNDER-10M", label: "Under $10M" },
      valuation_estimate: 1_500_000_000,
    });
    expect(fin?.revenue).toBe(5e6);
    expect(fin?.valuation).toBe(1.5e9);
    expect(fin?.basis).toBe("akta.pro financial estimate");
  });

  it("returns null when bands are unparseable", () => {
    expect(
      mapAktaFinancial({
        revenue_estimate: { code: "", label: "" },
        valuation_estimate: { label: "N/A" },
      }),
    ).toBeNull();
  });
});
