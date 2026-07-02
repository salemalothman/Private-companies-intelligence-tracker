/**
 * Canonical stored shapes for the deep-dive analysis layer.
 *
 * These are the JSONB contracts persisted in `company_analysis.sections` and
 * `company_analysis.valuation`. They MUST match the approved design spec
 * (docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md §3
 * field shape and §4 valuation shape). Plans 02–04 and Phases 2–4 all implement
 * against these types rather than re-deriving them — treat them as the single
 * source of truth and change the spec + migration together if they evolve.
 */

/**
 * A single forward-looking narrative field (design spec §3). Every generated,
 * non-factual statement carries its basis and a confidence level so the UI can
 * label it honestly.
 *
 * NOTE: `confidence` here uses the analysis-layer literal `"med"` from the spec,
 * which is intentionally DISTINCT from the existing `Confidence = "low" |
 * "medium" | "high"` used on valuation rows in lib/types.ts. Do not reuse or
 * conflate the two.
 */
export interface LabelledField {
  text: string;
  basis: "fact" | "estimate";
  confidence: "low" | "med" | "high";
  source?: string;
}

/**
 * A qualitative 1–10 rating indicator (integer). Used for the Core Technology
 * `moat_rating` and each Strategic Moat dimension. It is a judgement indicator,
 * NOT a fabricated financial figure — the only numbers the analysis layer emits
 * (besides growth RATES) live inside this bounded domain.
 */
export type Rating1to10 = number;

/**
 * Coerce an arbitrary model-supplied number into a valid 1–10 integer rating, or
 * null. We deliberately return null (never a clamped 1 or 10) for out-of-domain
 * or non-finite input so we never fabricate a rating the model did not actually
 * produce within the honest domain: a "0" or "12" is treated as "no rating",
 * not silently rewritten to the nearest legal value. Fractional inputs are
 * floored to the integer within 1..10.
 */
export function clampRating(n: number | null | undefined): Rating1to10 | null {
  if (n == null || !Number.isFinite(n)) return null;
  const i = Math.floor(n);
  if (i < 1 || i > 10) return null;
  return i;
}

/** The four Strategic Moat dimensions, each scored 1–10 (or null if absent). */
export interface StrategicMoatSection {
  switching_costs?: Rating1to10 | null;
  network_flywheel?: Rating1to10 | null;
  distribution_regulatory?: Rating1to10 | null;
  ip?: Rating1to10 | null;
  /** Optional narrative framing the dimension scores. */
  narrative?: LabelledField;
}

/** Core Technology & Differentiator: labelled narrative + a 1–10 moat rating. */
export interface TechnologySection {
  narrative?: LabelledField;
  moat_rating?: Rating1to10 | null;
}

/** Market Opportunity: TAM / SAM / SOM as directional labelled ranges (never asserted exact $). */
export interface MarketOpportunitySection {
  tam?: LabelledField;
  sam?: LabelledField;
  som?: LabelledField;
}

/** Executive Summary: the pinned top-of-tab thesis. */
export interface ExecutiveSummarySection {
  thesis?: LabelledField;
  value_prop?: LabelledField;
  strengths?: LabelledField[];
  weaknesses?: LabelledField[];
  positioning?: LabelledField;
  most_likely_outcome?: LabelledField;
}

/** The IC rating enum — Strong Buy … Sell. */
export type IcRating = "strong_buy" | "buy" | "hold" | "sell";

/** IC Conclusion: a rating enum plus bull/bear/recommendation narrative. */
export interface IcConclusionSection {
  rating?: IcRating;
  bull?: LabelledField;
  bear?: LabelledField;
  recommendation?: LabelledField;
}

/**
 * The tightened, per-section narrative container stored in
 * `company_analysis.sections` (design spec §2 Overview list + §3 field shape).
 * This is the Phase-2 source of truth for the Overview tab: every OVR section
 * key is named with its typed shape. Numeric ratings use `Rating1to10 | null`;
 * ALL narrative content stays under the `LabelledField` honesty model
 * (basis + confidence + optional source). `outlook_and_exit` carries ONLY
 * narrative labelled fields — NO probability or price-target fields, enforced
 * at the type level (LabelledField), in the prompt hard-rules, and again in
 * `normalizeSections`.
 *
 * EVERY field is optional so an older/partial stored row (e.g. the Phase-1
 * 7-section set) still type-checks; the renderer degrades absence via
 * `SectionEmpty`.
 */
export interface OverviewSections {
  executive_summary?: ExecutiveSummarySection;
  technology?: TechnologySection;
  product_portfolio?: LabelledField;
  vertical_customer?: LabelledField;
  business_model?: LabelledField;
  unit_economics?: LabelledField;
  market_opportunity?: MarketOpportunitySection;
  strategic_moat?: StrategicMoatSection;
  historical_analogue?: LabelledField;
  /** Narrative labelled fields ONLY — no probabilities, no price targets. */
  outlook_and_exit?: LabelledField;
  ic_conclusion?: IcConclusionSection;
}

/**
 * The stored alias used by `CompanyAnalysisRow.sections`. It is the intersection
 * of the tightened `OverviewSections` shape with the legacy open index signature,
 * so it accepts BOTH the Phase-2 typed sections AND the Phase-1 partial rows that
 * predate the tightening — no migration or lib/types.ts change is needed. Read
 * code should narrow to `OverviewSections` (or use `normalizeSections`); write
 * code produces `OverviewSections`.
 */
export type AnalysisSections = OverviewSections & {
  [section: string]: AnalysisSectionValue | undefined;
};

/** A section entry: a labelled field, raw string, or a nested group thereof. */
export type AnalysisSectionValue =
  | LabelledField
  | string
  | AnalysisSectionValue[]
  | { [key: string]: AnalysisSectionValue };

/**
 * The comps-model inputs stored in `company_analysis.valuation` (design spec §4).
 *
 * Everything quantitative here except `growth` is computed deterministically in
 * code (peer-multiple percentiles, base revenue); the LLM supplies ONLY the
 * `growth` proposal (base rate + bear/bull presets + rationale + confidence).
 */
export interface AnalysisValuation {
  base_revenue: {
    /** null when no credible revenue exists — never fabricated to 0. */
    value: number | null;
    source: string | null;
  };
  current_valuation: number | null;
  peer_multiple: {
    median: number | null;
    p25: number | null;
    p75: number | null;
    n_peers: number;
    n_sec_verified: number;
  };
  growth: {
    base: number;
    bear: number;
    bull: number;
    confidence: "low" | "med" | "high";
    rationale: string;
  };
}
