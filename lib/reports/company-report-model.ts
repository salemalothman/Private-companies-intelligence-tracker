/**
 * Pure render model for the per-company research memo ("IC memo") PDF.
 *
 * Maps a stored `company_analysis` row (+ company, competitors) into an
 * ordered, null-honest section list the PDF drawer walks: absent sections are
 * omitted (never fabricated), every narrative keeps its basis/confidence tag,
 * moat/capability scores pass through `clampRating` (out-of-domain → dropped),
 * and ALL scenario dollar figures come from `buildCompsTable` — this module
 * computes no valuation math of its own. No I/O, no React, no LLM calls.
 */

import type {
  CompanyAnalysisRow,
  CompanyWithRelations,
  CompetitorRow,
} from "@/lib/types";
import {
  clampRating,
  type IcRating,
  type LabelledField,
  type OverviewSections,
  type ThreatTier,
} from "@/lib/agents/deep-dive-types";
import { buildCompsTable, type CompsRow } from "@/lib/valuation/comps";
import { companyInvested, currentValue } from "@/lib/metrics";
import { formatCurrency, formatDate } from "@/lib/utils";

/** A narrative plus its honest inline marker (e.g. "[est · med]"), or null. */
export interface TaggedText {
  text: string;
  tag: string | null;
}

/** One horizontal moat score bar: label + 1–10 score + width fraction. */
export interface MoatBar {
  label: string;
  score: number;
  fraction: number;
}

/** The IC rating rendered as a colored badge. */
export interface IcBadge {
  rating: IcRating;
  label: string;
  color: "green" | "muted" | "red";
}

/** A labelled sub-field row (e.g. "Gross margin" → labelled narrative). */
export interface LabelledRow {
  label: string;
  field: TaggedText;
}

/** One formatted comps table row — null cells already rendered as "—". */
export interface CompsCells {
  year: number;
  bear: string;
  base: string;
  bull: string;
}

/** Capability-matrix row with scores clamped to the honest 1–10 domain. */
export interface CapabilityRow {
  name: string;
  ip_depth: number | null;
  gtm_velocity: number | null;
  capital_efficiency: number | null;
  workflow_retention: number | null;
}

export type ReportSection =
  | {
      id: "executive_summary";
      title: string;
      badge: IcBadge | null;
      thesis: TaggedText | null;
      valueProp: TaggedText | null;
      strengths: TaggedText[];
      weaknesses: TaggedText[];
      positioning: TaggedText | null;
      mostLikelyOutcome: TaggedText | null;
    }
  | {
      id: "business_moat";
      title: string;
      technology: TaggedText | null;
      moatRating: number | null;
      businessModel: TaggedText | null;
      unitEconomics: TaggedText | null;
      financials: LabelledRow[];
      market: LabelledRow[];
      moatBars: MoatBar[];
      moatNarrative: TaggedText | null;
    }
  | {
      id: "competitive_landscape";
      title: string;
      narrative: TaggedText | null;
      tiers: { name: string; tier: ThreatTier }[];
      matrix: { target: string; threats: CapabilityRow[] } | null;
    }
  | {
      id: "valuation_comps";
      title: string;
      provenance: {
        baseRevenue: string;
        baseRevenueSource: string | null;
        multiples: { p25: string; median: string; p75: string };
        nPeers: number;
        nTrusted: number | null;
        nSecVerified: number;
      };
      rows: CompsRow[];
      cells: CompsCells[];
      disclaimer: string;
    }
  | { id: "historical_analogue"; title: string; body: TaggedText }
  | { id: "outlook_exit"; title: string; body: TaggedText }
  | {
      id: "ic_conclusion";
      title: string;
      badge: IcBadge | null;
      bull: TaggedText | null;
      bear: TaggedText | null;
      recommendation: TaggedText | null;
    };

export interface SnapshotStat {
  label: string;
  value: string;
}

export interface CompanyReportModel {
  companyName: string;
  slug: string;
  generatedAt: string;
  /** True when underlying data changed after the analysis was generated. */
  stale: boolean;
  snapshot: SnapshotStat[];
  sections: ReportSection[];
}

/** The literal honesty disclaimer required on every comps rendering. */
export const COMPS_DISCLAIMER =
  "Figures are illustrative comps, not a forecast — implied valuations from peer revenue multiples and labelled growth assumptions only.";

/**
 * Render a LabelledField's honesty marker, e.g. "[est · med]" / "[fact · high]".
 * Missing basis or confidence degrades to the remaining part; both missing →
 * null (no fabricated tag). Uses the analysis-layer short-form confidence
 * ("med") — deliberately NOT the valuation-row Confidence ("medium").
 */
export function formatTag(
  field: Partial<LabelledField> | null | undefined,
): string | null {
  if (!field) return null;
  const basis =
    field.basis === "estimate" ? "est" : field.basis === "fact" ? "fact" : null;
  const confidence =
    field.confidence === "low" || field.confidence === "med" || field.confidence === "high"
      ? field.confidence
      : null;
  const parts = [basis, confidence].filter((p): p is string => p != null);
  return parts.length ? `[${parts.join(" · ")}]` : null;
}

/** Lowercase, non-alphanumerics collapsed to "-"; never empty ("company"). */
export function slugifyCompanyName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "company";
}

/** A LabelledField as renderable text + tag, or null when absent/empty. */
function tagged(field: LabelledField | null | undefined): TaggedText | null {
  if (!field?.text) return null;
  return { text: field.text, tag: formatTag(field) };
}

const IC_LABELS: Record<IcRating, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  sell: "Sell",
};

const IC_COLORS: Record<IcRating, IcBadge["color"]> = {
  strong_buy: "green",
  buy: "green",
  hold: "muted",
  sell: "red",
};

function icBadge(rating: IcRating | undefined): IcBadge | null {
  if (!rating || !(rating in IC_LABELS)) return null;
  return { rating, label: IC_LABELS[rating], color: IC_COLORS[rating] };
}

const MOAT_DIMENSIONS: [string, string][] = [
  ["switching_costs", "Switching costs"],
  ["network_flywheel", "Network flywheel"],
  ["distribution_regulatory", "Distribution & regulatory"],
  ["ip", "IP"],
];

/** "12.0x"-style peer multiple, or "—" for null (never a fabricated 0). */
function formatMultipleShort(v: number | null | undefined): string {
  if (v == null || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}x`;
}

/**
 * Build the memo render model. Pure: absent analysis sections are simply
 * omitted from the ordered list (a partial/legacy stored row never throws),
 * and a legacy row without a valuation block yields no comps section.
 */
export function buildCompanyReportModel(
  company: CompanyWithRelations,
  analysis: CompanyAnalysisRow,
  competitors: CompetitorRow[],
  opts: { generatedAt: string; stale: boolean },
): CompanyReportModel {
  const s: OverviewSections = analysis.sections ?? {};
  const sections: ReportSection[] = [];

  // 1. Executive Summary (with IC rating badge from the conclusion).
  const exec = s.executive_summary;
  if (exec && Object.keys(exec).length > 0) {
    sections.push({
      id: "executive_summary",
      title: "Executive Summary",
      badge: icBadge(s.ic_conclusion?.rating),
      thesis: tagged(exec.thesis),
      valueProp: tagged(exec.value_prop),
      strengths: (exec.strengths ?? []).map(tagged).filter((t): t is TaggedText => t != null),
      weaknesses: (exec.weaknesses ?? []).map(tagged).filter((t): t is TaggedText => t != null),
      positioning: tagged(exec.positioning),
      mostLikelyOutcome: tagged(exec.most_likely_outcome),
    });
  }

  // 2. Business & Moat.
  const moat = s.strategic_moat;
  const moatBars: MoatBar[] = [];
  if (moat) {
    for (const [key, label] of MOAT_DIMENSIONS) {
      const score = clampRating(
        (moat as Record<string, number | null | undefined>)[key] as number | null | undefined,
      );
      if (score != null) moatBars.push({ label, score, fraction: score / 10 });
    }
  }
  const financials: LabelledRow[] = [];
  const hf = s.historical_financials;
  const hfRows: [LabelledField | undefined, string][] = [
    [hf?.gross_margin, "Gross margin"],
    [hf?.burn_rate, "Burn rate"],
    [hf?.runway, "Runway"],
    [hf?.acv, "ACV"],
  ];
  for (const [field, label] of hfRows) {
    const t = tagged(field);
    if (t) financials.push({ label, field: t });
  }
  const market: LabelledRow[] = [];
  const mo = s.market_opportunity;
  const moRows: [LabelledField | undefined, string][] = [
    [mo?.tam, "TAM"],
    [mo?.sam, "SAM"],
    [mo?.som, "SOM"],
  ];
  for (const [field, label] of moRows) {
    const t = tagged(field);
    if (t) market.push({ label, field: t });
  }
  const businessMoat: Extract<ReportSection, { id: "business_moat" }> = {
    id: "business_moat",
    title: "Business & Moat",
    technology: tagged(s.technology?.narrative),
    moatRating: clampRating(s.technology?.moat_rating),
    businessModel: tagged(s.business_model),
    unitEconomics: tagged(s.unit_economics),
    financials,
    market,
    moatBars,
    moatNarrative: tagged(moat?.narrative),
  };
  const hasBusinessMoat =
    businessMoat.technology != null ||
    businessMoat.moatRating != null ||
    businessMoat.businessModel != null ||
    businessMoat.unitEconomics != null ||
    financials.length > 0 ||
    market.length > 0 ||
    moatBars.length > 0 ||
    businessMoat.moatNarrative != null;
  if (hasBusinessMoat) sections.push(businessMoat);

  // 3. Competitive Landscape (classifies already-ranked competitors only).
  const comp = s.competitors;
  if (comp && Object.keys(comp).length > 0) {
    const tiers = Object.entries(comp.threat_tiers ?? {}).map(
      ([name, tier]) => ({ name, tier }),
    );
    const cm = comp.capability_matrix;
    sections.push({
      id: "competitive_landscape",
      title: "Competitive Landscape",
      narrative: tagged(comp.narrative),
      tiers,
      matrix: cm
        ? {
            target: cm.target,
            threats: (cm.threats ?? []).map((t) => ({
              name: t.name,
              ip_depth: clampRating(t.ip_depth),
              gtm_velocity: clampRating(t.gtm_velocity),
              capital_efficiency: clampRating(t.capital_efficiency),
              workflow_retention: clampRating(t.workflow_retention),
            })),
          }
        : null,
    });
  }

  // 4. Valuation (comps) — buildCompsTable is the ONLY source of $ figures.
  const v = analysis.valuation;
  if (v && v.base_revenue && v.peer_multiple && v.growth) {
    const rows = buildCompsTable(v);
    sections.push({
      id: "valuation_comps",
      title: "Valuation Targets (Comps)",
      provenance: {
        baseRevenue: formatCurrency(v.base_revenue.value),
        baseRevenueSource: v.base_revenue.source,
        multiples: {
          p25: formatMultipleShort(v.peer_multiple.p25),
          median: formatMultipleShort(v.peer_multiple.median),
          p75: formatMultipleShort(v.peer_multiple.p75),
        },
        nPeers: v.peer_multiple.n_peers,
        nTrusted: v.peer_multiple.n_trusted ?? null,
        nSecVerified: v.peer_multiple.n_sec_verified,
      },
      rows,
      cells: rows.map((r) => ({
        year: r.year,
        bear: formatCurrency(r.bear),
        base: formatCurrency(r.base),
        bull: formatCurrency(r.bull),
      })),
      disclaimer: COMPS_DISCLAIMER,
    });
  }

  // 5–7. Historical analogue → Outlook & Exit → IC Conclusion.
  const analogue = tagged(s.historical_analogue);
  if (analogue) {
    sections.push({ id: "historical_analogue", title: "Historical Analogue", body: analogue });
  }
  const outlook = tagged(s.outlook_and_exit);
  if (outlook) {
    sections.push({ id: "outlook_exit", title: "Outlook & Exit", body: outlook });
  }
  const ic = s.ic_conclusion;
  if (ic && Object.keys(ic).length > 0) {
    sections.push({
      id: "ic_conclusion",
      title: "IC Conclusion",
      badge: icBadge(ic.rating),
      bull: tagged(ic.bull),
      bear: tagged(ic.bear),
      recommendation: tagged(ic.recommendation),
    });
  }

  // Snapshot strip: status/sector plus metrics-derived invested + est. value.
  const snapshot: SnapshotStat[] = [
    { label: "Status", value: company.status === "exited" ? "Exited" : "Active" },
    { label: "Sector", value: company.sector ?? "—" },
    { label: "Invested", value: formatCurrency(companyInvested(company)) },
    { label: "Est. value", value: formatCurrency(currentValue(company)) },
    { label: "Analysis date", value: formatDate(analysis.generated_at) },
  ];

  return {
    companyName: company.name,
    slug: slugifyCompanyName(company.name),
    generatedAt: opts.generatedAt,
    stale: opts.stale,
    snapshot,
    sections,
  };
}
