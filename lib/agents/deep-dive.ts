import "server-only";
import type { RankedEntity } from "@/lib/competitors/rank";
import type { CanonicalRecord } from "@/lib/canonical";
import type { AnalysisValuation } from "@/lib/agents/deep-dive-types";

// RED stub — intentionally incorrect until the GREEN step implements the math.
export function computePeerMultiple(
  _ranked: RankedEntity[],
): AnalysisValuation["peer_multiple"] {
  return { median: null, p25: null, p75: null, n_peers: 0, n_sec_verified: 0 };
}

export function deriveBaseRevenue(
  _canonical: CanonicalRecord,
): AnalysisValuation["base_revenue"] {
  return { value: null, source: null };
}
