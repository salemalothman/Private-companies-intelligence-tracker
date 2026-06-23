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
}

export interface DataConnector {
  /** Stable identifier, e.g. "crunchbase", "sec-edgar", "news", "twitter". */
  readonly id: string;
  fetchCompanyProfile(query: string): Promise<ConnectorCompanyProfile | null>;
  fetchFundingRounds(query: string): Promise<ConnectorFundingRound[]>;
  fetchNews(query: string): Promise<ConnectorNewsItem[]>;
}
