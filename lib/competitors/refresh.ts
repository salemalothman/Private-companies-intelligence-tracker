import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { discoverCompetitors } from "@/lib/competitors/discover";

type DB = SupabaseClient<Database>;

/** Build a grounding hint about what the company does (skips stub text). */
export function companyHint(
  description?: string | null,
  sector?: string | null,
): string | undefined {
  const d = (description ?? "").trim();
  const usable =
    d && !/stub connector|tracked via|private company tracked/i.test(d) ? d : "";
  const parts = [
    usable,
    sector && sector.trim().toUpperCase() !== "AI" ? `sector: ${sector}` : "",
  ].filter(Boolean);
  return parts.length ? parts.join("; ") : undefined;
}

type Discovered = Awaited<ReturnType<typeof discoverCompetitors>>["competitors"][number];

const toRow = (
  companyId: string,
  userId: string,
  c: Discovered,
  isSelf: boolean,
) => ({
  company_id: companyId,
  user_id: userId,
  name: c.name,
  valuation: c.valuation ?? null,
  valuation_date: c.valuationDate ?? null,
  revenue: c.revenue ?? null,
  revenue_basis: c.revenueBasis ?? null,
  source: c.source,
  basis: c.basis ?? null,
  sec_verified: isSelf ? false : c.secVerified,
  is_self: isSelf,
});

export interface RefreshOptions {
  /**
   * "replace" (default) wipes and rewrites the set — used by the manual
   * "Find competitors" button. "merge" only ADDS newly-discovered competitors
   * and never deletes or overwrites existing rows — used by the global sync so
   * manually-verified, primary-sourced entries are preserved.
   */
  mode?: "replace" | "merge";
}

/**
 * Discover the competitive landscape (Grok + SEC + market cache) and persist it.
 * Returns the number of competitors written. Throws only on a DB write error.
 */
export async function refreshCompetitorsFor(
  supabase: DB,
  companyId: string,
  companyName: string,
  userId: string,
  hint?: string,
  opts: RefreshOptions = {},
): Promise<number> {
  const mode = opts.mode ?? "replace";
  const { competitors, self } = await discoverCompetitors(companyName, supabase, hint);
  if (competitors.length === 0) return 0;

  if (mode === "merge") {
    // Additive: only insert competitors we don't already track (case-insensitive).
    const { data: existing } = await supabase
      .from("competitors")
      .select("name")
      .eq("company_id", companyId);
    const have = new Set((existing ?? []).map((e) => e.name.trim().toLowerCase()));
    const fresh = competitors.filter((c) => !have.has(c.name.trim().toLowerCase()));
    if (fresh.length) {
      const { error } = await supabase
        .from("competitors")
        .insert(fresh.map((c) => toRow(companyId, userId, c, false)));
      if (error) throw new Error(error.message);
    }
    return fresh.length;
  }

  // replace: rewrite the whole set
  await supabase.from("competitors").delete().eq("company_id", companyId);
  const rows = competitors.map((c) => toRow(companyId, userId, c, false));
  if (self && (self.revenue != null || self.valuation != null)) {
    rows.push(toRow(companyId, userId, { ...self, name: companyName } as Discovered, true));
  }
  const { error } = await supabase.from("competitors").insert(rows);
  if (error) throw new Error(error.message);
  return competitors.length;
}
