/**
 * Data connector interface — the seam between the app and external sources
 * (Crunchbase, SEC EDGAR, news APIs, Twitter/X). In Slice 1 only the stub
 * implementation exists; phase P4 drops in live connectors without any UI
 * changes, because the UI depends only on this interface.
 */

export interface ConnectorCompanyProfile {
  name: string;
  website?: string;
  sector?: string;
  country?: string;
  foundedYear?: number;
  description?: string;
  founders?: string[];
}

export interface ConnectorFundingRound {
  round: string;
  date?: string;
  amountRaised?: number;
  valuation?: number;
  investors?: string[];
  leadInvestor?: string;
  source: string;
}

export interface ConnectorNewsItem {
  title: string;
  source: string;
  url?: string;
  date?: string;
  summary?: string;
  sentiment?: "positive" | "neutral" | "negative";
}

export interface ConnectorCompetitor {
  /** Competitor company name. */
  name: string;
  /** Latest known post-money valuation in USD, if found. */
  valuation?: number;
  /** As-of date (YYYY-MM-DD) for the valuation, if known. */
  valuationDate?: string;
  /** Short provenance note, e.g. "Series C per @AaronGDillon". */
  basis?: string;
  source: string;
}

export interface DataConnector {
  /** Stable identifier, e.g. "crunchbase", "sec-edgar", "news", "twitter". */
  readonly id: string;
  fetchCompanyProfile(query: string): Promise<ConnectorCompanyProfile | null>;
  fetchFundingRounds(query: string): Promise<ConnectorFundingRound[]>;
  fetchNews(query: string): Promise<ConnectorNewsItem[]>;
  /**
   * Optional: identify the company's primary competitors and their latest
   * valuations. Only connectors that can surface competitive intelligence
   * (e.g. Grok X-search) implement this.
   */
  fetchCompetitors?(query: string): Promise<ConnectorCompetitor[]>;
}
