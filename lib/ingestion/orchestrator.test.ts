import { describe, expect, it } from "vitest";
import { mapConnectorResults, type ConnectorBatchResult } from "@/lib/ingestion/map";

describe("mapConnectorResults", () => {
  const batch: ConnectorBatchResult[] = [
    {
      source: "crunchbase",
      profile: {
        name: "Acme",
        website: "https://acme.com",
        sector: "AI",
        country: null as unknown as undefined,
        foundedYear: 2019,
        description: undefined,
        founders: ["A", "B"],
      },
      rounds: [
        {
          round: "Series A",
          date: "2023-06-01",
          valuation: 150_000_000,
          amountRaised: 25_000_000,
          investors: ["Sequoia"],
          leadInvestor: "Sequoia",
          source: "crunchbase",
        },
      ],
      news: [
        { title: "Acme raises Series A", source: "TechCrunch", date: "2023-06-02" },
      ],
    },
    {
      source: "news",
      profile: { name: "Acme", country: "United States", description: "Does things" },
      rounds: [
        // duplicate round name -> deduped
        { round: "series a", date: "2023-06-01", valuation: 150_000_000, source: "news" },
      ],
      news: [
        // duplicate title (case-insensitive) -> deduped
        { title: "acme raises series a", source: "Reuters" },
        { title: "Acme launches product", source: "Reuters", date: "2024-01-10" },
      ],
    },
  ];

  const mapped = mapConnectorResults(batch);

  it("dedupes funding rounds by name", () => {
    expect(mapped.fundingRounds).toHaveLength(1);
    expect(mapped.fundingRounds[0].round).toBe("Series A");
  });

  it("synthesizes a valuation point from rounds with date + valuation", () => {
    expect(mapped.valuations).toHaveLength(1);
    expect(mapped.valuations[0]).toMatchObject({
      date: "2023-06-01",
      post_money: 150_000_000,
      round: "Series A",
    });
  });

  it("dedupes news by title case-insensitively", () => {
    const titles = mapped.news.map((n) => n.title);
    expect(titles).toContain("Acme raises Series A");
    expect(titles).toContain("Acme launches product");
    expect(mapped.news).toHaveLength(2);
  });

  it("merges profile fields, taking the first defined value", () => {
    expect(mapped.profilePatch.website).toBe("https://acme.com");
    expect(mapped.profilePatch.country).toBe("United States"); // filled from 2nd connector
    expect(mapped.profilePatch.description).toBe("Does things");
    expect(mapped.profilePatch.foundedYear).toBe(2019);
  });
});
