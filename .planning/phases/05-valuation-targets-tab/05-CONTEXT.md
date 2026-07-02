# Phase 5: Valuation Targets Tab - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Source:** Approved design spec §4 (comps model) + Phase 1 stored valuation contract

<domain>
## Phase Boundary

The final phase. Two deliverables on the company detail page:
1. **A new "Valuation Targets" tab** (VAL-02..05) — a transparent comps model for
   2026–2030 with Bear/Base/Bull scenarios and live user-adjustable assumptions.
2. **Factual financial detail on the existing Valuation tab** (VAL-01) —
   margins/burn/runway/ACV where retrievable, each fact/estimate + confidence.

**The comps inputs already exist** — Phase 1's `runDeepDive` stores
`company_analysis.valuation` (`AnalysisValuation`): `base_revenue {value, source}`,
`current_valuation`, `peer_multiple {median, p25, p75, n_peers, n_sec_verified}`,
`growth {base, bear, bull, confidence, rationale}`. Replit's live row has real
values (e.g. $240M revenue, median 14.5×, growth 0.25/0.45/0.70). This phase
COMPUTES and RENDERS from that stored contract — the valuation shape itself is
UNCHANGED.

**Out of scope:** any change to the comps-input generation (Phase 1 contract),
the ingestion pipeline (Phase 4 done), fabricated forecasts/probability tables.
</domain>

<decisions>
## Implementation Decisions

### The comps math (VAL-02, VAL-03) — pure, code-computed, unit-tested
- New pure module (e.g. `lib/valuation/comps.ts`):
  `projected_revenue(year_n) = base_revenue × (1 + growth)^n` (n = years from the
  base year 2026 → 2030) and
  `implied_valuation(year) = projected_revenue(year) × applied_multiple`.
- Three preset scenarios: **Bear** = growth.bear × peer_multiple.p25;
  **Base** = growth.base × median; **Bull** = growth.bull × p75.
- Pure function of `(AnalysisValuation, overrides)` → a table of
  {year, bear, base, bull} rows. Nulls propagate honestly: if `base_revenue.value`
  or the applied multiple is null → the cell is null (rendered as —, never 0).
- Unit tests for the math incl. null propagation and clamping of overrides.

### The tab (VAL-02, VAL-04, VAL-05)
- New tab trigger "Valuation Targets" inserted in the Tabs list of
  `app/(app)/companies/[id]/page.tsx` **between Valuation and Funding Rounds**
  (per the approved spec tab order).
- The tab body is a **client component** (`"use client"`) — it owns the
  interactive state: a growth % input (default = agent-proposed base, shown with
  its confidence chip + rationale) and a multiple-percentile selector
  (p25 / median / p75), recomputing the table + chart live client-side (VAL-04).
  Bear/Base/Bull presets remain visible alongside the user-adjusted scenario.
- **Table**: rows 2026–2030 × columns Bear/Base/Bull; each cell exposes its
  inputs on hover (`title` or tooltip: revenue × multiple = value) (VAL-05).
- **Chart**: the three scenario paths 2026–2030 via **recharts** (already used by
  `valuation-timeline.tsx` / `portfolio-charts.tsx`) — match that styling.
- **Inputs panel**: shows base revenue (+ its `source`), current valuation, the
  peer multiple percentiles with `n_peers` and `n_sec_verified` (SEC badge like
  the Competitors tab), and the agent growth proposal (rate + ConfidenceChip +
  rationale) — full provenance of every input (VAL-05).
- **Disclaimer** (explicit, always visible): "Implied by peer comparables under
  the shown assumptions — not a forecast." (VAL-05). No $ figure anywhere in the
  tab that is not derived from the comps calculation.
- **Empty/insufficient states**: no analysis → `DeepDiveEmpty` CTA; analysis
  present but `base_revenue.value` null or no usable multiple → an honest
  "insufficient comps inputs" panel naming what's missing (never fabricate).

### Valuation-tab factual financials (VAL-01)
- Follow the Phase 2/3 pattern: add a small `historical_financials` section to
  the agent output (extend `OverviewSections` + prompt + zod + normalizeSections):
  `{ gross_margin?, burn_rate?, runway?, acv?: LabelledField }` — qualitative/
  directional text fields, each with basis fact/estimate + confidence + source.
  NO fabricated numeric P&L — these are LabelledFields, not numbers.
- Render them as a compact labelled block on the existing **Valuation tab**
  (above or beside the valuation table), chips on every field, `SectionEmpty`/
  DeepDiveEmpty-consistent empty state. Existing timeline/table preserved.

### Guardrails (unchanged, enforced)
- Only transparent comps math produces $ figures; LLM still supplies only the
  growth proposal. No probability tables, no non-comps price targets.
- `AnalysisValuation` shape UNCHANGED. Comps helpers (`computePeerMultiple`,
  `deriveBaseRevenue`) untouched.
- Behavior-preserving for all other tabs; tsc/eslint/vitest green; XSS-safe.
- RSC rule: the interactive tab is a client component; don't pass lucide
  components across the boundary; server page passes only serializable
  `AnalysisValuation` + sections data.

### Claude's Discretion
- Exact file/component names; tooltip vs title for cell inputs; chart styling
  details; whether the user-adjusted scenario renders as a 4th line or replaces
  the presets; input clamping ranges (e.g. growth −50%..+300%).
- The exact `historical_financials` field set (within LabelledField-only rule).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md` — §4
  (Valuation Targets tab: math, scenarios, presentation, valuation JSONB shape).
- `.planning/PROJECT.md` — guardrails. `.planning/REQUIREMENTS.md` — VAL-01..05.
- `lib/agents/deep-dive-types.ts` — `AnalysisValuation` (READ-ONLY contract) +
  `OverviewSections`/`LabelledField` (extend for historical_financials).
- `lib/agents/deep-dive.ts` — prompt/zod/normalizeSections to extend for VAL-01
  ONLY (preserve the da325a4 hardening: retry + no-clobber guard).
- `app/(app)/companies/[id]/page.tsx` — Tabs list + Valuation tab (files modified).
- `lib/queries.ts` — `getCompanyAnalysis` (already fetched by the page).
- `components/company/valuation-timeline.tsx`, `components/dashboard/portfolio-charts.tsx`
  — existing recharts usage/styling to match.
- `components/company/confidence-chip.tsx` (ConfidenceChip, DeepDiveEmpty),
  `components/company/rating-indicator.tsx`, `components/dashboard/collapsible-section.tsx`.
- `.planning/codebase/CONVENTIONS.md` — design system (flat, hairline, tabular-nums).
</canonical_refs>

<specifics>
## Specific Ideas
- Replit's stored row is the live test fixture: base_revenue $240M (techcrunch),
  current_valuation $9B, peer_multiple {13.5/14.5/15.5, n=14, sec=2},
  growth {0.25/0.45/0.70, med} — the tab should render real numbers immediately.
- Number formatting via the existing `formatCurrency`/`formatMultiple`/
  `formatPercent` utils; tabular-nums everywhere.
- The regen script prints section keys — extend it to print whether
  historical_financials was produced (mirrors Phase 3's extension).
</specifics>

<deferred>
## Deferred Ideas
- Persisting user override preferences (session-only is fine for v1).
- Real ingested financials feeding VAL-01 (blocked on X tier / public data —
  Phase 4 caveats; the LabelledField estimates carry the honesty labels).
- AUTO-01/02 (auto-regen, history) — v2.
</deferred>

---

*Phase: 05-valuation-targets-tab*
*Context gathered: 2026-07-02*
