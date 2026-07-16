import type { CompanyWithRelations } from "@/lib/types";
import { valuationToRevenue } from "@/lib/competitors/rank";
import { isTrustedSource } from "@/lib/enrichment/timeline-validation";
import {
  isPublisherDomain,
  isSecFiling,
} from "@/lib/enrichment/sanitize-sources";

/**
 * Canonical company record with source lineage.
 *
 * Merges the same fact (valuation, revenue) reported across our sources —
 * the valuations table, the AG Dillon / Exa market cache, and the competitor
 * self-row — into one canonical value, with provenance, a corroboration count
 * (distinct providers that agree), and a conflict flag when they materially
 * disagree. Pure and deterministic. Observational only — no risk scoring.
 */

export interface SourceObservation {
  source: string;
  value: number | null;
  date: string | null;
}

export interface CanonicalField {
  value: number | null;
  asOf: string | null;
  observations: SourceObservation[];
  /** Distinct providers whose value agrees with the canonical (within 15%). */
  corroboration: number;
  /** A provider's value diverges from the canonical by >25%. */
  conflict: boolean;
}

export interface CanonicalRecord {
  valuation: CanonicalField;
  revenue: CanonicalField;
  /** Valuation-to-Revenue multiple (latest valuation ÷ revenue), null if uncomputable. */
  multiple: number | null;
  sources: string[]; // distinct providers across the whole record
}

const AGREE = 0.15; // within 15% → corroborates
const DIVERGE = 0.25; // beyond 25% → conflict
const WINDOW_MS = 120 * 86_400_000; // only contemporaneous reports corroborate/conflict

/** Reduce a source label to its provider ("grok:x:social" -> "grok"). */
export function provider(source: string | null | undefined): string {
  const s = (source ?? "").trim().toLowerCase();
  if (!s) return "manual";
  if (s.startsWith("pdf:")) return "document";
  if (s.startsWith("url:")) return "web";
  if (s.includes("agdillon") || s.includes("ag dillon")) return "agdillon";
  // Normalize akta.pro (and any akta:* label) to a stable "akta" key BEFORE the
  // isPublisherDomain fallthrough would otherwise keep "akta.pro" as a bare domain.
  if (s.includes("akta")) return "akta";
  if (isSecFiling(s)) return "sec-edgar";
  if (s.includes("private-market") || s.includes("aggregate")) return "aggregate";
  if (s.includes("unverified")) return "unverified";
  if (isPublisherDomain(s)) return s; // a real publisher domain — keep it intact
  return s.split(/[:\s(]/)[0] || "manual";
}

/**
 * Trust tier for canonical pool selection:
 *  1 — primary-verified: real publisher domains, SEC filings, documents, and
 *      the AG Dillon curated cache.
 *  2 — reconciled market cache: "private-market aggregate" rows and their
 *      competitor-row copies. Not primary-verified, but a reconciled consensus.
 *  3 — bare tool labels ("exa", "grok:*") and manual entries — a single
 *      connector's parse of one article.
 * A lower tier can never out-headline a higher one just by being newer: a
 * low-confidence Exa event parse must not overwrite the market consensus on
 * sync (the bug this fixes), exactly as an unverified figure must never beat a
 * verified one. Lower-tier observations remain visible in the lineage and
 * still drive the corroboration/conflict badges.
 */
function tier(source: string): 1 | 2 | 3 {
  if (isTrustedSource(source) || provider(source) === "agdillon") return 1;
  const p = provider(source);
  if (p === "aggregate" || p === "unverified") return 2;
  return 3;
}

function field(observations: SourceObservation[]): CanonicalField {
  const valued = observations.filter((o) => o.value != null);
  if (valued.length === 0) {
    return { value: null, asOf: null, observations, corroboration: 0, conflict: false };
  }
  // Canonical = most recent dated observation from the BEST non-empty trust
  // tier, so an unverified/tool figure can never become the headline when a
  // verified or market-consensus one exists.
  const bestTier = Math.min(...valued.map((o) => tier(o.source)));
  const pool = valued.filter((o) => tier(o.source) === bestTier);
  // Most-recent-dated wins; on a date tie the akta observation is preferred
  // (akta is the same-domain private-company source we trust to break duplicates).
  const canon = [...pool].sort(
    (a, b) =>
      (b.date ?? "").localeCompare(a.date ?? "") ||
      (provider(b.source) === "akta" ? 1 : 0) -
        (provider(a.source) === "akta" ? 1 : 0),
  )[0];
  const v = canon.value as number;
  const canonTime = canon.date ? Date.parse(canon.date) : null;
  // Only contemporaneous reports count — a historical round at a different
  // valuation is a timeline point, not a disagreement about the current mark.
  const near = (o: SourceObservation) =>
    !o.date || canonTime == null || Math.abs(Date.parse(o.date) - canonTime) <= WINDOW_MS;
  const co = valued.filter(near);
  const rel = (o: SourceObservation) => Math.abs((o.value as number) - v) / v;
  const corroboration = new Set(
    co.filter((o) => rel(o) <= AGREE).map((o) => provider(o.source)),
  ).size;
  const conflict = co.some((o) => rel(o) > DIVERGE);
  return { value: v, asOf: canon.date, observations: co, corroboration, conflict };
}

export interface CanonicalInputs {
  market?: {
    source: string | null;
    valuation: number | null;
    valuation_date: string | null;
    revenue: number | null;
    as_of: string | null;
  } | null;
  self?: {
    source: string | null;
    valuation: number | null;
    revenue: number | null;
    valuation_date: string | null;
  } | null;
}

export function buildCanonicalRecord(
  company: CompanyWithRelations,
  inputs: CanonicalInputs = {},
): CanonicalRecord {
  const valuationObs: SourceObservation[] = company.valuations
    .filter((v) => v.post_money != null)
    .map((v) => ({ source: v.source ?? "manual", value: v.post_money, date: v.date }));
  const revenueObs: SourceObservation[] = [];

  // The company's own durable revenue (from document/Exa financial-profile sync).
  if (company.revenue != null) {
    revenueObs.push({
      source: company.revenue_source ?? "manual",
      value: company.revenue,
      date: company.revenue_date,
    });
  }

  if (inputs.market) {
    const m = inputs.market;
    if (m.valuation != null)
      valuationObs.push({
        source: m.source ?? "agdillon",
        value: m.valuation,
        date: m.valuation_date ?? m.as_of,
      });
    if (m.revenue != null)
      revenueObs.push({ source: m.source ?? "agdillon", value: m.revenue, date: m.as_of });
  }
  if (inputs.self) {
    const s = inputs.self;
    if (s.valuation != null)
      valuationObs.push({ source: s.source ?? "grok", value: s.valuation, date: s.valuation_date });
    if (s.revenue != null)
      revenueObs.push({ source: s.source ?? "grok", value: s.revenue, date: s.valuation_date });
  }

  const valuation = field(valuationObs);
  const revenue = field(revenueObs);
  const sources = [
    ...new Set([...valuationObs, ...revenueObs].map((o) => provider(o.source))),
  ].sort();

  return {
    valuation,
    revenue,
    multiple: valuationToRevenue(valuation.value, revenue.value),
    sources,
  };
}
