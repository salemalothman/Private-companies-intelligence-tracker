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
 * The narrative container stored in `company_analysis.sections`.
 *
 * Phase 1 does NOT render sections — it only needs to store one Grok result —
 * so this is deliberately an open, forward-compatible record keyed by section.
 * A section value may be a `LabelledField`, a plain string, or a nested group
 * of the same. Phase 2 tightens this into per-section shapes as it wires the
 * Overview rendering; until then this permissive shape is sufficient to persist
 * and round-trip a single analysis run.
 */
export interface AnalysisSections {
  [section: string]: AnalysisSectionValue;
}

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
