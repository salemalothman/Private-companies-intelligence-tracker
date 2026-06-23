import type {
  ConnectorCompanyProfile,
  ConnectorFundingRound,
  ConnectorNewsItem,
  DataConnector,
} from "@/lib/connectors/types";

/**
 * Deterministic stub connector used until live integrations land in P4.
 * Returns plausible mock data so the ingestion UI can be built and demoed
 * without external API keys.
 */
export class StubConnector implements DataConnector {
  readonly id = "stub";

  async fetchCompanyProfile(
    query: string,
  ): Promise<ConnectorCompanyProfile | null> {
    return {
      name: query,
      website: `https://${query.toLowerCase().replace(/\s+/g, "")}.com`,
      sector: "AI",
      country: "United States",
      foundedYear: 2019,
      description: `${query} is a private company tracked via the stub connector.`,
      founders: ["Founder One", "Founder Two"],
    };
  }

  async fetchFundingRounds(query: string): Promise<ConnectorFundingRound[]> {
    return [
      {
        round: "Series A",
        date: "2023-06-01",
        amountRaised: 25_000_000,
        valuation: 150_000_000,
        investors: ["Sequoia", "a16z"],
        leadInvestor: "Sequoia",
        source: `stub:${query}`,
      },
    ];
  }

  async fetchNews(query: string): Promise<ConnectorNewsItem[]> {
    return [
      {
        title: `${query} announces new product line`,
        source: "Stub Newswire",
        date: "2025-01-15",
        summary: "Placeholder news item from the stub connector.",
      },
    ];
  }
}

export const stubConnector = new StubConnector();
