import "server-only";
import type { DataConnector } from "@/lib/connectors/types";
import { stubConnector } from "@/lib/connectors/stub";

/**
 * Returns the set of enabled data connectors. The stub is always available
 * (keyless). Real connectors are gated on their credentials so the pipeline
 * degrades gracefully when keys are absent — add them here as they land in P4.
 *
 *   if (process.env.CRUNCHBASE_API_KEY) connectors.push(new CrunchbaseConnector(...))
 *   if (process.env.SEC_USER_AGENT)     connectors.push(new SecEdgarConnector(...))   // SEC is keyless but requires a UA
 *   if (process.env.NEWS_API_KEY)       connectors.push(new NewsConnector(...))
 *   if (process.env.TWITTER_BEARER)     connectors.push(new TwitterConnector(...))
 */
export function getConnectors(): DataConnector[] {
  const connectors: DataConnector[] = [stubConnector];
  return connectors;
}

/** Whether any live (non-stub) connector is configured. */
export function hasLiveConnectors(): boolean {
  return getConnectors().some((c) => c.id !== "stub");
}
