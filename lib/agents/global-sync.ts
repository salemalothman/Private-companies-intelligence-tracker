import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { ingestCompany } from "@/lib/ingestion/orchestrator";
import { runExaEventsSync } from "@/lib/agents/exa-events";
import { verifyFinancialsFor } from "@/lib/agents/financials";
import { refreshCompetitorsFor, companyHint } from "@/lib/competitors/refresh";
import { purgeWrongEntitySignals } from "@/lib/enrichment/disambiguation";
import {
  sanitizeAllSources,
  type SanitizeSummary,
} from "@/lib/enrichment/sanitize-sources";
import {
  validateAllTimelines,
  type TimelineValidationSummary,
} from "@/lib/enrichment/timeline-validation";
import {
  sweepRoundHygiene,
  type RoundHygieneSummary,
} from "@/lib/enrichment/round-hygiene";

type DB = SupabaseClient<Database>;

const FIELDS =
  "id, user_id, name, website, sector, country, founded_year, description, founders";

export interface GlobalSyncSummary {
  companies: number;
  enriched: number;
  competitorsAdded: number;
  signalsBlocked: number;
  timeline: TimelineValidationSummary;
  hygiene: RoundHygieneSummary;
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
  const emptyTimeline: TimelineValidationSummary = { scanned: 0, stripped: 0, flagged: 0 };
  const emptyHygiene: RoundHygieneSummary = { companies: 0, merged: 0, deleted: 0, backfilled: 0 };
  if (error)
    return { companies: 0, enriched: 0, competitorsAdded: 0, signalsBlocked: 0, timeline: emptyTimeline, hygiene: emptyHygiene, sanitized: empty, status: "partial", detail: error.message };

  let enriched = 0, competitorsAdded = 0, signalsBlocked = 0;
  const errors: string[] = [];
  const list = (companies ?? []) as Array<{
    id: string;
    user_id: string;
    name: string;
    website: string | null;
    sector: string | null;
    country: string | null;
    founded_year: number | null;
    founders: string[] | null;
    description: string | null;
  }>;

  const processCompany = async (c: (typeof list)[number]) => {
    try {
      // 1. Data enrichment
      await ingestCompany(supabase, c);

      // 2. Competitive landscape modernization (additive — never overwrites verified)
      try {
        competitorsAdded += await refreshCompetitorsFor(
          supabase, c.id, c.name, c.user_id, companyHint(c.description, c.sector), { mode: "merge" },
        );
      } catch (e) {
        errors.push(`competitors ${c.name}: ${(e as Error).message}`);
      }

      // 3. Temporal financial verification (shared with the per-company sync)
      try {
        await verifyFinancialsFor(supabase, c);
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
  };

  // Companies are independent (keyed by company_id) and the per-company work is
  // I/O-bound on external APIs, so process in small parallel batches to bound
  // total wall-time (and stay within the cron's maxDuration).
  const CONCURRENCY = 4;
  for (let i = 0; i < list.length; i += CONCURRENCY) {
    await Promise.all(list.slice(i, i + CONCURRENCY).map(processCompany));
  }

  // 4b. Events sweep — scheduled corporate events, fresh valuations, and
  //     secondary prices (folded into Sync so it's the single on-demand action).
  try {
    await runExaEventsSync(supabase);
  } catch (e) {
    errors.push(`events: ${(e as Error).message}`);
  }

  // 5a. Round hygiene — persist the same-raise dedupe (unnamed amount-only
  //     events fold into their named round in the DB, not just at render) and
  //     backfill timeline rows from rounds' recorded post-money. Runs BEFORE
  //     timeline validation so the backfilled figures arm the monotonic guard.
  let hygiene: RoundHygieneSummary = emptyHygiene;
  try {
    hygiene = await sweepRoundHygiene(supabase);
  } catch (e) {
    errors.push(`hygiene: ${(e as Error).message}`);
  }

  // 5b. Timeline validation — strip backdated/hallucinated valuations that break
  //    monotonic growth or lack a trusted primary source (re-leaked by enrichment).
  const timeline = await validateAllTimelines(supabase);

  // 6. Global source-citation sanitization (after enrichment may have written
  //    fresh generic labels — resolves them to primary publishers).
  const sanitized = await sanitizeAllSources(supabase);

  return {
    companies: companies?.length ?? 0,
    enriched, competitorsAdded, signalsBlocked, timeline, hygiene, sanitized,
    status: errors.length ? "partial" : "success",
    detail: errors.length ? errors.slice(0, 3).join("; ") : undefined,
  };
}
