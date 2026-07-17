import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Company } from "@/lib/types";
import { safeHttpUrl } from "@/lib/utils";
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

  // Run every connector (Grok X-search, SEC EDGAR, Exa web search) concurrently
  // so a sync takes as long as the slowest source, not the sum. Each connector
  // is isolated: a single failure degrades the run to "partial" without
  // blocking the others.
  const settled = await Promise.all(
    connectors.map(async (c) => {
      try {
        const [profile, rounds, news, signals] = await Promise.all([
          c.fetchCompanyProfile(company.name),
          c.fetchFundingRounds(company.name),
          c.fetchNews(company.name),
          c.fetchSocialSignals?.(company.name) ?? Promise.resolve([]),
        ]);
        return {
          ok: true as const,
          result: { source: c.id, profile, rounds, news, signals },
        };
      } catch (e) {
        return { ok: false as const, id: c.id, error: (e as Error).message };
      }
    }),
  );

  for (const s of settled) {
    if (s.ok) batch.push(s.result);
    else {
      status = "partial";
      errors.push(`${s.id}: ${s.error}`);
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
  // Defense-in-depth URL-scheme guard on the connector-supplied website before
  // it lands in the profile: bare domains ("openai.com") are legitimate and pass
  // through, but a SCHEMED value must be http(s) — a javascript:/data: "website"
  // from any connector is dropped rather than stored.
  const patchWebsite = mapped.profilePatch.website?.trim();
  const websiteSafe =
    patchWebsite &&
    (!/^[a-z][a-z0-9+.-]*:/i.test(patchWebsite) || safeHttpUrl(patchWebsite));
  if (!company.website && patchWebsite && websiteSafe) patch.website = patchWebsite;
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
