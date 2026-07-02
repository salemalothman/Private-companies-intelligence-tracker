# Requirements: Deep-Dive Analysis

**Defined:** 2026-07-02
**Core Value:** Every generated insight is grounded and honestly labelled — real
facts vs. confidence-tagged estimates vs. transparent comps math — never
fabricated financials or invented probabilities.

## v1 Requirements

Requirements for the deep-dive analysis feature. Each maps to a roadmap phase.

### Foundation

- [x] **FND-01**: A `company_analysis` table stores one JSONB analysis row per
  company (upserted, RLS via company ownership), with `generated_at` and `model`.
- [x] **FND-02**: A single Grok deep-dive agent (`runDeepDive`) generates one
  structured `sections` object per company from existing in-app grounding context
  (canonical record, competitor ranking, funding/valuation history, news, docs).
- [x] **FND-03**: Comps inputs (peer-multiple percentiles, base revenue) are
  computed in code, not by the LLM; the LLM supplies only the growth proposal +
  rationale + confidence.
- [x] **FND-04**: A "Run deep-dive" header button triggers generation on demand
  (separate from Sync) with staged progress; re-run overwrites, timestamped.
- [x] **FND-05**: Every forward-looking generated field carries
  `basis: fact|estimate` and `confidence: low|med|high`, surfaced via a shared
  Fact/Estimate + confidence chip component.
- [x] **FND-06**: Before first generation, enriched areas show a compact
  "Run deep-dive" empty state; a "may be stale" hint shows when underlying data
  changed after `generated_at`.

### Overview enrichment

- [x] **OVR-01**: Overview renders the Executive Summary (thesis, value prop,
  strengths/weaknesses, positioning, most-likely-outcome) pinned at top.
- [x] **OVR-02**: Overview shows Core Technology & Differentiator with a moat
  rating (1–10), plus Product Portfolio, Vertical & Customer Segments, and
  enriched Business Model.
- [x] **OVR-03**: Overview shows Unit Economics, TAM/SAM/SOM (directional ranges +
  confidence), Strategic Moat (per-dimension 1–10), and Historical Analogue.
- [x] **OVR-04**: Overview shows an "Outlook & Exit" narrative (likely strategic
  moves, IPO readiness, likely suitors, scenario narrative) with NO fabricated
  probabilities, and an IC Conclusion (rating + bull/bear + recommendation)
  pinned at bottom.
- [x] **OVR-05**: Added Overview sections render as collapsible sections reusing
  `CollapsibleSection`/`SectionEmpty`.

### Competitors enrichment

- [x] **CMP-01**: The competitor ranking table gains threat-tier grouping
  (direct / indirect-asymmetric / emerging-stealth), reusing existing competitor
  sync data (no re-discovery).
- [x] **CMP-02**: A Capability Matrix rates the company vs. top 3 threats (1–10)
  across IP Depth, GTM Velocity, Capital Efficiency, and Workflow Retention.

### External grounding ingestion

- [x] **ING-01**: A local/cron ingestion script (mirroring the market-cache
  pattern) runs the Printing Press CLIs in `--agent` JSON mode and upserts
  source-tagged results into Supabase; it does NOT run in the Vercel serverless
  runtime.
- [x] **ING-02**: `sec-edgar` — resolve public peers to CIK (`companies lookup`)
  and cache XBRL income facts (`facts statement`) + peer-revenue cross-sections
  into Supabase, feeding real peer revenue/multiples and factual financials.
- [ ] **ING-03**: `company-goat` — cache SEC Form D rounds + startup signals
  (`snapshot`/`funding`) per portfolio company + competitor, with CIK
  disambiguation (no ambiguous name-fragment amounts).
- [x] **ING-04**: `x-twitter` — sync company + competitor posts via an app-only
  bearer token into Supabase for news/sentiment.
- [ ] **ING-05**: `runDeepDive` reads the cached ingested facts as additional
  grounding, so generated fields cite real Form D / XBRL / X sources.
- [x] **ING-06**: Ingestion is idempotent and source-tagged, preserves the
  no-fabrication guardrail (fact + source labelling), and keeps all secrets
  (`X_BEARER_TOKEN`, `COMPANY_PP_CONTACT_EMAIL`) in env only.

### Valuation Targets tab

- [ ] **VAL-01**: The Valuation tab gains factual financial detail
  (margins/burn/runway/ACV) where retrievable, each tagged fact/estimate +
  confidence.
- [ ] **VAL-02**: A new "Valuation Targets" tab renders a comps model for
  2026–2030: `implied valuation = projected revenue × applied V/R multiple`.
- [ ] **VAL-03**: Three scenarios (Bear/Base/Bull) driven by growth rate and peer
  multiple percentile (p25/median/p75), with agent-proposed base growth +
  confidence + rationale.
- [ ] **VAL-04**: The user can override growth % and multiple percentile; the
  table and chart recompute live (client-side).
- [ ] **VAL-05**: Every valuation cell exposes its inputs on hover, peer multiples
  carry source + SEC-verified badge, and an explicit "implied by comps, not a
  forecast" disclaimer is shown.

## v2 Requirements

Deferred to future release.

### Automation

- **AUTO-01**: Auto-regenerate the deep-dive when underlying data changes
  materially (currently manual on-demand only).
- **AUTO-02**: Version history / diff of analyses over time.

## Out of Scope

| Feature | Reason |
|---------|--------|
| 10-year P&L forecast model (§15) | Fabricated quantitative financials — violates no-fabricated-data guardrail |
| Asserted probability tables (IPO-by-year %, acquisition %, scenario % splits) | Violates no-predictive-risk-metrics guardrail |
| Exact $ valuation targets not derived from comps | Only transparent peer-multiple math allowed |
| New "Thesis" catch-all tab | Decision: distribute into existing tabs + one Valuation Targets tab |

## Traceability

Updated during roadmap creation (2026-07-02).

| Requirement | Phase | Status |
|-------------|-------|--------|
| FND-01 | Phase 1 — Foundation | Complete |
| FND-02 | Phase 1 — Foundation | Complete |
| FND-03 | Phase 1 — Foundation | Complete |
| FND-04 | Phase 1 — Foundation | Complete |
| FND-05 | Phase 1 — Foundation | Complete |
| FND-06 | Phase 1 — Foundation | Complete |
| OVR-01 | Phase 2 — Overview Enrichment | Complete |
| OVR-02 | Phase 2 — Overview Enrichment | Complete |
| OVR-03 | Phase 2 — Overview Enrichment | Complete |
| OVR-04 | Phase 2 — Overview Enrichment | Complete |
| OVR-05 | Phase 2 — Overview Enrichment | Complete |
| CMP-01 | Phase 3 — Competitors Enrichment | Complete |
| CMP-02 | Phase 3 — Competitors Enrichment | Complete |
| ING-01 | Phase 4 — External Grounding Ingestion | Complete |
| ING-02 | Phase 4 — External Grounding Ingestion | Complete |
| ING-03 | Phase 4 — External Grounding Ingestion | Pending |
| ING-04 | Phase 4 — External Grounding Ingestion | Complete |
| ING-05 | Phase 4 — External Grounding Ingestion | Pending |
| ING-06 | Phase 4 — External Grounding Ingestion | Complete |
| VAL-01 | Phase 5 — Valuation Targets Tab | Pending |
| VAL-02 | Phase 5 — Valuation Targets Tab | Pending |
| VAL-03 | Phase 5 — Valuation Targets Tab | Pending |
| VAL-04 | Phase 5 — Valuation Targets Tab | Pending |
| VAL-05 | Phase 5 — Valuation Targets Tab | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24 ✓
- Unmapped: 0 ✓

---
*Requirements defined: 2026-07-02*
*Last updated: 2026-07-02 after roadmap creation*
