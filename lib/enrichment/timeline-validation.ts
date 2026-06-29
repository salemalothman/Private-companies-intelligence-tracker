import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { isGenericSource } from "@/lib/enrichment/sanitize-sources";

/**
 * Funding / valuation timeline validation.
 *
 * Enforces a strict chronological progression and strips hallucinated or
 * leaked entries — e.g. a $9B valuation backdated to 2023 from an "exa"
 * aggregator label, which would imply a later verified round ($3B Series C,
 * Sep 2025) was a massive down round. Rules:
 *   - monotonic growth: an entry may not exceed a LATER verified round,
 *   - sequential-round logic flows from that ordering,
 *   - primary-source trust: only real publisher domains / SEC filings count as
 *     verification; generic tool labels (exa/grok/perplexity), aggregates,
 *     "manual", and "unverified" do not.
 * Pure validator + a DB worker. The validator is side-effect free for testing.
 */

type DB = SupabaseClient<Database>;

const DOWN_TOLERANCE = 0.05; // a later value below (1 - 5%) of an earlier one = down round
const DUP_TOLERANCE = 0.02; // same-date values within 2% = duplicate

export interface TimelineEntry {
  id?: string;
  date: string | null;
  post_money: number | null;
  round?: string | null;
  source: string | null;
}

export interface TimelineAnomaly {
  entry: TimelineEntry;
  reasons: string[];
  action: "strip" | "flag";
}

export interface TimelineResult {
  keep: TimelineEntry[];
  anomalies: TimelineAnomaly[];
}

/**
 * A source counts as primary-verified only if it's a real publisher domain or
 * an SEC filing — not a generic tool label, aggregate, manual, or "unverified".
 */
export function isTrustedSource(source: string | null | undefined): boolean {
  const s = (source ?? "").trim().toLowerCase();
  if (!s || isGenericSource(s)) return false;
  if (s.startsWith("manual") || s.includes("aggregate") || s.includes("unverified"))
    return false;
  if (s.includes("sec edgar") || s.includes("sec.gov") || s.includes("form d"))
    return true;
  return /[a-z0-9-]+\.[a-z]{2,}/.test(s); // a real domain (techcrunch.com, replit.com, df.com…)
}

/**
 * Classify a company's valuation entries into ones to keep and anomalies.
 * Strips untrusted entries that break monotonic growth or duplicate a verified
 * entry; flags (keeps) lone untrusted entries and genuine verified down-rounds
 * for review; undated/valueless entries are flagged.
 */
export function validateTimeline(entries: TimelineEntry[]): TimelineResult {
  const keep: TimelineEntry[] = [];
  const anomalies: TimelineAnomaly[] = [];
  const dated = entries.filter((e) => e.date && e.post_money != null);

  for (const e of entries) {
    if (!(e.date && e.post_money != null)) {
      anomalies.push({
        entry: e,
        reasons: ["missing date or valuation — cannot place on timeline"],
        action: "flag",
      });
      continue;
    }
    const trusted = isTrustedSource(e.source);
    const value = e.post_money as number;
    const date = e.date as string;

    const exceedsLaterVerified = dated.some(
      (o) =>
        o !== e &&
        (o.date as string) > date &&
        isTrustedSource(o.source) &&
        (o.post_money as number) < value * (1 - DOWN_TOLERANCE),
    );
    const redundantDup =
      !trusted &&
      dated.some(
        (o) =>
          o !== e &&
          isTrustedSource(o.source) &&
          o.date === date &&
          Math.abs((o.post_money as number) - value) <= value * DUP_TOLERANCE,
      );

    const reasons: string[] = [];
    if (exceedsLaterVerified)
      reasons.push("valuation exceeds a later verified round (breaks monotonic growth / sequential-round logic)");
    if (!trusted) reasons.push("source is not a trusted primary publisher");
    if (redundantDup) reasons.push("redundant unverified duplicate of a verified entry");

    if (!trusted && (exceedsLaterVerified || redundantDup)) {
      anomalies.push({ entry: e, reasons, action: "strip" });
    } else if (!trusted) {
      anomalies.push({ entry: e, reasons, action: "flag" });
      keep.push(e); // lone unverified — keep but flagged
    } else {
      if (exceedsLaterVerified) {
        anomalies.push({
          entry: e,
          reasons: ["verified entry exceeds a later verified round — review for a genuine down round"],
          action: "flag",
        });
      }
      keep.push(e);
    }
  }

  return { keep, anomalies };
}

export interface TimelineValidationSummary {
  scanned: number;
  stripped: number;
  flagged: number;
}

/** Validate every company's valuation timeline and delete the strip-anomalies. */
export async function validateAllTimelines(
  supabase: DB,
): Promise<TimelineValidationSummary> {
  let scanned = 0, stripped = 0, flagged = 0;
  const { data: companies } = await supabase.from("companies").select("id");
  for (const c of companies ?? []) {
    const { data: vals } = await supabase
      .from("valuations")
      .select("id, date, post_money, round, source")
      .eq("company_id", c.id);
    scanned += (vals ?? []).length;
    const { anomalies } = validateTimeline((vals ?? []) as TimelineEntry[]);
    for (const a of anomalies) {
      if (a.action === "strip" && a.entry.id) {
        await supabase.from("valuations").delete().eq("id", a.entry.id);
        stripped++;
      } else {
        flagged++;
      }
    }
  }
  return { scanned, stripped, flagged };
}
