import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MarketValuationRow } from "@/lib/types";
import { getConnectors } from "@/lib/connectors/registry";
import { SecEdgarConnector } from "@/lib/connectors/sec-edgar";
import type { ConnectorCompetitor } from "@/lib/connectors/types";
import { lookupMarketValuations } from "@/lib/market-cache/lookup";
import { nameKey } from "@/lib/market-cache/parse";
import { isAktaSource } from "@/lib/canonical";

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
 * Collapse the target's own valuation-metric observations from every
 * competitor-capable connector into a single self record. akta's estimate is
 * PREFERRED when present — the downstream canonical tie-break in lib/canonical.ts
 * already prefers akta observations, so surfacing akta's "akta.pro financial
 * estimate" here keeps the self row consistent with the header's canonical value.
 * Falls back to the first non-null observation otherwise; null when none exist.
 */
function pickSelfMetric(
  observations: Array<Omit<ConnectorCompetitor, "name">>,
): CompetitorDiscovery["self"] {
  if (observations.length === 0) return null;
  return observations.find((o) => isAktaSource(o.source)) ?? observations[0];
}

/**
 * Discover a company's primary competitors and their latest valuations.
 *
 * Queries EVERY competitor-capable connector (Grok X-search told to prioritize
 * the trusted private-market sources, plus akta's industry-news mentions),
 * merges their lists additively, and on a duplicate name lets the akta-sourced
 * row win. Each discovered name is cross-referenced against the SEC EDGAR Form D
 * record to set a `secVerified` flag. The target's own valuation metric is
 * gathered from ALL implementers (not just the first) so akta's financial
 * estimate reaches the self row / canonical inputs. Best-effort: returns [] when
 * no competitor-capable connector is configured, isolates a single source's
 * failure to [], and degrades to `secVerified: false` when SEC is unavailable.
 */
export async function discoverCompetitors(
  companyName: string,
  supabase?: SupabaseClient<Database>,
  hint?: string,
): Promise<CompetitorDiscovery> {
  const connectors = getConnectors();
  const sources = connectors.filter(
    (c): c is typeof c & { fetchCompetitors: NonNullable<typeof c.fetchCompetitors> } =>
      typeof c.fetchCompetitors === "function",
  );
  if (sources.length === 0) return { competitors: [], self: null };
  const metricSources = connectors.filter(
    (c): c is typeof c & { fetchValuationMetric: NonNullable<typeof c.fetchValuationMetric> } =>
      typeof c.fetchValuationMetric === "function",
  );

  // Cache-first: query the weekly market cache for the target before any live
  // metric call. A cache hit lets us skip the live target-metric search.
  const targetCache = supabase
    ? (await lookupMarketValuations(supabase, [companyName])).get(nameKey(companyName))
    : undefined;

  // Registry order puts the primary (Grok) source first. Only the primary gets
  // the single empty-set retry — a real company almost always has peers, so a
  // transient empty response is worth one more call. akta is NOT retried (cost
  // guard: at most two billable akta news calls per discovery run).
  const primary = sources[0];

  // Competitor discovery and the target's own valuation-metric fetch have no
  // data dependency — run both fan-outs concurrently in one outer Promise.all
  // (each per-call try/catch already isolates a single source's failure). The
  // self-metric fetch is skipped entirely when the market cache already answered
  // it (cache-hit-wins-over-live).
  const [perSource, selfObsRaw] = await Promise.all([
    Promise.all(
      sources.map(async (c) => {
        try {
          let list = (await c.fetchCompetitors(companyName, hint)) ?? [];
          if (list.length === 0 && c === primary && c.id !== "akta") {
            list = (await c.fetchCompetitors(companyName, hint)) ?? [];
          }
          return list;
        } catch {
          return [] as ConnectorCompetitor[];
        }
      }),
    ),
    targetCache
      ? Promise.resolve<Array<Omit<ConnectorCompetitor, "name"> | null>>([])
      : Promise.all(
          metricSources.map((c) =>
            c.fetchValuationMetric(companyName).catch(() => null),
          ),
        ),
  ]);
  const selfObservations = selfObsRaw.filter(
    (m): m is Omit<ConnectorCompetitor, "name"> => m != null,
  );

  const self: CompetitorDiscovery["self"] = targetCache
    ? {
        valuation: targetCache.valuation ?? undefined,
        valuationDate: targetCache.valuation_date ?? undefined,
        revenue: targetCache.revenue ?? undefined,
        revenueBasis: targetCache.revenue_basis ?? undefined,
        basis: targetCache.note ?? undefined,
        source: cacheSource(targetCache),
      }
    : pickSelfMetric(selfObservations);

  // Merge every source's list additively, keyed by case-insensitive name. Drop
  // self-references to the target and intra-merge dupes; on a name collision the
  // akta-sourced row wins over a same-name row from another source.
  const target = companyName.trim().toLowerCase();
  const byName = new Map<string, ConnectorCompetitor>();
  for (const list of perSource) {
    for (const c of list) {
      const key = c.name.trim().toLowerCase();
      if (!key || key === target) continue;
      const existing = byName.get(key);
      if (!existing || (isAktaSource(c.source) && !isAktaSource(existing.source))) {
        byName.set(key, c);
      }
    }
  }
  const unique = Array.from(byName.values());

  if (unique.length === 0) return { competitors: [], self };

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
