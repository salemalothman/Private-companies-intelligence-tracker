import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MarketValuationRow } from "@/lib/types";
import { getConnectors } from "@/lib/connectors/registry";
import { SecEdgarConnector } from "@/lib/connectors/sec-edgar";
import type { ConnectorCompetitor } from "@/lib/connectors/types";
import { lookupMarketValuations } from "@/lib/market-cache/lookup";
import { nameKey } from "@/lib/market-cache/parse";

/**
 * Source label for a figure copied out of the weekly market cache. MUST carry
 * the underlying row's own source — labelling every cache hit "agdillon" would
 * launder an unverified aggregate row into AG Dillon's (trusted) name, and the
 * canonical trust tiering downstream keys off exactly this string.
 */
function cacheSource(row: MarketValuationRow | undefined): string {
  const base = row?.source?.trim();
  return base ? `${base} (cache)` : "market cache";
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

/**
 * SEC verification + valuation fallback. Always returns whether the entity has
 * a Form D on record. When no valuation was found via X / the cache, it also
 * pulls the latest Form D and surfaces the amount raised + date as a fallback
 * figure (Form D filings disclose the offering amount, not a valuation).
 */
async function secFallback(
  sec: SecEdgarConnector | undefined,
  name: string,
  hasValuation: boolean,
): Promise<{ secVerified: boolean; basis?: string }> {
  if (!sec) return { secVerified: false };
  // With a valuation already in hand, we only need the cheap verification call.
  if (hasValuation) return { secVerified: await sec.hasFilings(name).catch(() => false) };

  const filings = await sec.fetchFundingRounds(name).catch(() => []);
  const secVerified = filings.length > 0;
  const latest = filings[0];
  if (!latest || latest.amountRaised == null) return { secVerified };
  const when = latest.date ? ` (${latest.date})` : "";
  return {
    secVerified,
    basis: `SEC Form D: ${fmtUsd(latest.amountRaised)} raised${when}`,
  };
}

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
    source: cacheSource(cached),
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
  hint?: string,
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
    source.fetchCompetitors(companyName, hint),
    targetCache
      ? Promise.resolve(null)
      : source.fetchValuationMetric?.(companyName) ?? Promise.resolve(null),
  ]);
  let found = firstTry;
  if (found.length === 0) found = await source.fetchCompetitors(companyName, hint);

  const self: CompetitorDiscovery["self"] = targetCache
    ? {
        valuation: targetCache.valuation ?? undefined,
        valuationDate: targetCache.valuation_date ?? undefined,
        revenue: targetCache.revenue ?? undefined,
        revenueBasis: targetCache.revenue_basis ?? undefined,
        basis: targetCache.note ?? undefined,
        source: cacheSource(targetCache),
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
    unique.map(async (c) => {
      const enriched = applyCache(c, compCache.get(nameKey(c.name)));
      // No valuation from X / cache → fall back to SEC filings.
      const { secVerified, basis } = await secFallback(
        sec,
        c.name,
        enriched.valuation != null,
      );
      return { ...enriched, basis: basis ?? enriched.basis, secVerified };
    }),
  );

  // Apply the same SEC fallback to the target company's own row.
  let enrichedSelf = self;
  if (enrichedSelf && enrichedSelf.valuation == null) {
    const { basis } = await secFallback(sec, companyName, false);
    if (basis) enrichedSelf = { ...enrichedSelf, basis: enrichedSelf.basis ?? basis };
  }

  return { competitors, self: enrichedSelf };
}
