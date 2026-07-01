"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { runGlobalSync, type GlobalSyncSummary } from "@/lib/agents/global-sync";
import type { AlertPrefsView } from "@/lib/queries";

/** Mark all of the current user's activity events as seen (clears the badge). */
export async function markEventsSeen(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("portfolio_events")
    .update({ seen: true })
    .eq("seen", false); // RLS scopes this to the user's own rows
  revalidatePath("/dashboard");
}

/** Save the current user's alert preferences. */
export async function updateAlertPrefs(prefs: AlertPrefsView): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("alert_prefs").upsert(
    {
      user_id: user.id,
      funding_round: prefs.funding_round,
      valuation: prefs.valuation,
      contract_win: prefs.contract_win,
      competitor: prefs.competitor,
      valuation_min_pct: Number.isFinite(prefs.valuation_min_pct)
        ? prefs.valuation_min_pct
        : 0,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  revalidatePath("/dashboard");
}

/**
 * On-demand global sync: enrich, modernize competitors, verify financials,
 * disambiguate signals, and sanitize all source citations across the portfolio.
 */
export async function syncAllCompanies(): Promise<
  GlobalSyncSummary | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  const summary = await runGlobalSync(supabase);
  revalidatePath("/dashboard");
  revalidatePath("/companies");
  revalidatePath("/companies/[id]", "page"); // refresh every company detail page
  return summary;
}
