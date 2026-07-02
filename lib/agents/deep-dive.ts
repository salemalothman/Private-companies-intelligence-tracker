import "server-only";
import type { RankedEntity } from "@/lib/competitors/rank";
import type { CanonicalRecord } from "@/lib/canonical";
import type { AnalysisValuation } from "@/lib/agents/deep-dive-types";

/**
 * Linear-interpolation percentile (the R-7 / Excel `PERCENTILE.INC` method) over
 * an already-sorted ascending array. For quantile q in [0,1] the fractional rank
 * is `q·(N-1)`; the result interpolates between the two straddling samples. Over
 * `[2,4,6,8]` this yields p25=3.5, median=5, p75=6.5. Returns null for an empty set —
 * we never fabricate a percentile out of no data.
 */
function percentile(sortedAsc: number[], q: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const rank = q * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/**
 * Peer-multiple percentiles, computed IN CODE (never by the LLM) from the ranked
 * competitor set. Only non-target peers that are BOTH SEC-verified and carry a
 * finite V/R `multiple` feed the median/p25/p75; when none qualify the percentiles
 * are null (not zero, not invented). `n_sec_verified` counts the peers that fed the
 * percentiles; `n_peers` counts every non-target ranked peer considered.
 */
export function computePeerMultiple(
  ranked: RankedEntity[],
): AnalysisValuation["peer_multiple"] {
  const peers = ranked.filter((r) => !r.isTarget);
  const secVerifiedMultiples = peers
    .filter((r) => r.secVerified && r.multiple != null && Number.isFinite(r.multiple))
    .map((r) => r.multiple as number)
    .sort((a, b) => a - b);

  return {
    median: percentile(secVerifiedMultiples, 0.5),
    p25: percentile(secVerifiedMultiples, 0.25),
    p75: percentile(secVerifiedMultiples, 0.75),
    n_peers: peers.length,
    n_sec_verified: secVerifiedMultiples.length,
  };
}

/**
 * Base revenue for the comps model, taken verbatim from the canonical record —
 * never invented. The value is `canonical.revenue.value`; the source is the label
 * of the observation that set the canonical `asOf` date (may be null). `CanonicalField`
 * has no top-level `.source`, so the source is derived from the matching observation.
 */
export function deriveBaseRevenue(
  canonical: CanonicalRecord,
): AnalysisValuation["base_revenue"] {
  const { value, asOf, observations } = canonical.revenue;
  const source =
    observations.find((o) => o.date === asOf)?.source ?? null;
  return { value, source };
}
