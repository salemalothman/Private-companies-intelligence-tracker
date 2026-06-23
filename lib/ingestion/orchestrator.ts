import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Company } from "@/lib/types";
import { getConnectors } from "@/lib/connectors/registry";
import { mapConnectorResults, type ConnectorBatchResult } from "@/lib/ingestion/map";

export interface IngestSummary {
  source: string;
  roundsAdded: number;
  valuationsAdded: number;
  newsAdded: number;
  itemsFound: number;
  status: "success" | "partial" | "error";
  detail?: string;
}

type DB = SupabaseClient<Database>;

/**
 * Run the ingestion pipeline for one company: fetch from every enabled
 * connector, dedupe against existing rows, write new funding rounds /
 * valuations / news, backfill empty profile fields, and log the run.
 *
 * Best-effort: connector failures degrade to a 'partial' status and never throw.
 */
export async function ingestCompany(
  supabase: DB,
  company: Pick<Company, "id" | "name" | "website" | "sector" | "country" | "founded_year" | "description" | "founders">,
): Promise<IngestSummary> {
  const connectors = getConnectors();
  const batch: ConnectorBatchResult[] = [];
  let status: IngestSummary["status"] = "success";
  const errors: string[] = [];

  for (const c of connectors) {
    try {
      const [profile, rounds, news] = await Promise.all([
        c.fetchCompanyProfile(company.name),
        c.fetchFundingRounds(company.name),
        c.fetchNews(company.name),
      ]);
      batch.push({ source: c.id, profile, rounds, news });
    } catch (e) {
      status = "partial";
      errors.push(`${c.id}: ${(e as Error).message}`);
    }
  }

  const mapped = mapConnectorResults(batch);
  const source = connectors.map((c) => c.id).join(",");

  // Dedupe against what already exists for this company.
  const [{ data: existingRounds }, { data: existingVals }, { data: existingNews }] =
    await Promise.all([
      supabase.from("funding_rounds").select("round").eq("company_id", company.id),
      supabase.from("valuations").select("date, round").eq("company_id", company.id),
      supabase.from("news").select("title").eq("company_id", company.id),
    ]);

  const haveRound = new Set((existingRounds ?? []).map((r) => r.round.toLowerCase()));
  const haveVal = new Set(
    (existingVals ?? []).map((v) => `${v.date}|${(v.round ?? "").toLowerCase()}`),
  );
  const haveNews = new Set((existingNews ?? []).map((n) => n.title.toLowerCase()));

  const newRounds = mapped.fundingRounds.filter(
    (r) => !haveRound.has(r.round.toLowerCase()),
  );
  const newVals = mapped.valuations.filter(
    (v) => !haveVal.has(`${v.date}|${(v.round ?? "").toLowerCase()}`),
  );
  const newNews = mapped.news.filter((n) => !haveNews.has(n.title.toLowerCase()));

  if (newRounds.length) {
    const { error } = await supabase.from("funding_rounds").insert(
      newRounds.map((r) => ({
        company_id: company.id,
        round: r.round,
        date: r.date ?? null,
        amount_raised: r.amountRaised ?? null,
        valuation: r.valuation ?? null,
        investors: r.investors ?? null,
        lead_investor: r.leadInvestor ?? null,
        source: r.source,
      })),
    );
    if (error) status = "partial";
  }

  if (newVals.length) {
    const { error } = await supabase.from("valuations").insert(
      newVals.map((v) => ({
        company_id: company.id,
        date: v.date,
        round: v.round,
        post_money: v.post_money,
        source: v.source,
        confidence: "low" as const,
      })),
    );
    if (error) status = "partial";
  }

  if (newNews.length) {
    const { error } = await supabase.from("news").insert(
      newNews.map((n) => ({
        company_id: company.id,
        title: n.title,
        source: n.source,
        url: n.url ?? null,
        date: n.date ?? null,
        summary: n.summary ?? null,
      })),
    );
    if (error) status = "partial";
  }

  // Backfill only empty profile fields — never overwrite user input.
  const patch: {
    website?: string;
    sector?: string;
    country?: string;
    founded_year?: number;
    description?: string;
    founders?: string[];
  } = {};
  if (!company.website && mapped.profilePatch.website) patch.website = mapped.profilePatch.website;
  if (!company.sector && mapped.profilePatch.sector) patch.sector = mapped.profilePatch.sector;
  if (!company.country && mapped.profilePatch.country) patch.country = mapped.profilePatch.country;
  if (!company.founded_year && mapped.profilePatch.foundedYear)
    patch.founded_year = mapped.profilePatch.foundedYear;
  if (!company.description && mapped.profilePatch.description)
    patch.description = mapped.profilePatch.description;
  if ((!company.founders || company.founders.length === 0) && mapped.profilePatch.founders)
    patch.founders = mapped.profilePatch.founders;
  if (Object.keys(patch).length) {
    await supabase.from("companies").update(patch).eq("id", company.id);
  }

  const itemsFound = newRounds.length + newVals.length + newNews.length;
  const detail = errors.length ? errors.join("; ") : undefined;

  await supabase.from("ingestion_runs").insert({
    company_id: company.id,
    source,
    status,
    items_found: itemsFound,
    detail: detail ?? null,
  });

  return {
    source,
    roundsAdded: newRounds.length,
    valuationsAdded: newVals.length,
    newsAdded: newNews.length,
    itemsFound,
    status,
    detail,
  };
}
