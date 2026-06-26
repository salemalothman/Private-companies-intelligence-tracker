import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { fetchAgDillonSegments } from "@/lib/market-cache/sources";
import { exaMarketSweep } from "@/lib/market-cache/exa-sweep";
import {
  parseSegmentsRaw,
  mergeData,
  nameKey,
  type MarketDatum,
} from "@/lib/market-cache/parse";

type DB = SupabaseClient<Database>;

export interface MarketSyncSummary {
  cached: number;
  updated: number;
  status: "success" | "partial" | "error";
  detail?: string;
}

const SOURCE = "agdillon";

/**
 * Weekly market-intelligence run. Pulls the latest valuations from the trusted
 * sources — the AG Dillon archive and Exa web search across the top private
 * companies — upserts them into the `market_valuations` cache, then propagates
 * any figure newer than what we hold to matching companies in the database.
 * Each source is best-effort; the run only fails if everything does.
 *
 * Requires a service-role client — it writes the global cache and updates rows
 * across every user, both of which bypass RLS.
 */
export async function runMarketSync(supabase: DB): Promise<MarketSyncSummary> {
  const errors: string[] = [];

  let agdCached = 0;
  try {
    // Cover a deep window of recent issues (headlines span the full index).
    const { headlines, bodies } = await fetchAgDillonSegments(12);
    // Headlines are the trusted, structured source. Body prose only enriches
    // figures for companies the headlines already name — this keeps editorial
    // sentences ("Prediction markets...", "Several firms...") out of the cache.
    const headlineData = parseSegmentsRaw(headlines);
    const known = new Set(headlineData.map((d) => d.nameKey));
    const bodyData = parseSegmentsRaw(bodies).filter((d) => known.has(d.nameKey));
    agdCached = await upsertCache(supabase, mergeData([...headlineData, ...bodyData]));
  } catch (e) {
    errors.push(`agdillon: ${(e as Error).message}`);
  }

  let exaCached = 0;
  try {
    exaCached = await exaMarketSweep(supabase);
  } catch (e) {
    errors.push(`exa: ${(e as Error).message}`);
  }

  let updated = 0;
  try {
    updated = await syncCompaniesFromCache(supabase);
  } catch (e) {
    errors.push(`sync: ${(e as Error).message}`);
  }

  const cached = agdCached + exaCached;
  const status: MarketSyncSummary["status"] =
    errors.length === 0 ? "success" : cached > 0 ? "partial" : "error";
  const detail = errors.length ? errors.join("; ") : undefined;
  await logRun(supabase, { cached, updated, status, detail });
  return { cached, updated, status, detail };
}

/** Upsert merged data into the cache, never overwriting a value with null. */
async function upsertCache(supabase: DB, data: MarketDatum[]): Promise<number> {
  if (data.length === 0) return 0;
  const keys = data.map((d) => d.nameKey);
  const { data: existing } = await supabase
    .from("market_valuations")
    .select("name_key, valuation, revenue, valuation_date")
    .in("name_key", keys);
  const prev = new Map((existing ?? []).map((r) => [r.name_key, r]));

  const rows = data.map((d) => {
    const p = prev.get(d.nameKey);
    return {
      name: d.name,
      name_key: d.nameKey,
      valuation: d.valuation ?? p?.valuation ?? null,
      valuation_date: d.valuation != null ? d.asOf : (p?.valuation_date ?? null),
      revenue: d.revenue ?? p?.revenue ?? null,
      revenue_basis: d.revenue != null ? d.note : null,
      source: SOURCE,
      source_url: d.sourceUrl ?? null,
      as_of: d.asOf,
      note: d.note,
      updated_at: new Date().toISOString(),
    };
  });

  const { error } = await supabase
    .from("market_valuations")
    .upsert(rows, { onConflict: "name_key" });
  if (error) throw new Error(`cache upsert: ${error.message}`);
  return rows.length;
}

/**
 * For every company in the system whose name matches a cached figure (from any
 * source — AG Dillon or Exa), insert a fresh valuation point when the cached
 * figure is more recent than the latest we hold. Idempotent: skips when a
 * same-date market-cache valuation already exists.
 */
async function syncCompaniesFromCache(supabase: DB): Promise<number> {
  const { data: companies } = await supabase.from("companies").select("id, name");
  if (!companies?.length) return 0;

  const byKey = new Map(companies.map((c) => [nameKey(c.name), c]));
  const { data: cache } = await supabase
    .from("market_valuations")
    .select("name_key, valuation, valuation_date, as_of, source")
    .in("name_key", [...byKey.keys()]);

  let updated = 0;
  for (const row of cache ?? []) {
    const co = byKey.get(row.name_key);
    if (!co || row.valuation == null) continue;
    const asOf = row.valuation_date ?? row.as_of;
    if (!asOf) continue;

    const { data: vals } = await supabase
      .from("valuations")
      .select("date, source")
      .eq("company_id", co.id)
      .order("date", { ascending: false });

    const latest = vals?.[0];
    if (latest && asOf <= latest.date) continue; // not newer
    // Idempotency: don't duplicate the same market-cache point.
    if ((vals ?? []).some((v) => v.date === asOf && (v.source ?? "").endsWith(row.source ?? "")))
      continue;

    const { error } = await supabase.from("valuations").insert({
      company_id: co.id,
      date: asOf,
      round: "Secondary (market cache)",
      post_money: row.valuation,
      source: row.source ?? "market-cache",
      confidence: "low",
    });
    if (!error) updated += 1;
  }
  return updated;
}

async function logRun(
  supabase: DB,
  s: { cached: number; updated: number; status: string; detail?: string },
): Promise<void> {
  await supabase.from("market_sync_runs").insert({
    source: SOURCE,
    cached: s.cached,
    updated: s.updated,
    status: s.status,
    detail: s.detail ?? null,
  });
}
