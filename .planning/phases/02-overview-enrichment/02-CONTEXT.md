# Phase 2: Overview Enrichment - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Source:** Approved design spec §Overview + Phase 1 contracts

<domain>
## Phase Boundary

Render the full investment thesis into the **Overview tab** of the company detail
page (`app/(app)/companies/[id]/page.tsx`) as honestly-labelled, collapsible
sections drawn from the stored `company_analysis.sections`. Reuses the Phase 1
primitives: `ConfidenceChip`, `DeepDiveEmpty`, `getCompanyAnalysis`, and the shared
`CollapsibleSection`/`SectionEmpty`.

**Critical reconciliation (do not skip):** `AnalysisSections` in
`lib/agents/deep-dive-types.ts` is intentionally OPEN and its doc comment states
"Phase 2 tightens this into per-section shapes as it wires the Overview rendering."
The Phase 1 agent currently emits only a partial set (executive_summary, technology,
moat, business_model, market_opportunity, outlook_and_exit, ic_conclusion). The OVR
requirements need MORE granular sections. Therefore Phase 2 must do BOTH:
  1. **Tighten the schema + extend the agent** — define per-section typed shapes in
     `deep-dive-types.ts` and extend `runDeepDive`'s Grok prompt + zod output schema
     (`lib/agents/deep-dive.ts`) so it produces the full OVR section set below.
  2. **Render** those sections in Overview.
Not just render the current 7 — that would leave OVR-02/03 partially unmet.

**Out of scope:** Competitors enrichment (Phase 3), ingestion (Phase 4), Valuation
Targets tab (Phase 5). Behavior-preserving for all other tabs.
</domain>

<decisions>
## Implementation Decisions

### Section set to produce + render (maps to OVR-01..04)
Pinned order in the Overview tab:
- **Executive Summary** (OVR-01) — thesis, value prop, strengths, weaknesses,
  positioning, most-likely-outcome. **Pinned at top** (not collapsible, or open).
- **Core Technology & Differentiator** + **moat rating (1–10)** (OVR-02)
- **Product Portfolio** (OVR-02)
- **Vertical & Customer Segments** (OVR-02)
- **Business Model** (OVR-02) — enriches/coexists with the existing
  `BusinessModelAnalysis` segment bar.
- **Unit Economics** (OVR-03)
- **Market Opportunity — TAM/SAM/SOM** (OVR-03) — directional ranges + confidence.
- **Strategic Moat** (OVR-03) — per-dimension 1–10 (switching costs, network/
  flywheel, distribution/regulatory, IP).
- **Historical Analogue** (OVR-03)
- **Outlook & Exit** (OVR-04) — likely strategic moves, IPO readiness, likely
  suitors, scenario narrative. **NO fabricated probabilities or price targets.**
- **IC Conclusion** (OVR-04) — rating (Strong Buy…Sell) + bull/bear + one-paragraph
  recommendation. **Pinned at bottom.**

### Rendering (OVR-05)
- Middle sections render via the existing `CollapsibleSection`/`SectionEmpty`
  (`components/dashboard/collapsible-section.tsx`) — remember the RSC lesson: it's a
  client component; pass lucide icons only from client scope or omit icons.
- Every forward-looking field renders its `ConfidenceChip` (Fact/Estimate +
  Low/Med/High) from the `LabelledField` shape.
- Ratings (moat 1–10, strategic-moat per-dimension) render as a small numeric/bar
  indicator consistent with the design system (flat, hairline, tabular-nums).
- Before first generation, the Overview shows the `DeepDiveEmpty` CTA (already wired
  in Phase 1) instead of empty sections; the "may be stale" hint stays.

### Schema/agent changes
- Extend `AnalysisSections` into typed per-section shapes (keep `LabelledField` for
  narrative; add typed shapes for moat_rating:number, strategic_moat dimensions,
  tam/sam/som, ic rating). Update the spec §3 alongside (types are source of truth).
- Extend `runDeepDive` prompt + zod schema to emit all the above. Guardrail intact:
  still no fabricated financials; probabilities stay OUT of Outlook & Exit; comps
  remain code-computed (valuation shape unchanged).
- Re-running the deep-dive on an existing company must produce the fuller sections
  (verify by regenerating for a demo company).

### Claude's Discretion
- Exact per-section TypeScript shapes + zod schema structure.
- Visual treatment of ratings (bar vs dots vs number) within the design system.
- Whether Executive Summary / IC Conclusion are non-collapsible pinned cards vs
  open-by-default collapsibles.
- Sub-grouping of related sections under fewer collapsibles if cleaner.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md` — §Overview section list + §3 field shape.
- `.planning/PROJECT.md` — guardrails. `.planning/REQUIREMENTS.md` — OVR-01..05.
- `lib/agents/deep-dive-types.ts` — `AnalysisSections`/`LabelledField` to tighten.
- `lib/agents/deep-dive.ts` — `runDeepDive` prompt + zod schema to extend (§sections).
- `app/(app)/companies/[id]/page.tsx` — Overview tab to enrich (behavior-preserving elsewhere).
- `components/company/confidence-chip.tsx` — `ConfidenceChip`, `DeepDiveEmpty`.
- `components/dashboard/collapsible-section.tsx` — `CollapsibleSection`/`SectionEmpty` (client-boundary rule).
- `components/company/business-model-analysis.tsx` — existing segment bar to coexist with.
- `lib/queries.ts` — `getCompanyAnalysis` reader.
- `.planning/codebase/CONVENTIONS.md` — design system (premium minimal flat, hairline, tabular-nums).
</canonical_refs>

<specifics>
## Specific Ideas
- Keep Executive Summary + IC Conclusion visually prominent (pinned); the analytical
  middle sections collapse to keep the tab scannable.
- Reuse the `$240M`-style tabular-nums + hairline aesthetic already on the page.
- After extending the agent, regenerate one demo company to confirm the fuller
  section set renders end-to-end (the earlier Replit run only has the partial 7).
</specifics>

<deferred>
## Deferred Ideas
- Competitors threat tiers + capability matrix (Phase 3).
- Ingested real facts feeding the sections (Phase 4 → richer regeneration later).
- Valuation Targets tab (Phase 5).
</deferred>

---

*Phase: 02-overview-enrichment*
*Context gathered: 2026-07-02*
