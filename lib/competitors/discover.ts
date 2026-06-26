import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MarketValuationRow } from "@/lib/types";
import { getConnectors } from "@/lib/connectors/registry";
import { SecEdgarConnector } from "@/lib/connectors/sec-edgar";
import type { ConnectorCompetitor } from "@/lib/connectors/types";
import { lookupMarketValuations } from "@/lib/market-cache/lookup";
import { nameKey } from "@/lib/market-cache/parse";

const CACHE_SOURCE = "agdillon (cache)";

/** Overlay a cached market figure onto a connector metric (cache wins). */
function applyCache<T extends Partial<ConnectorCompetitor>>(
  base: T,
  cached: MarketValuationRow | undefined,
): T {
  if (!cached) return base;
  return {
    ...base,
    valuation: cached.valuation ?? base.valuation,
    valuationDate: cached.valuation_date ?? base.valuationDate,
    revenue: cached.revenue ?? base.revenue,
    revenueBasis: cached.revenue_basis ?? base.revenueBasis,
    basis: cached.note ?? base.basis,
    source: CACHE_SOURCE,
  };
}

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
  supabase?: SupabaseClient<Database>,
): Promise<CompetitorDiscovery> {
  const connectors = getConnectors();
  const source = connectors.find((c) => typeof c.fetchCompetitors === "function");
  if (!source?.fetchCompetitors) return { competitors: [], self: null };

  // Cache-first: query the weekly market cache for the target before any live
  // metric call. A cache hit lets us skip the live target-metric search.
  const targetCache = supabase
    ? (await lookupMarketValuations(supabase, [companyName])).get(nameKey(companyName))
    : undefined;

  // The model occasionally returns an empty set on a transient hiccup; one
  // retry makes discovery reliable since a real company almost always has peers.
  // In parallel, fetch the target's own metric only when the cache misses.
  const [firstTry, selfLive] = await Promise.all([
    source.fetchCompetitors(companyName),
    targetCache
      ? Promise.resolve(null)
      : source.fetchValuationMetric?.(companyName) ?? Promise.resolve(null),
  ]);
  let found = firstTry;
  if (found.length === 0) found = await source.fetchCompetitors(companyName);

  const self: CompetitorDiscovery["self"] = targetCache
    ? {
        valuation: targetCache.valuation ?? undefined,
        valuationDate: targetCache.valuation_date ?? undefined,
        revenue: targetCache.revenue ?? undefined,
        revenueBasis: targetCache.revenue_basis ?? undefined,
        basis: targetCache.note ?? undefined,
        source: CACHE_SOURCE,
      }
    : selfLive;

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

  // Instantly populate competitor metrics from the cache where we have them,
  // before falling back to the live (Grok-provided) figures.
  const compCache = supabase
    ? await lookupMarketValuations(supabase, unique.map((c) => c.name))
    : new Map<string, MarketValuationRow>();

  const sec = connectors.find((c) => c.id === "sec-edgar") as
    | SecEdgarConnector
    | undefined;

  const competitors = await Promise.all(
    unique.map(async (c) => ({
      ...applyCache(c, compCache.get(nameKey(c.name))),
      secVerified: sec ? await sec.hasFilings(c.name) : false,
    })),
  );

  return { competitors, self };
}
