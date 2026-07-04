import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, FundingRoundRow, ValuationRow } from "@/lib/types";
import { dedupeFundingRows } from "@/lib/ingestion/dedupe";
import { filterIngestValuations } from "@/lib/enrichment/timeline-validation";

/**
 * Funding-round hygiene sweep — makes the render-time dedupe durable and keeps
 * the valuation timeline complete, for EVERY company.
 *
 * Two idempotent repairs per company:
 *  1. PERSISTENT DEDUPE — `dedupeFundingRows` (same-raise matching on valuation
 *     OR amount within the date window) is applied to the stored rows: the
 *     surviving primary is updated with the merged metadata and the absorbed
 *     duplicates are deleted, so the DB converges on what the UI already shows
 *     (e.g. "Funding (Exa)" folded into "Series H").
 *  2. VALUATION BACKFILL — a funding round that RECORDS a post-money must also
 *     appear on the valuation timeline (Series H's $965B was missing, so the
 *     chart under-reported and the monotonic guard had no reference). Restates
 *     the round's own recorded figure — never invents one.
 *
 * The planner is pure (unit-tested); the applier is thin I/O. Wired into the
 * weekly global sync so new duplicates self-heal, and runnable on demand via
 * scripts/sweep-data-hygiene.ts.
 */

type DB = SupabaseClient<Database>;

const BACKFILL_WINDOW_DAYS = 3;

function withinDays(a: string, b: string, n: number): boolean {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta) || Number.isNaN(tb)) return false;
  return Math.abs(ta - tb) / 86_400_000 <= n;
}

/** Only the metadata columns a merge may touch (never id/company_id/dates). */
type RoundPatch = Partial<
  Pick<
    FundingRoundRow,
    | "amount_raised"
    | "valuation"
    | "investors"
    | "lead_investor"
    | "share_price"
    | "source"
  >
>;

export interface RoundHygienePlan {
  /** Surviving primaries whose fields changed after absorbing duplicates. */
  updates: { id: string; patch: RoundPatch }[];
  /** Absorbed duplicate rows to delete. */
  deleteIds: string[];
  /** Valuation rows to insert, restating a round's recorded post-money. */
  inserts: {
    company_id: string;
    date: string;
    round: string | null;
    post_money: number;
    source: string | null;
    confidence: "medium";
  }[];
}

/** Pure: diff the stored rounds against their deduped form + find rounds whose
 * recorded post-money is missing from the valuation timeline. */
export function planRoundHygiene(
  rounds: FundingRoundRow[],
  valuations: ValuationRow[],
): RoundHygienePlan {
  const merged = dedupeFundingRows(rounds);
  const byId = new Map(rounds.map((r) => [r.id, r]));
  const survivorIds = new Set(merged.map((m) => m.id));

  const deleteIds = rounds.map((r) => r.id).filter((id) => !survivorIds.has(id));

  // Only survivors that actually absorbed something need a patch — compare the
  // merged row against its original field-by-field (metadata merge only).
  const updates: RoundHygienePlan["updates"] = [];
  for (const m of merged) {
    const orig = byId.get(m.id);
    if (!orig) continue;
    const patch: RoundPatch = {};
    if (m.amount_raised !== orig.amount_raised) patch.amount_raised = m.amount_raised;
    if (m.valuation !== orig.valuation) patch.valuation = m.valuation;
    if (m.lead_investor !== orig.lead_investor) patch.lead_investor = m.lead_investor;
    if (m.share_price !== orig.share_price) patch.share_price = m.share_price;
    if (m.source !== orig.source) patch.source = m.source;
    if (
      JSON.stringify(m.investors ?? null) !== JSON.stringify(orig.investors ?? null)
    )
      patch.investors = m.investors;
    if (Object.keys(patch).length) updates.push({ id: m.id, patch });
  }

  // Backfill: a surviving round with a recorded post-money + date must have a
  // matching timeline row (same figure within the window) — else restate it.
  const candidates: RoundHygienePlan["inserts"] = [];
  for (const m of merged) {
    if (m.valuation == null || !m.date) continue;
    const covered =
      valuations.some(
        (v) =>
          v.post_money === m.valuation &&
          v.date != null &&
          withinDays(v.date, m.date as string, BACKFILL_WINDOW_DAYS),
      ) ||
      candidates.some((i) => i.post_money === m.valuation && i.date === m.date);
    if (covered) continue;
    candidates.push({
      company_id: m.company_id,
      date: m.date,
      round: m.round ?? null,
      post_money: m.valuation,
      source: m.source,
      confidence: "medium",
    });
  }

  // Restate ONLY what the write-time guard would accept — a candidate the
  // timeline sweep would immediately strip (untrusted duplicate of a verified
  // figure, backdated overshoot) must not be inserted, or the backfill and the
  // sweep ping-pong forever.
  const { accepted: inserts } = filterIngestValuations(
    valuations.map((v) => ({
      date: v.date,
      post_money: v.post_money,
      source: v.source,
    })),
    candidates,
  );

  return { updates, deleteIds, inserts };
}

export interface RoundHygieneSummary {
  companies: number;
  merged: number;
  deleted: number;
  backfilled: number;
}

/** Apply the hygiene sweep to every company (or one, when `companyId` given). */
export async function sweepRoundHygiene(
  supabase: DB,
  companyId?: string,
): Promise<RoundHygieneSummary> {
  const summary: RoundHygieneSummary = {
    companies: 0,
    merged: 0,
    deleted: 0,
    backfilled: 0,
  };
  const q = supabase.from("companies").select("id");
  const { data: companies } = companyId ? await q.eq("id", companyId) : await q;

  for (const c of companies ?? []) {
    summary.companies++;
    const [{ data: rounds }, { data: vals }] = await Promise.all([
      supabase.from("funding_rounds").select("*").eq("company_id", c.id),
      supabase.from("valuations").select("*").eq("company_id", c.id),
    ]);
    const plan = planRoundHygiene(
      (rounds ?? []) as FundingRoundRow[],
      (vals ?? []) as ValuationRow[],
    );

    // Update survivors BEFORE deleting duplicates so a mid-sweep failure never
    // loses the absorbed metadata.
    for (const u of plan.updates) {
      const { error } = await supabase
        .from("funding_rounds")
        .update(u.patch)
        .eq("id", u.id);
      if (!error) summary.merged++;
    }
    if (plan.deleteIds.length) {
      const { error } = await supabase
        .from("funding_rounds")
        .delete()
        .in("id", plan.deleteIds);
      if (!error) summary.deleted += plan.deleteIds.length;
    }
    if (plan.inserts.length) {
      const { error } = await supabase.from("valuations").insert(plan.inserts);
      if (!error) summary.backfilled += plan.inserts.length;
    }
  }
  return summary;
}
