import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { fetchAgDillonSegments } from "@/lib/market-cache/sources";
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
 * Weekly market-intelligence run. Parses the AG Dillon archive, upserts the
 * latest valuation / revenue per company into the `market_valuations` cache,
 * then propagates any figure newer than what we hold to matching companies
 * already in the database. Best-effort and idempotent.
 *
 * Requires a service-role client — it writes the global cache and updates rows
 * across every user, both of which bypass RLS.
 */
export async function runMarketSync(supabase: DB): Promise<MarketSyncSummary> {
  let data: MarketDatum[];
  try {
    // Cover a deep window of recent issues (headlines span the full index).
    const { headlines, bodies } = await fetchAgDillonSegments(12);
    // Headlines are the trusted, structured source. Body prose only enriches
    // figures for companies the headlines already name — this keeps editorial
    // sentences ("Prediction markets...", "Several firms...") out of the cache.
    const headlineData = parseSegmentsRaw(headlines);
    const known = new Set(headlineData.map((d) => d.nameKey));
    const bodyData = parseSegmentsRaw(bodies).filter((d) => known.has(d.nameKey));
    data = mergeData([...headlineData, ...bodyData]);
  } catch (e) {
    const detail = `fetch/parse failed: ${(e as Error).message}`;
    await logRun(supabase, { cached: 0, updated: 0, status: "error", detail });
    return { cached: 0, updated: 0, status: "error", detail };
  }

  const cached = await upsertCache(supabase, data);
  const updated = await syncCompanies(supabase, data);

  const summary: MarketSyncSummary = { cached, updated, status: "success" };
  await logRun(supabase, summary);
  return summary;
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
 * For every company in the system whose name matches a cached figure, insert a
 * fresh valuation point when the cached figure is more recent than the latest
 * we hold. Idempotent: skips when a same-date AG Dillon valuation already exists.
 */
async function syncCompanies(supabase: DB, data: MarketDatum[]): Promise<number> {
  const byKey = new Map(data.map((d) => [d.nameKey, d]));
  const { data: companies } = await supabase.from("companies").select("id, name");
  if (!companies?.length) return 0;

  let updated = 0;
  for (const co of companies) {
    const datum = byKey.get(nameKey(co.name));
    if (!datum || datum.valuation == null) continue;

    const { data: vals } = await supabase
      .from("valuations")
      .select("date, source, post_money")
      .eq("company_id", co.id)
      .order("date", { ascending: false });

    const latest = vals?.[0];
    // Only act on a strictly newer figure than our most-recent record.
    if (latest && datum.asOf <= latest.date) continue;
    // Idempotency: don't duplicate the same AG Dillon point.
    if ((vals ?? []).some((v) => v.date === datum.asOf && v.source === SOURCE)) continue;

    const { error } = await supabase.from("valuations").insert({
      company_id: co.id,
      date: datum.asOf,
      round: "Secondary (AG Dillon)",
      post_money: datum.valuation,
      source: SOURCE,
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
