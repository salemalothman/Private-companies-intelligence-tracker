import { describe, expect, it } from "vitest";
import {
  extractIndustryMentions,
  filterRelevantMentions,
  mapAktaFinancial,
  mapAktaNews,
  mapAktaProfile,
  mergeMentionPools,
  normalizeDeepSearchArticles,
  pickPrimaryCompanyHit,
  rankIndustryMentions,
  toPrivateSuggestions,
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

  it("coerces a string founded_year to a number at the zod boundary", () => {
    const profile = mapAktaProfile({ name: "Coerce Co", founded_year: "2019" });
    expect(profile?.foundedYear).toBe(2019);
  });

  it("drops a javascript: website but keeps bare domains and http(s) URLs", () => {
    expect(
      mapAktaProfile({ name: "Evil", website: "javascript:alert(1)" })?.website,
    ).toBeUndefined();
    expect(
      mapAktaProfile({ name: "Bare", website: "acme.example" })?.website,
    ).toBe("acme.example");
    expect(
      mapAktaProfile({ name: "Https", website: "https://acme.example" })?.website,
    ).toBe("https://acme.example");
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

  it("strips non-http(s) article URLs (XSS guard) but keeps the item", () => {
    const out = mapAktaNews([
      { title: "Evil link", url: "javascript:alert(1)" },
      { title: "Good link", url: "https://techcrunch.com/x" },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].url).toBeUndefined();
    expect(out[1].url).toBe("https://techcrunch.com/x");
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

describe("rankIndustryMentions", () => {
  it("counts mentions across all three field shapes, ranked most-mentioned first", () => {
    const ranked = rankIndustryMentions(
      [
        { companies: [{ name: "Rival A" }, { name: "Rival B" }] },
        { company_mentions: [{ company_name: "Rival A" }] },
        { mentions: [{ name: "Rival A" }, { name: "Rival C" }] },
      ],
      "Target Co",
    );
    expect(ranked).toEqual([
      { name: "Rival A", count: 3 },
      { name: "Rival B", count: 1 },
      { name: "Rival C", count: 1 },
    ]);
  });

  it("excludes the target (case-insensitive) and unnamed mentions", () => {
    const ranked = rankIndustryMentions(
      [{ companies: [{ name: "target co" }, { name: "  " }, { name: "Real Peer" }] }],
      "Target Co",
    );
    expect(ranked).toEqual([{ name: "Real Peer", count: 1 }]);
  });

  it("returns [] for empty / malformed input without throwing", () => {
    expect(rankIndustryMentions([], "T")).toEqual([]);
    expect(rankIndustryMentions(null, "T")).toEqual([]);
    expect(rankIndustryMentions(undefined, "T")).toEqual([]);
    expect(rankIndustryMentions([{ companies: "not-an-array" }], "T")).toEqual([]);
  });

  it("extractIndustryMentions delegates to rankIndustryMentions with unchanged labels", () => {
    const articles = [
      { companies: [{ name: "Rival A" }, { name: "Rival B" }] },
      { companies: [{ name: "Rival A" }] },
    ];
    const ranked = rankIndustryMentions(articles, "Target Co");
    const extracted = extractIndustryMentions(articles, "Target Co");
    expect(extracted).toEqual(
      ranked.map((c) => ({
        name: c.name,
        basis: "akta.pro industry-news mention",
        source: "akta.pro",
      })),
    );
  });
});

describe("mergeMentionPools", () => {
  // One article mentioning each listed name once.
  const article = (...names: string[]) => ({
    companies: names.map((name) => ({ name })),
  });

  it("applies the asymmetric 7/3 split of the resolve budget (cap 10)", () => {
    // 8 distinct comparison-pool names — only the top 7 may take slots.
    const comparison = ["C1", "C2", "C3", "C4", "C5", "C6", "C7", "C8"].map(
      (n) => article(n),
    );
    // 4 distinct company-pool names — only the top 3 may take slots.
    const companyOwn = [article("K1", "K2", "K3", "K4")];
    const out = mergeMentionPools(comparison, companyOwn, "Target Co", 10);
    expect(out).toHaveLength(10);
    const names = out.map((c) => c.name);
    expect(names).toContain("C7");
    expect(names).not.toContain("C8"); // 8th comparison name over the 7 cap
    expect(names).toContain("K3");
    expect(names).not.toContain("K4"); // 4th company name over the 3 cap
  });

  it("crowd-out regression: 9x-mention mega-caps in the company pool cannot evict a 1-mention comparison peer", () => {
    const companyOwn = Array.from({ length: 9 }, () =>
      article("MegaCorp", "BigCo"),
    );
    const comparison = [article("Figma")];
    const out = mergeMentionPools(comparison, companyOwn, "Target Co", 10);
    const names = out.map((c) => c.name);
    // The single-mention genuine peer keeps its comparison-pool slot.
    expect(names).toContain("Figma");
    expect(names).toContain("MegaCorp");
  });

  it("sums counts for a name seen in BOTH pools (case-insensitive dedupe)", () => {
    const comparison = [article("Rival A"), article("Rival A"), article("Solo")];
    const companyOwn = [article("rival a")];
    const out = mergeMentionPools(comparison, companyOwn, "Target Co", 10);
    expect(out).toEqual([
      { name: "Rival A", count: 3 }, // 2 comparison + 1 company, summed
      { name: "Solo", count: 1 },
    ]);
  });

  it("unwraps the {articles: [...]} envelope shape and tolerates junk", () => {
    const comparison = { articles: [article("Peer X")] };
    const out = mergeMentionPools(comparison, "junk", "Target Co", 10);
    expect(out).toEqual([{ name: "Peer X", count: 1 }]);
  });
});

describe("filterRelevantMentions", () => {
  const basis = "akta.pro industry-news mention";

  it("Test A — keeps single-mention candidates by default (frequency ranks, category filters), still supports an explicit floor", () => {
    const input = [
      { name: "Once", count: 1, product_category: "Design Software" },
      { name: "Twice", count: 2, product_category: "Design Software" },
    ];
    // Default minMentions=1: both survive, ranked by count desc.
    expect(
      filterRelevantMentions(input, "Graphic Design Software").map((c) => c.name),
    ).toEqual(["Twice", "Once"]);
    // Explicit floor still enforced when a caller opts in.
    expect(
      filterRelevantMentions(input, "Graphic Design Software", {
        minMentions: 2,
      }).map((c) => c.name),
    ).toEqual(["Twice"]);
  });

  it("Test B — drops candidates whose product_category is empty/undefined (unverifiable)", () => {
    const out = filterRelevantMentions(
      [
        { name: "NoCat", count: 5 },
        { name: "EmptyCat", count: 5, product_category: "   " },
        { name: "HasCat", count: 5, product_category: "Design Software" },
      ],
      "Graphic Design Software",
    );
    expect(out.map((c) => c.name)).toEqual(["HasCat"]);
  });

  it("Test C — drops clearly-dead statuses, keeps private/public/undefined leniently", () => {
    const out = filterRelevantMentions(
      [
        { name: "Acquired Co", count: 5, product_category: "Design Software", company_status: "Acquired" },
        { name: "Defunct Co", count: 5, product_category: "Design Software", company_status: "defunct" },
        { name: "Private Co", count: 5, product_category: "Design Software", company_status: "Private" },
        { name: "Public Co", count: 5, product_category: "Design Software", company_status: "public" },
        { name: "Unknown Co", count: 5, product_category: "Design Software" },
      ],
      "Graphic Design Software",
    );
    expect(out.map((c) => c.name)).toEqual([
      "Private Co",
      "Public Co",
      "Unknown Co",
    ]);
  });

  it("Test D — Canva noise (NVIDIA, Netflix, university) dropped for zero category overlap", () => {
    const out = filterRelevantMentions(
      [
        { name: "NVIDIA", count: 6, product_category: "GPU & AI Hardware" },
        { name: "Netflix", count: 4, product_category: "Streaming Video" },
        { name: "State University", count: 3, product_category: "Higher Education" },
      ],
      "Graphic Design Software",
    );
    expect(out).toEqual([]);
  });

  it("Test E — comparable candidates survive with preserved ranking and labels", () => {
    const out = filterRelevantMentions(
      [
        { name: "Figma", count: 3, product_category: "Interface Design Software" },
        { name: "Adobe", count: 7, product_category: "Design Software" },
      ],
      "Graphic Design Software",
    );
    expect(out).toEqual([
      { name: "Adobe", basis, source: "akta.pro" },
      { name: "Figma", basis, source: "akta.pro" },
    ]);
  });

  it("is lenient (keeps on count alone) when the target category has no substantive tokens", () => {
    const out = filterRelevantMentions(
      [
        { name: "Peer A", count: 2, product_category: "GPU Hardware" },
        { name: "Peer B", count: 1, product_category: "Streaming Video" },
      ],
      "Software", // only a stopword → empty target token set
    );
    // Default minMentions=1: both survive on the lenient path, count-desc.
    expect(out.map((c) => c.name)).toEqual(["Peer A", "Peer B"]);
  });

  it("returns [] for empty / malformed input without throwing", () => {
    expect(filterRelevantMentions([], "Design")).toEqual([]);
    expect(
      filterRelevantMentions(
        null as unknown as Parameters<typeof filterRelevantMentions>[0],
        "Design",
      ),
    ).toEqual([]);
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

describe("pickPrimaryCompanyHit (privately-held guardrail)", () => {
  it("skips public-market hits and binds to the first private hit", () => {
    const hit = pickPrimaryCompanyHit([
      { uuid: "pub1", name: "Acme Corp", company_status: "public" },
      { uuid: "del1", name: "Acme Ltd", company_status: "delisted" },
      { uuid: "priv1", name: "Acme", company_status: "private" },
    ]);
    expect(hit?.uuid).toBe("priv1");
  });

  it("returns null when every hit is a public-market entity", () => {
    expect(
      pickPrimaryCompanyHit([
        { uuid: "a", company_status: "public" },
        { uuid: "b", company_status: "delisted" },
      ]),
    ).toBeNull();
  });

  it("keeps unknown/missing statuses eligible (lenient)", () => {
    expect(pickPrimaryCompanyHit([{ uuid: "u1" }])?.uuid).toBe("u1");
    expect(
      pickPrimaryCompanyHit([{ uuid: "u2", company_status: "unknown" }])?.uuid,
    ).toBe("u2");
    expect(
      pickPrimaryCompanyHit([{ uuid: "a1", company_status: "acquired" }])?.uuid,
    ).toBe("a1");
  });

  it("returns null for empty/malformed input", () => {
    expect(pickPrimaryCompanyHit([])).toBeNull();
    expect(pickPrimaryCompanyHit(null)).toBeNull();
    expect(pickPrimaryCompanyHit(undefined)).toBeNull();
  });

  it("competitor filtering still keeps PUBLIC peers (guardrail is primary-only)", () => {
    const out = filterRelevantMentions(
      [
        {
          name: "Figma",
          count: 1,
          product_category: "Ui Design Collaboration Software",
          company_status: "public",
        },
      ],
      "Graphic Design Software",
    );
    expect(out.map((c) => c.name)).toEqual(["Figma"]);
  });
});

describe("toPrivateSuggestions (private-only typeahead mapper)", () => {
  it("drops public/delisted hits and keeps private/acquired/unknown/missing", () => {
    const out = toPrivateSuggestions([
      { uuid: "pub", name: "Acme Public", company_status: "public" },
      { uuid: "del", name: "Acme Delisted", company_status: "delisted" },
      { uuid: "priv", name: "Acme Private", company_status: "private" },
      { uuid: "acq", name: "Acme Acquired", company_status: "acquired" },
      { uuid: "unk", name: "Acme Unknown", company_status: "unknown" },
      { uuid: "miss", name: "Acme Missing" },
    ]);
    expect(out.map((s) => s.uuid)).toEqual(["priv", "acq", "unk", "miss"]);
  });

  it("is case-insensitive and tolerant of whitespace on the status", () => {
    const out = toPrivateSuggestions([
      { uuid: "pub", name: "Loud Public", company_status: " PUBLIC " },
      { uuid: "priv", name: "Quiet Private", company_status: " Private " },
    ]);
    expect(out.map((s) => s.uuid)).toEqual(["priv"]);
  });

  it("drops hits with no non-empty name", () => {
    const out = toPrivateSuggestions([
      { uuid: "a", name: "  ", company_status: "private" },
      { uuid: "b", company_status: "private" },
      { uuid: "c", name: "Real Co", company_status: "private" },
    ]);
    expect(out.map((s) => s.uuid)).toEqual(["c"]);
  });

  it("maps product_category to category and blanks to undefined, drops logo", () => {
    const out = toPrivateSuggestions([
      { uuid: "a", name: "HasCat", website: "acme.example", product_category: "Design Software" },
      { uuid: "b", name: "BlankCat", product_category: "   " },
    ]);
    expect(out[0]).toEqual({
      uuid: "a",
      name: "HasCat",
      website: "acme.example",
      category: "Design Software",
    });
    expect(out[1].category).toBeUndefined();
    expect("logo" in out[0]).toBe(false);
  });

  it("caps output at 8 by default, preserving input order", () => {
    const hits = Array.from({ length: 12 }, (_, i) => ({
      uuid: `u${i}`,
      name: `Co ${i}`,
      company_status: "private",
    }));
    const out = toPrivateSuggestions(hits);
    expect(out).toHaveLength(8);
    expect(out.map((s) => s.uuid)).toEqual([
      "u0",
      "u1",
      "u2",
      "u3",
      "u4",
      "u5",
      "u6",
      "u7",
    ]);
  });

  it("honors a custom cap", () => {
    const hits = Array.from({ length: 5 }, (_, i) => ({
      uuid: `u${i}`,
      name: `Co ${i}`,
    }));
    expect(toPrivateSuggestions(hits, { cap: 2 })).toHaveLength(2);
  });

  it("returns [] for empty / undefined / non-array input without throwing", () => {
    expect(toPrivateSuggestions([])).toEqual([]);
    expect(toPrivateSuggestions(null)).toEqual([]);
    expect(toPrivateSuggestions(undefined)).toEqual([]);
    expect(
      toPrivateSuggestions(
        "junk" as unknown as Parameters<typeof toPrivateSuggestions>[0],
      ),
    ).toEqual([]);
  });
});
