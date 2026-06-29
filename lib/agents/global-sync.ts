import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { ingestCompany } from "@/lib/ingestion/orchestrator";
import { applyMappedIngest } from "@/lib/ingestion/apply";
import { exaFinancialsFor } from "@/lib/connectors/exa";
import { refreshCompetitorsFor, companyHint } from "@/lib/competitors/refresh";
import { purgeWrongEntitySignals } from "@/lib/enrichment/disambiguation";
import {
  sanitizeAllSources,
  type SanitizeSummary,
} from "@/lib/enrichment/sanitize-sources";
import { formatCurrency } from "@/lib/utils";

type DB = SupabaseClient<Database>;

const FIELDS =
  "id, user_id, name, website, sector, country, founded_year, description, founders";

export interface GlobalSyncSummary {
  companies: number;
  enriched: number;
  competitorsAdded: number;
  signalsBlocked: number;
  sanitized: SanitizeSummary;
  status: "success" | "partial";
  detail?: string;
}

/**
 * Global synchronization pipeline — runs across every portfolio company, then
 * sanitizes the whole database. Triggered on-demand (the "Sync" button) and by
 * the weekly cron. Each company is isolated so one failure degrades the run to
 * "partial" without stopping it. Stages, per company:
 *   1. Data enrichment        — re-run ingestion (Grok / Exa / SEC).
 *   2. Competitive landscape  — discover modern/AI-native peers (additive merge,
 *                               so manually-verified, sourced rows are preserved).
 *   3. Temporal financials    — latest valuation / revenue / secondary price.
 *   4. Signal disambiguation  — strip wrong-entity signals (e.g. Accrete Inc.
 *                               TYO:4395 quotes off private Accrete AI's feed).
 * Then once, globally:
 *   5. Source sanitization    — strip generic Exa/Grok/Perplexity labels and
 *                               resolve the underlying primary publisher.
 *
 * Pass a service-role client for the cron (covers all users); the RLS client
 * scopes to the signed-in user for the on-demand button.
 */
export async function runGlobalSync(supabase: DB): Promise<GlobalSyncSummary> {
  const { data: companies, error } = await supabase
    .from("companies")
    .select(FIELDS);
  const empty: SanitizeSummary = { scanned: 0, rewritten: 0, flagged: 0 };
  if (error)
    return { companies: 0, enriched: 0, competitorsAdded: 0, signalsBlocked: 0, sanitized: empty, status: "partial", detail: error.message };

  let enriched = 0, competitorsAdded = 0, signalsBlocked = 0;
  const errors: string[] = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const c of (companies ?? []) as Array<{
    id: string; user_id: string; name: string; description: string | null; sector: string | null;
  }>) {
    try {
      // 1. Data enrichment
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await ingestCompany(supabase, c as any);

      // 2. Competitive landscape modernization (additive — never overwrites verified)
      try {
        competitorsAdded += await refreshCompetitorsFor(
          supabase, c.id, c.name, c.user_id, companyHint(c.description, c.sector), { mode: "merge" },
        );
      } catch (e) {
        errors.push(`competitors ${c.name}: ${(e as Error).message}`);
      }

      // 3. Temporal financial verification
      try {
        const fin = await exaFinancialsFor(c.name);
        const valuations =
          fin.valuation != null
            ? [{ date: fin.valuationDate ?? today, post_money: fin.valuation, round: null, source: "exa" }]
            : [];
        if (fin.revenue != null || valuations.length) {
          await applyMappedIngest(supabase, c.id, {
            fundingRounds: [], valuations, news: [], revenue: fin.revenue, revenueSource: "exa",
          });
        }
        if (fin.secondaryPrice != null) {
          await supabase.from("company_events").insert({
            company_id: c.id, user_id: c.user_id, type: "secondary",
            title: `Secondary trading at ${formatCurrency(fin.secondaryPrice)}/share`,
            value: fin.secondaryPrice, source: "exa", url: fin.secondaryUrl ?? null, event_date: today,
          });
        }
      } catch (e) {
        errors.push(`financials ${c.name}: ${(e as Error).message}`);
      }

      // 4. Entity disambiguation / signal filtering
      const d = await purgeWrongEntitySignals(supabase, { id: c.id, name: c.name });
      signalsBlocked += d.eventsBlocked + d.newsBlocked;

      enriched++;
    } catch (e) {
      errors.push(`${c.name}: ${(e as Error).message}`);
    }
  }

  // 5. Global source-citation sanitization (after enrichment may have written
  //    fresh generic labels — resolves them to primary publishers).
  const sanitized = await sanitizeAllSources(supabase);

  return {
    companies: companies?.length ?? 0,
    enriched, competitorsAdded, signalsBlocked, sanitized,
    status: errors.length ? "partial" : "success",
    detail: errors.length ? errors.slice(0, 3).join("; ") : undefined,
  };
}
