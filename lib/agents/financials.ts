import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { exaFinancialsFor } from "@/lib/connectors/exa";
import { applyMappedIngest } from "@/lib/ingestion/apply";
import { formatCurrency } from "@/lib/utils";

type DB = SupabaseClient<Database>;

/**
 * Temporal financial verification for a single company: fetch the latest
 * valuation / revenue / secondary price via Exa and route them onto the
 * company's profile. Shared by the manual per-company sync and the global sync
 * so the behaviour (and dedupe) stays in one place.
 *
 * Valuations/revenue flow through applyMappedIngest (which applies the
 * write-time timeline + revenue guards). The secondary-price event is deduped
 * against the company_events unique index so a same-day re-run doesn't raise a
 * duplicate-key error.
 */
export async function verifyFinancialsFor(
  supabase: DB,
  company: { id: string; user_id: string; name: string },
): Promise<void> {
  const fin = await exaFinancialsFor(company.name);
  const today = new Date().toISOString().slice(0, 10);

  const valuations =
    fin.valuation != null
      ? [{ date: fin.valuationDate ?? today, post_money: fin.valuation, round: null, source: "exa" }]
      : [];
  if (fin.revenue != null || valuations.length) {
    await applyMappedIngest(supabase, company.id, {
      fundingRounds: [],
      valuations,
      news: [],
      revenue: fin.revenue,
      revenueSource: "exa",
    });
  }

  if (fin.secondaryPrice != null) {
    const title = `Secondary trading at ${formatCurrency(fin.secondaryPrice)}/share`;
    // Dedupe against the (company_id, type, title, event_date) unique index.
    const { data: existing } = await supabase
      .from("company_events")
      .select("id")
      .eq("company_id", company.id)
      .eq("type", "secondary")
      .eq("title", title)
      .eq("event_date", today)
      .maybeSingle();
    if (!existing) {
      await supabase.from("company_events").insert({
        company_id: company.id,
        user_id: company.user_id,
        type: "secondary",
        title,
        value: fin.secondaryPrice,
        source: "exa",
        url: fin.secondaryUrl ?? null,
        event_date: today,
      });
    }
  }
}
