import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, MarketValuationRow } from "@/lib/types";
import { nameKey } from "@/lib/market-cache/parse";

type DB = SupabaseClient<Database>;

/**
 * Look up cached market valuations for a set of company names, keyed by
 * normalized name. Reads the global `market_valuations` cache (authenticated
 * read) so callers can instantly populate metrics before any live search.
 */
export async function lookupMarketValuations(
  supabase: DB,
  names: string[],
): Promise<Map<string, MarketValuationRow>> {
  const keys = [...new Set(names.map(nameKey).filter(Boolean))];
  if (keys.length === 0) return new Map();
  const { data } = await supabase
    .from("market_valuations")
    .select("*")
    .in("name_key", keys);
  return new Map((data ?? []).map((r) => [r.name_key, r]));
}
