import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { isGenericSource, isSecFiling } from "@/lib/enrichment/sanitize-sources";

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
const DUP_TOLERANCE = 0.02; // values within 2% of a verified figure = duplicate
// $3T — the bound's job is catching unit-parse errors (a $65T "valuation" from
// a bad regex), NOT capping reality: the market cache itself records private
// marks past the old $500B assumption (SpaceX $1.77T, Anthropic $1T, OpenAI
// $852B), which this was silently stripping as "parse errors".
const MAX_PLAUSIBLE = 3e12;
// a legitimate round is never 20x the last known valuation — an untrusted
// figure above this is an outlier/parse-leak, not growth (Accrete: an $852B
// "exa" row sat 1300x above the real ~$650M mark and won canonicalization).
const SPIKE_MULTIPLE = 20;

/**
 * Reasons an entry is invalid against a set of trusted reference entries.
 * Implausible outliers are rejected from any source; untrusted entries are also
 * rejected when they break monotonic growth (in either direction), duplicate a
 * verified figure, or spike absurdly above the highest known valuation.
 * `otherRefs` are ALL other dated entries (any source) — the spike guard falls
 * back to these when no trusted refs exist so an untrusted outlier is still
 * caught against its untrusted peers.
 */
function rejectionReasons(
  entry: { date: string; post_money: number; source: string | null },
  trustedRefs: { date: string; post_money: number }[],
  otherRefs: { post_money: number }[],
): string[] {
  const reasons: string[] = [];
  const v = entry.post_money;
  if (v > MAX_PLAUSIBLE) reasons.push("implausible valuation — likely a parse error");
  if (!isTrustedSource(entry.source)) {
    if (trustedRefs.some((o) => o.date > entry.date && o.post_money < v * (1 - DOWN_TOLERANCE)))
      reasons.push("backdated valuation exceeds a later verified round");
    if (trustedRefs.some((o) => o.date < entry.date && o.post_money > v * (1 + DOWN_TOLERANCE)))
      reasons.push("valuation falls below an earlier verified round (untrusted down-round)");
    if (trustedRefs.some((o) => Math.abs(o.post_money - v) <= v * DUP_TOLERANCE))
      reasons.push("unverified duplicate of a verified figure");
    // Upward-outlier guard: trusted-preferred comparison pool. When there is
    // nothing to compare against (maxOther === 0), push nothing — never
    // fabricate a rejection with no reference point.
    const pool = trustedRefs.length ? trustedRefs : otherRefs;
    const maxOther = pool.reduce((m, o) => Math.max(m, o.post_money), 0);
    if (maxOther > 0 && v > SPIKE_MULTIPLE * maxOther)
      reasons.push("implausible spike — exceeds 20x the highest known valuation");
  }
  return reasons;
}

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
  if (isSecFiling(s)) return true;
  // Document sources (pdf:deck.pdf, url:https://…) are primary-verified by
  // prefix — the domain-regex below is defeated by filenames like
  // "Deal_Overview_-_Accrete_.pdf" (the "_.pdf" underscore breaks the token),
  // which under-trusted a real deck and let an untrusted exa row outrank it.
  if (s.startsWith("pdf:") || s.startsWith("url:")) return true;
  // Lenient: any embedded domain-like token, so bare publisher domains count
  // as primary-verified.
  return /[a-z0-9-]+\.[a-z]{2,}/.test(s);
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
  const trustedRefs = entries
    .filter((e) => e.date && e.post_money != null && isTrustedSource(e.source))
    .map((e) => ({ date: e.date as string, post_money: e.post_money as number }));
  // Every dated entry (any source) — the spike guard's fallback comparison pool.
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
    const entry = { date: e.date, post_money: e.post_money, source: e.source };
    // Compare against trusted refs other than this entry itself.
    const refs = trustedRefs.filter(
      (o) => !(o.date === entry.date && o.post_money === entry.post_money && isTrustedSource(e.source)),
    );
    // Every OTHER dated entry (exclude self by identity so a value never
    // compares against itself).
    const otherRefs = dated
      .filter((o) => o !== e)
      .map((o) => ({ post_money: o.post_money as number }));
    const reasons = rejectionReasons(entry, refs, otherRefs);

    if (reasons.length) {
      anomalies.push({ entry: e, reasons, action: "strip" });
    } else if (!isTrustedSource(e.source)) {
      anomalies.push({ entry: e, reasons: ["unverified, but chronologically consistent"], action: "flag" });
      keep.push(e); // lone unverified — keep but flagged
    } else {
      keep.push(e);
    }
  }

  return { keep, anomalies };
}

export interface IngestFilterResult<T> {
  accepted: T[];
  rejected: { entry: T; reasons: string[] }[];
}

/**
 * Write-time guard: reject incoming valuations before they're persisted.
 * An UNTRUSTED candidate is rejected when it would break the established
 * verified timeline — a backdated value exceeding a later verified round, or a
 * duplicate of a verified entry. Trusted (real-publisher / SEC) candidates and
 * chronologically-consistent ones are accepted; the post-hoc sweep
 * (validateAllTimelines) still catches anything that lands before its
 * verified successors exist.
 */
export function filterIngestValuations<
  T extends { date: string | null; post_money: number; source: string | null },
>(existing: TimelineEntry[], candidates: T[]): IngestFilterResult<T> {
  const trustedRefs = existing
    .filter((e) => e.date && e.post_money != null && isTrustedSource(e.source))
    .map((e) => ({ date: e.date as string, post_money: e.post_money as number }));
  // All established dated entries — candidates spike against the set as a whole
  // (trusted-preferred via the pool logic in rejectionReasons).
  const otherRefs = existing
    .filter((e) => e.date && e.post_money != null)
    .map((e) => ({ post_money: e.post_money as number }));
  const accepted: T[] = [];
  const rejected: { entry: T; reasons: string[] }[] = [];

  for (const c of candidates) {
    if (c.date == null || c.post_money == null) {
      accepted.push(c); // unvalidatable here — dedup / sweep handle it
      continue;
    }
    const reasons = rejectionReasons(
      { date: c.date, post_money: c.post_money, source: c.source },
      trustedRefs,
      otherRefs,
    );
    if (reasons.length) rejected.push({ entry: c, reasons });
    else accepted.push(c);
  }
  return { accepted, rejected };
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
    // Batch the strip-deletes into one round-trip per company instead of N.
    const stripIds = anomalies
      .filter((a) => a.action === "strip" && a.entry.id)
      .map((a) => a.entry.id as string);
    flagged += anomalies.length - stripIds.length;
    if (stripIds.length) {
      await supabase.from("valuations").delete().in("id", stripIds);
      stripped += stripIds.length;
    }
  }
  return { scanned, stripped, flagged };
}
