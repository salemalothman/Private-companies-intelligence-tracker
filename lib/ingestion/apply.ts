import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import type { MappedIngest } from "@/lib/ingestion/map";
import { classifyNews } from "@/lib/news/classify";
import { buildIngestEvents } from "@/lib/events";
import { filterIngestValuations } from "@/lib/enrichment/timeline-validation";

type DB = SupabaseClient<Database>;

export interface ApplyResult {
  roundsAdded: number;
  valuationsAdded: number;
  newsAdded: number;
  competitorsAdded: number;
  revenueUpdated: boolean;
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
    /** The subject company's own revenue / ARR (financial profile). */
    revenue?: number;
    revenueSource?: string;
  },
): Promise<ApplyResult> {
  const [
    { data: rounds },
    { data: vals },
    { data: news },
    { data: comps },
    { data: company },
    { data: priorEvents },
  ] = await Promise.all([
    supabase.from("funding_rounds").select("round").eq("company_id", companyId),
    supabase
      .from("valuations")
      .select("date, round, post_money, source")
      .eq("company_id", companyId),
    supabase.from("news").select("title").eq("company_id", companyId),
    supabase.from("competitors").select("name").eq("company_id", companyId),
    supabase.from("companies").select("user_id").eq("id", companyId).maybeSingle(),
    supabase
      .from("portfolio_events")
      .select("type, title, occurred_at")
      .eq("company_id", companyId),
  ]);

  const haveRound = new Set((rounds ?? []).map((r) => r.round.toLowerCase()));
  const haveVal = new Set(
    (vals ?? []).map((v) => `${v.date}|${(v.round ?? "").toLowerCase()}`),
  );
  const haveNews = new Set((news ?? []).map((n) => n.title.toLowerCase()));
  const haveComp = new Set((comps ?? []).map((c) => c.name.toLowerCase()));

  // Most recent existing post-money, for valuation-delta events.
  const previousPostMoney =
    [...(vals ?? [])]
      .filter((v) => v.post_money != null)
      .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""))[0]?.post_money ??
    null;

  const newRounds = mapped.fundingRounds.filter(
    (r) => !haveRound.has(r.round.toLowerCase()),
  );
  const dedupedVals = mapped.valuations.filter(
    (v) => !haveVal.has(`${v.date}|${(v.round ?? "").toLowerCase()}`),
  );
  // Write-time timeline guard: reject backdated/hallucinated valuations from
  // untrusted sources before they land (e.g. a $9B value backdated to 2023 from
  // an "exa" label that would contradict a later verified round).
  const { accepted: newVals, rejected: rejectedVals } = filterIngestValuations(
    (vals ?? []) as { date: string | null; post_money: number | null; source: string | null }[],
    dedupedVals,
  );
  if (rejectedVals.length) {
    console.warn(
      `applyMappedIngest: rejected ${rejectedVals.length} valuation(s) for ${companyId}:`,
      rejectedVals.map((r) => `${r.entry.date} $${r.entry.post_money} (${r.reasons.join(", ")})`).join("; "),
    );
  }
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

  // Map the subject company's own revenue onto its durable financial profile.
  let revenueUpdated = false;
  if (mapped.revenue != null && mapped.revenue > 0) {
    const { error: revErr } = await supabase
      .from("companies")
      .update({
        revenue: mapped.revenue,
        revenue_source: mapped.revenueSource ?? "document",
        revenue_date: new Date().toISOString().slice(0, 10),
      })
      .eq("id", companyId);
    revenueUpdated = !revErr;
  }

  // Record material changes to the portfolio activity feed (deduped against
  // both prior events and the table's unique index, so daily re-runs are safe).
  const userId = company?.user_id;
  if (userId) {
    // Respect the user's alert preferences (muted types + valuation threshold).
    const { data: prefsRow } = await supabase
      .from("alert_prefs")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    const prefs = prefsRow
      ? {
          types: (
            [
              "funding_round",
              "valuation",
              "contract_win",
              "competitor",
            ] as const
          ).filter((t) => prefsRow[t]),
          valuationMinPct: prefsRow.valuation_min_pct,
        }
      : undefined;

    const seen = new Set(
      (priorEvents ?? []).map(
        (e) => `${e.type}|${e.title}|${e.occurred_at ?? ""}`,
      ),
    );
    const events = buildIngestEvents({
      rounds: newRounds,
      valuations: newVals,
      news: newNews,
      competitors: newComps,
      previousPostMoney,
      prefs,
    }).filter((e) => !seen.has(`${e.type}|${e.title}|${e.occurredAt ?? ""}`));

    if (events.length) {
      await supabase.from("portfolio_events").insert(
        events.map((e) => ({
          company_id: companyId,
          user_id: userId,
          type: e.type,
          title: e.title,
          detail: e.detail ?? null,
          source: e.source ?? null,
          occurred_at: e.occurredAt ?? null,
        })),
      );
    }
  }

  return {
    roundsAdded: newRounds.length,
    valuationsAdded: newVals.length,
    newsAdded: newNews.length,
    competitorsAdded: newComps.length,
    revenueUpdated,
  };
}
