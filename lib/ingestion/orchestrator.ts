import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Company } from "@/lib/types";
import { getConnectors } from "@/lib/connectors/registry";
import { mapConnectorResults, type ConnectorBatchResult } from "@/lib/ingestion/map";
import { applyMappedIngest } from "@/lib/ingestion/apply";

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
      const [profile, rounds, news, signals] = await Promise.all([
        c.fetchCompanyProfile(company.name),
        c.fetchFundingRounds(company.name),
        c.fetchNews(company.name),
        c.fetchSocialSignals?.(company.name) ?? Promise.resolve([]),
      ]);
      batch.push({ source: c.id, profile, rounds, news, signals });
    } catch (e) {
      status = "partial";
      errors.push(`${c.id}: ${(e as Error).message}`);
    }
  }

  const mapped = mapConnectorResults(batch);
  const source = connectors.map((c) => c.id).join(",");

  const applied = await applyMappedIngest(supabase, company.id, mapped);

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

  const itemsFound =
    applied.roundsAdded + applied.valuationsAdded + applied.newsAdded;
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
    roundsAdded: applied.roundsAdded,
    valuationsAdded: applied.valuationsAdded,
    newsAdded: applied.newsAdded,
    itemsFound,
    status,
    detail,
  };
}
