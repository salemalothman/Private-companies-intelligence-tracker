import { describe, expect, it } from "vitest";
import {
  mapAktaFinancial,
  mapAktaNews,
  mapAktaProfile,
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
