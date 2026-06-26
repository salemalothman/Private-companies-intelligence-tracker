import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { exaValuationFor } from "@/lib/connectors/exa";
import { nameKey } from "@/lib/market-cache/parse";

type DB = SupabaseClient<Database>;

/** Top private companies to refresh weekly via Exa web search. */
const TOP_PRIVATE = [
  "OpenAI", "Anthropic", "SpaceX", "Stripe", "Databricks", "xAI", "Anduril",
  "Ramp", "Canva", "Revolut", "Figure AI", "Mistral AI", "Anysphere", "Perplexity",
  "Scale AI", "Shield AI", "Cohere", "Discord", "Plaid", "Brex", "Chime", "Notion",
  "Airtable", "Figma", "Deel", "Rippling", "Gusto", "Epic Games", "Fanatics",
  "Klarna", "Grammarly", "Miro", "Vanta", "Glean", "Harvey", "Sierra", "ElevenLabs",
  "Mercury", "Whatnot", "Gecko Robotics", "Vannevar Labs", "Helsing", "Lambda",
  "Together AI", "Hugging Face", "Replit", "Linear", "Vercel", "Supabase", "Cursor",
];

const CONCURRENCY = 5;

/**
 * Weekly sweep: query Exa for the latest valuation of each top private company
 * and upsert into the global `market_valuations` cache (preserving any existing
 * revenue figure). Powers cache-first competitor discovery. Returns the number
 * of companies refreshed. No-op without EXA_API_KEY.
 */
export async function exaMarketSweep(supabase: DB): Promise<number> {
  if (!process.env.EXA_API_KEY) return 0;

  const found: { name: string; valuation: number; date?: string }[] = [];
  for (let i = 0; i < TOP_PRIVATE.length; i += CONCURRENCY) {
    const slice = TOP_PRIVATE.slice(i, i + CONCURRENCY);
    const metrics = await Promise.all(
      slice.map(async (name) => ({ name, m: await exaValuationFor(name) })),
    );
    for (const r of metrics) {
      if (r.m?.valuation != null) {
        found.push({ name: r.name, valuation: r.m.valuation, date: r.m.date });
      }
    }
  }
  if (found.length === 0) return 0;

  const today = new Date().toISOString().slice(0, 10);
  const keys = found.map((f) => nameKey(f.name));
  const { data: existing } = await supabase
    .from("market_valuations")
    .select("name_key, revenue")
    .in("name_key", keys);
  const prevRevenue = new Map(
    (existing ?? []).map((r) => [r.name_key, r.revenue]),
  );

  const rows = found.map((f) => ({
    name: f.name,
    name_key: nameKey(f.name),
    valuation: f.valuation,
    valuation_date: f.date ?? today,
    revenue: prevRevenue.get(nameKey(f.name)) ?? null,
    source: "exa",
    as_of: f.date ?? today,
    note: "Exa web search",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("market_valuations")
    .upsert(rows, { onConflict: "name_key" });
  if (error) throw new Error(`exa cache upsert: ${error.message}`);
  return rows.length;
}
