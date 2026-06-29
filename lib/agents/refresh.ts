import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { ingestCompany } from "@/lib/ingestion/orchestrator";

type DB = SupabaseClient<Database>;

const FIELDS =
  "id, name, website, sector, country, founded_year, description, founders";

export interface RefreshRunSummary {
  companies: number;
  refreshed: number;
  status: "success" | "partial";
  detail?: string;
}

/**
 * Daily refresh agent: re-runs the ingestion pipeline (Grok + SEC + Exa, in
 * parallel per company) for every tracked company so news / funding rounds /
 * valuations stay current. Service-role client → covers all users. Each company
 * is isolated: one failure degrades the run to "partial" without stopping it.
 */
export async function runDailyRefresh(supabase: DB): Promise<RefreshRunSummary> {
  const { data: companies, error } = await supabase
    .from("companies")
    .select(FIELDS);
  if (error) return { companies: 0, refreshed: 0, status: "partial", detail: error.message };

  let refreshed = 0;
  const errors: string[] = [];
  for (const c of companies ?? []) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ingestCompany(supabase, c as any);
      refreshed += 1;
    } catch (e) {
      errors.push(`${c.name}: ${(e as Error).message}`);
    }
  }

  return {
    companies: companies?.length ?? 0,
    refreshed,
    status: errors.length ? "partial" : "success",
    detail: errors.length ? errors.slice(0, 3).join("; ") : undefined,
  };
}
