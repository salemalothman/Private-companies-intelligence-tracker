import "server-only";
import type { DataConnector } from "@/lib/connectors/types";
import { stubConnector } from "@/lib/connectors/stub";
import { GrokConnector } from "@/lib/connectors/grok";
import { SecEdgarConnector } from "@/lib/connectors/sec-edgar";
import { ExaConnector } from "@/lib/connectors/exa";

/**
 * Returns the set of enabled data connectors. The stub is always available
 * (keyless). Real connectors are gated on their credentials so the pipeline
 * degrades gracefully when they're absent — add them here as they land in P4.
 *
 *   if (process.env.CRUNCHBASE_API_KEY) connectors.push(new CrunchbaseConnector(...))
 *   if (process.env.NEWS_API_KEY)       connectors.push(new NewsConnector(...))
 */
export function getConnectors(): DataConnector[] {
  const connectors: DataConnector[] = [];

  // Grok-powered X/Twitter connector (replaces the planned raw Twitter API).
  if (process.env.XAI_API_KEY) {
    connectors.push(new GrokConnector());
  }

  // SEC EDGAR — Form D private fundraising filings. Keyless; needs a UA header.
  if (process.env.SEC_USER_AGENT) {
    connectors.push(new SecEdgarConnector());
  }

  // Exa — web search for news, funding rounds, and valuations across the web.
  if (process.env.EXA_API_KEY) {
    connectors.push(new ExaConnector());
  }

  // Keyless stub is the fallback only when no live source is configured, so a
  // configured deployment ingests real data instead of placeholder data.
  if (connectors.length === 0) {
    connectors.push(stubConnector);
  }

  return connectors;
}

/** Whether any live (non-stub) connector is configured. */
export function hasLiveConnectors(): boolean {
  return getConnectors().some((c) => c.id !== "stub");
}
