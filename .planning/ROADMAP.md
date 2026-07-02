# Roadmap: Deep-Dive Analysis

## Overview

This feature adds a grounded, per-company "analyst layer" to the existing Next.js
15 / Supabase portfolio tracker. Phase 1 lays the shared substrate — a
`company_analysis` JSONB table, the `runDeepDive` Grok agent, an on-demand "Run
deep-dive" header button, and a reusable Fact/Estimate + confidence chip — that
Phases 2–4 all read from. Phases 2 and 3 distribute the narrative thesis into the
existing Overview and Competitors tabs. Phase 4 delivers the new comps-based
Valuation Targets (2026–2030) tab plus factual financial detail on the Valuation
tab. Every generated insight is honestly labelled (fact vs. confidence-tagged
estimate vs. transparent comps math) — no fabricated financials, no invented
probabilities.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation** - Analysis storage, the Grok deep-dive agent, on-demand trigger, and shared confidence chip
- [ ] **Phase 2: Overview Enrichment** - Distribute the thesis sections into the Overview tab as collapsible content
- [ ] **Phase 3: Competitors Enrichment** - Threat tiers and a Capability Matrix layered on the existing ranking table
- [ ] **Phase 4: Valuation Targets Tab** - Comps model (2026–2030) with interactive controls, plus factual financial detail on Valuation

## Phase Details

### Phase 1: Foundation
**Goal**: A user can run one on-demand deep-dive per company that generates and stores a grounded, honestly-labelled analysis object, with the shared confidence-labelling primitive in place for every downstream tab to consume.
**Mode:** mvp
**Depends on**: Nothing (first phase)
**Requirements**: FND-01, FND-02, FND-03, FND-04, FND-05, FND-06
**Success Criteria** (what must be TRUE):
  1. Clicking "Run deep-dive" in the company header triggers generation (separate from Sync) with staged progress, and a re-run overwrites the stored row with an updated timestamp.
  2. After a run, exactly one `company_analysis` row exists for that company (JSONB `sections` + `valuation`, `generated_at`, `model`), readable only by the company's owner via RLS.
  3. The stored analysis is grounded in existing in-app context (canonical record, competitor ranking + multiples, funding/valuation history, news, docs) — no fabricated financials and no invented probabilities appear.
  4. Comps inputs (peer-multiple percentiles, base revenue) are computed in code; the LLM supplies only a growth proposal with rationale + confidence.
  5. A shared Fact/Estimate + Low/Med/High confidence chip renders on labelled fields, and before the first run enriched areas show a compact "Run deep-dive" empty state (with a "may be stale" hint when underlying data changed after `generated_at`).
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — company_analysis table + RLS + types + [BLOCKING] schema push + getCompanyAnalysis reader (FND-01)
- [x] 01-02-PLAN.md — runDeepDive Grok agent: grounding gather, one structured call, code-computed comps, upsert (FND-02, FND-03)
- [x] 01-03-PLAN.md — shared Fact/Estimate + confidence chip, empty-state primitive, staleness helper (FND-05, FND-06)
- [ ] 01-04-PLAN.md — Run deep-dive header button + server action + empty/stale wiring (FND-04, FND-06)
**UI hint**: yes

### Phase 2: Overview Enrichment
**Goal**: A user viewing the Overview tab sees the full investment thesis — from Executive Summary to IC Conclusion — rendered as honestly-labelled collapsible sections drawn from the stored analysis.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: OVR-01, OVR-02, OVR-03, OVR-04, OVR-05
**Success Criteria** (what must be TRUE):
  1. The Executive Summary (thesis, value prop, strengths/weaknesses, positioning, most-likely-outcome) is pinned at the top and the IC Conclusion (rating + bull/bear + recommendation) is pinned at the bottom.
  2. Core Technology & Differentiator shows a moat rating (1–10) alongside Product Portfolio, Vertical & Customer Segments, and enriched Business Model.
  3. Unit Economics, TAM/SAM/SOM (directional ranges + confidence), Strategic Moat (per-dimension 1–10), and Historical Analogue all render.
  4. The "Outlook & Exit" narrative appears with NO fabricated probabilities or price targets, and every forward-looking field carries its Fact/Estimate + confidence chip.
  5. All added Overview sections render via the existing `CollapsibleSection`/`SectionEmpty`, showing the "Run deep-dive" empty state before first generation.
**Plans**: TBD
**UI hint**: yes

### Phase 3: Competitors Enrichment
**Goal**: A user viewing the Competitors tab sees the existing ranking grouped by threat tier and a Capability Matrix scoring the company against its top 3 threats — with no re-discovery of competitors.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: CMP-01, CMP-02
**Success Criteria** (what must be TRUE):
  1. The competitor ranking table is grouped into threat tiers (direct / indirect-asymmetric / emerging-stealth), reusing existing competitor sync data with no re-discovery pass.
  2. A Capability Matrix rates the company vs. its top 3 threats (1–10) across IP Depth, GTM Velocity, Capital Efficiency, and Workflow Retention.
  3. Existing competitor ranking behavior (valuation, revenue, V/R multiple, SEC-verified badges) is preserved and the enrichment shows a "Run deep-dive" empty state before generation.
**Plans**: TBD
**UI hint**: yes

### Phase 4: Valuation Targets Tab
**Goal**: A user can explore a transparent comps-based valuation model for 2026–2030 with adjustable growth and multiple assumptions, and sees factual financial detail on the Valuation tab — all clearly labelled as comps math, not a forecast.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: VAL-01, VAL-02, VAL-03, VAL-04, VAL-05
**Success Criteria** (what must be TRUE):
  1. A new "Valuation Targets" tab renders a 2026–2030 comps model where implied valuation = projected revenue × applied V/R multiple, across Bear/Base/Bull scenarios (growth × p25/median/p75 peer multiple) with the agent-proposed base growth + confidence + rationale.
  2. Overriding growth % or multiple percentile recomputes the table and chart live, client-side.
  3. Every valuation cell exposes its inputs on hover, peer multiples carry source + SEC-verified badge, and an explicit "implied by comps, not a forecast" disclaimer is shown.
  4. The Valuation tab shows factual financial detail (margins/burn/runway/ACV) where retrievable, each tagged fact/estimate + confidence, with the existing valuation timeline/table preserved.
  5. No exact $ valuation target appears that is not derived from the transparent comps calculation.
**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 3/4 | In Progress|  |
| 2. Overview Enrichment | 0/TBD | Not started | - |
| 3. Competitors Enrichment | 0/TBD | Not started | - |
| 4. Valuation Targets Tab | 0/TBD | Not started | - |
