import "server-only";
import { getConnectors } from "@/lib/connectors/registry";
import { SecEdgarConnector } from "@/lib/connectors/sec-edgar";
import type { ConnectorCompetitor } from "@/lib/connectors/types";

export interface DiscoveredCompetitor extends ConnectorCompetitor {
  /** True when a matching SEC Form D filing was found for the competitor. */
  secVerified: boolean;
}

export interface CompetitorDiscovery {
  competitors: DiscoveredCompetitor[];
  /** The target company's own latest valuation + revenue, if found. */
  self: Omit<ConnectorCompetitor, "name"> | null;
}

/**
 * Discover a company's primary competitors and their latest valuations.
 *
 * Uses the first competitor-capable connector (Grok X-search, told to
 * prioritize the trusted private-market sources) to surface competitors, then
 * cross-references each discovered name against the SEC EDGAR Form D record to
 * set a `secVerified` flag. Best-effort: returns [] when no competitor-capable
 * connector is configured, and degrades to `secVerified: false` when SEC
 * validation is unavailable.
 */
export async function discoverCompetitors(
  companyName: string,
): Promise<CompetitorDiscovery> {
  const connectors = getConnectors();
  const source = connectors.find((c) => typeof c.fetchCompetitors === "function");
  if (!source?.fetchCompetitors) return { competitors: [], self: null };

  // The model occasionally returns an empty set on a transient hiccup; one
  // retry makes discovery reliable since a real company almost always has peers.
  // In parallel, fetch the target's own valuation + revenue for its own row.
  const [firstTry, self] = await Promise.all([
    source.fetchCompetitors(companyName),
    source.fetchValuationMetric?.(companyName) ?? Promise.resolve(null),
  ]);
  let found = firstTry;
  if (found.length === 0) found = await source.fetchCompetitors(companyName);
  if (found.length === 0) return { competitors: [], self };

  // Dedupe by case-insensitive name, drop self-references to the target.
  const target = companyName.trim().toLowerCase();
  const seen = new Set<string>();
  const unique = found.filter((c) => {
    const key = c.name.trim().toLowerCase();
    if (!key || key === target || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const sec = connectors.find((c) => c.id === "sec-edgar") as
    | SecEdgarConnector
    | undefined;

  const competitors = await Promise.all(
    unique.map(async (c) => ({
      ...c,
      secVerified: sec ? await sec.hasFilings(c.name) : false,
    })),
  );

  return { competitors, self };
}
