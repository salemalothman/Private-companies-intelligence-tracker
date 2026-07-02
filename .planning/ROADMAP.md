# Roadmap: Deep-Dive Analysis

## Overview

This feature adds a grounded, per-company "analyst layer" to the existing Next.js
15 / Supabase portfolio tracker. Phase 1 lays the shared substrate — a
`company_analysis` JSONB table, the `runDeepDive` Grok agent, an on-demand "Run
deep-dive" header button, and a reusable Fact/Estimate + confidence chip — that
later phases all read from. Phases 2 and 3 distribute the narrative thesis into
the existing Overview and Competitors tabs. Phase 4 stands up an external
grounding-ingestion pipeline (Printing Press CLIs — company-goat Form D,
sec-edgar XBRL, x-twitter news — synced into Supabase via a local/cron script)
so the analysis is backed by verifiable real sources. Phase 5 delivers the new
comps-based Valuation Targets (2026–2030) tab plus factual financial detail on
the Valuation tab, consuming the ingested peer XBRL + Form D. Every generated
insight is honestly labelled (fact vs. confidence-tagged estimate vs. transparent
comps math) — no fabricated financials, no invented probabilities.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation** - Analysis storage, the Grok deep-dive agent, on-demand trigger, and shared confidence chip (completed 2026-07-02)
- [x] **Phase 2: Overview Enrichment** - Distribute the thesis sections into the Overview tab as collapsible content (completed 2026-07-02)
- [ ] **Phase 3: Competitors Enrichment** - Threat tiers and a Capability Matrix layered on the existing ranking table
- [ ] **Phase 4: External Grounding Ingestion** - Sync company-goat (Form D) + sec-edgar (peer XBRL) + x-twitter (news) into Supabase via a local/cron script; runDeepDive reads the cached facts
- [ ] **Phase 5: Valuation Targets Tab** - Comps model (2026–2030) with interactive controls, plus factual financial detail on Valuation

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
- [x] 01-04-PLAN.md — Run deep-dive header button + server action + empty/stale wiring (FND-04, FND-06)
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
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Tighten AnalysisSections per-section shapes + extend runDeepDive prompt/zod to emit the full OVR section set; regen script + unit tests; spec §3 (OVR-01..04 data side)
- [x] 02-02-PLAN.md — Overview rendering: RatingIndicator + OverviewAnalysis (pinned Exec Summary/IC Conclusion, collapsibles, ConfidenceChips, 1-10 ratings) wired into the Overview tab (OVR-01..05)
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

### Phase 4: External Grounding Ingestion
**Goal**: A local/cron ingestion pipeline syncs real external grounding — company-goat SEC Form D rounds, sec-edgar public-peer XBRL financials, and x-twitter company+competitor news — into Supabase, and `runDeepDive` reads these cached facts so the analysis is backed by verifiable sources rather than the LLM alone.
**Mode:** mvp
**Depends on**: Phase 1
**Requirements**: ING-01, ING-02, ING-03, ING-04, ING-05, ING-06
**Success Criteria** (what must be TRUE):
  1. A local/cron ingestion script upserts source-tagged rows into Supabase from company-goat, sec-edgar, and x-twitter in `--agent` JSON mode; it does not run in the Vercel serverless runtime.
  2. sec-edgar public-peer XBRL income facts and company-goat Form D rounds are cached per company/peer, with CIK disambiguation applied (no ambiguous name-fragment amounts).
  3. x-twitter company + competitor posts are synced via an app-only bearer token into Supabase for news/sentiment.
  4. `runDeepDive` reads the cached facts as additional grounding; generated fields cite real Form D / XBRL / X sources and the no-fabrication guardrail is preserved.
  5. All secrets (`X_BEARER_TOKEN`, `COMPANY_PP_CONTACT_EMAIL`) are env-only; ingestion is idempotent and re-runnable.
**Plans**: 6 plans
Plans:
- [ ] 04-01-PLAN.md — grounding cache schema (0021) + lib/types.ts + [BLOCKING] supabase db push (ING-01, ING-06)
- [ ] 04-02-PLAN.md — ingestion script skeleton + envelope/CIK parser + unit tests (ING-01, ING-06)
- [ ] 04-03-PLAN.md — company-goat module: Form D rounds + signals with CIK disambiguation (ING-03, ING-06)
- [ ] 04-04-PLAN.md — sec-edgar module: peer CIK resolution + XBRL income facts + cross-section (ING-02, ING-06)
- [ ] 04-05-PLAN.md — x-twitter module: doctor preflight + read-only tweets sync, opt-in on X_BEARER_TOKEN (ING-04, ING-06)
- [ ] 04-06-PLAN.md — runDeepDive grounding extended to read the three caches with source attribution (ING-05, ING-06)
**UI hint**: no

### Phase 5: Valuation Targets Tab
**Goal**: A user can explore a transparent comps-based valuation model for 2026–2030 with adjustable growth and multiple assumptions, and sees factual financial detail on the Valuation tab — all clearly labelled as comps math, not a forecast.
**Mode:** mvp
**Depends on**: Phase 1, Phase 4
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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation | 4/4 | Complete   | 2026-07-02 |
| 2. Overview Enrichment | 2/2 | Complete   | 2026-07-02 |
| 3. Competitors Enrichment | 0/TBD | Not started | - |
| 4. External Grounding Ingestion | 0/6 | Not started | - |
| 5. Valuation Targets Tab | 0/TBD | Not started | - |
