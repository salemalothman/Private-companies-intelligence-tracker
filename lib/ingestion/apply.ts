import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import type { MappedIngest } from "@/lib/ingestion/map";
import { classifyNews } from "@/lib/news/classify";

type DB = SupabaseClient<Database>;

export interface ApplyResult {
  roundsAdded: number;
  valuationsAdded: number;
  newsAdded: number;
  competitorsAdded: number;
}

/** Competitor entities extracted from a document, routed to the Competitors tab. */
export interface ExtractedCompetitorInput {
  name: string;
  valuation?: number;
  revenue?: number;
  note?: string;
}

/**
 * Routes extracted entities into the asset's data views — funding_rounds,
 * valuations, and news — deduping against existing rows so re-processing is
 * idempotent. Shared by the connector ingestion pipeline (P4) and the document
 * intelligence pipeline (P5). All writes go through the caller's RLS client.
 */
export async function applyMappedIngest(
  supabase: DB,
  companyId: string,
  mapped: Pick<MappedIngest, "fundingRounds" | "valuations" | "news"> & {
    competitors?: ExtractedCompetitorInput[];
  },
): Promise<ApplyResult> {
  const [{ data: rounds }, { data: vals }, { data: news }, { data: comps }] =
    await Promise.all([
      supabase.from("funding_rounds").select("round").eq("company_id", companyId),
      supabase.from("valuations").select("date, round").eq("company_id", companyId),
      supabase.from("news").select("title").eq("company_id", companyId),
      supabase.from("competitors").select("name").eq("company_id", companyId),
    ]);

  const haveRound = new Set((rounds ?? []).map((r) => r.round.toLowerCase()));
  const haveVal = new Set(
    (vals ?? []).map((v) => `${v.date}|${(v.round ?? "").toLowerCase()}`),
  );
  const haveNews = new Set((news ?? []).map((n) => n.title.toLowerCase()));
  const haveComp = new Set((comps ?? []).map((c) => c.name.toLowerCase()));

  const newRounds = mapped.fundingRounds.filter(
    (r) => !haveRound.has(r.round.toLowerCase()),
  );
  const newVals = mapped.valuations.filter(
    (v) => !haveVal.has(`${v.date}|${(v.round ?? "").toLowerCase()}`),
  );
  const newNews = mapped.news.filter((n) => !haveNews.has(n.title.toLowerCase()));

  // Competitors extracted from the document — dedupe against existing rows and
  // within the batch (the table is unique on company_id + name).
  const seenComp = new Set<string>();
  const newComps = (mapped.competitors ?? []).filter((c) => {
    const k = c.name.trim().toLowerCase();
    if (!k || haveComp.has(k) || seenComp.has(k)) return false;
    seenComp.add(k);
    return true;
  });

  if (newRounds.length) {
    await supabase.from("funding_rounds").insert(
      newRounds.map((r) => ({
        company_id: companyId,
        round: r.round,
        date: r.date ?? null,
        amount_raised: r.amountRaised ?? null,
        valuation: r.valuation ?? null,
        investors: r.investors ?? null,
        lead_investor: r.leadInvestor ?? null,
        source: r.source,
      })),
    );
  }

  if (newVals.length) {
    await supabase.from("valuations").insert(
      newVals.map((v) => ({
        company_id: companyId,
        date: v.date,
        round: v.round,
        post_money: v.post_money,
        source: v.source,
        confidence: "low" as const,
      })),
    );
  }

  if (newNews.length) {
    await supabase.from("news").insert(
      newNews.map((n) => ({
        company_id: companyId,
        title: n.title,
        source: n.source,
        url: n.url ?? null,
        date: n.date ?? null,
        summary: n.summary ?? null,
        sentiment: n.sentiment ?? null,
        // Auto-tag material business deals / contract wins so the feed can
        // surface them as highlighted items.
        category: classifyNews(n.title, n.summary),
      })),
    );
  }

  if (newComps.length) {
    await supabase.from("competitors").insert(
      newComps.map((c) => ({
        company_id: companyId,
        name: c.name.trim(),
        valuation: c.valuation ?? null,
        revenue: c.revenue ?? null,
        source: "document",
        basis: c.note ?? null,
        sec_verified: false,
        is_self: false,
      })),
    );
  }

  return {
    roundsAdded: newRounds.length,
    valuationsAdded: newVals.length,
    newsAdded: newNews.length,
    competitorsAdded: newComps.length,
  };
}
