# Company Deep-Dive Analysis — Design Spec

**Date:** 2026-07-02
**Status:** Approved (brainstorming complete → handing off to GSD for planning)
**Feature:** Turn the 19-section institutional deep-dive analysis prompt into a
grounded, per-company analyst layer distributed across the existing company tabs,
plus a new comps-based **Valuation Targets (2026–2030)** tab.

---

## 1. Goal & framing

Add an "analyst layer" to each company page: a synthesized business, technology,
competitive, and valuation analysis generated from data the app already holds
(canonical record, competitor multiples, funding/valuation history, news, docs)
and enriched by a single structured Grok/xAI pass.

The source material is a 19-section institutional prompt (exec summary → IC
conclusion). It is adapted — **not implemented verbatim** — to respect the
project's standing guardrails.

### Guardrails (non-negotiable)
- **No fabricated financial data.** No invented P&L, revenue, or margins asserted
  as fact.
- **No predictive risk metrics.** No fabricated probability tables (IPO-by-year %,
  acquisition %, scenario % splits).
- Everything forward-looking is **clearly labelled** with `basis: fact|estimate`
  and `confidence: low|med|high`, and — where quantitative — is a **transparent,
  reproducible calculation from real inputs**, not an LLM-asserted number.

### Key decisions (locked during brainstorming)
1. **Hybrid speculation** — keep qualitative forward-looking analysis (moat,
   scenarios, analogue, thesis) with confidence labels; **exclude** fabricated
   quantitative models. The one exception is the Valuation Targets tab, which is
   allowed because it is a **comps calculation** (real inputs, visible
   assumptions), not a fabricated forecast.
2. **Distribute** the narrative sections into existing tabs (no catch-all "Thesis"
   tab) **plus one new tab** dedicated to Valuation Targets.
3. **One structured agent → stored JSON.** A single Grok deep-dive run produces one
   object; each tab reads its slice. Refreshed on demand (not on every Sync).
4. **Valuation growth input** — agent proposes a confidence-tagged base growth rate
   with rationale; Bear/Base/Bull are presets; the user can override growth % and
   multiple percentile, and valuations recompute live.

---

## 2. Section → tab distribution (the 19 sections, hybrid-trimmed)

### Overview tab — the thesis home (added sections rendered as `CollapsibleSection`)
- **§1 Executive Summary** — thesis, value prop, strengths/weaknesses, positioning,
  most-likely-outcome. Pinned at top.
- **§2 Company Overview** — enrich existing with exec leadership + employee count.
- **§3 Core Technology & Differentiator** + **moat rating (1–10)**.
- **§4 Product Portfolio** — qualitative per-product; directional sizing, no
  fabricated revenue $.
- **§5 Vertical & Customer Segments**.
- **§7 Business Model** — enriches existing `BusinessModelAnalysis`.
- **§9 Unit Economics** — qualitative/directional, confidence-tagged.
- **§11 TAM / SAM / SOM** — "Market Opportunity" block, directional ranges +
  confidence.
- **§12 Strategic Moat** — per-dimension 1–10 (switching costs, network/flywheel,
  distribution/regulatory, IP).
- **§18 Historical Analogue** — qualitative comparison.
- **§10 / §13 / §14 / §17 → "Outlook & Exit" block** — a single qualitative
  narrative (likely strategic moves, IPO readiness, likely suitors, scenario
  narrative). **Numbers dropped** (no % probabilities, no price targets).
- **§19 IC Conclusion** — Rating (Strong Buy / Buy / Hold / Sell) + bull/bear +
  one-paragraph recommendation. Pinned at bottom. **No fabricated valuation
  targets / scaling-probability tables.**

### Competitors tab — biggest enrichment
- **§6 Competitive Landscape** — layer threat **tiers** (direct / indirect-asymmetric
  / emerging-stealth) onto the existing ranking table, **plus a Capability Matrix**
  (IP Depth · GTM Velocity · Capital Efficiency · Workflow Retention, 1–10 vs top 3
  threats). Phase-0 live competitor discovery **reuses the existing competitor
  sync** rather than re-discovering.

### Valuation tab
- **§8 Historical Financials** — add margins / burn / runway / ACV **where
  factually retrievable**; otherwise estimate + confidence. (Existing valuation
  timeline/table stays.)

### Valuation Targets tab (NEW) — see §4 below
- **§16 Valuation Scenarios** — implemented properly as a comps model (2026–2030).

### Dropped entirely
- **§15 10-year forecast model** — fabricated quantitative P&L; out of scope.

---

## 3. Data model & generation

### Table `company_analysis`
One row per company, upserted. RLS via company ownership (same pattern as other
per-company tables).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `company_id` | uuid | unique, FK → companies, RLS anchor |
| `generated_at` | timestamptz | shown in UI; drives staleness hint |
| `model` | text | e.g. the Grok model id |
| `sections` | jsonb | narrative object (see field shape) |
| `valuation` | jsonb | comps inputs (see §4) |

**Field shape** for every forward-looking narrative field:
```jsonc
{ "text": "…", "basis": "fact" | "estimate", "confidence": "low" | "med" | "high", "source": "…?" }
```

### Agent `lib/agents/deep-dive.ts` — `runDeepDive(supabase, company)`
1. **Gather grounding context already in-app:** canonical record, competitor
   ranking + multiples, funding/valuation history, news, document summaries.
2. **One Grok call** → structured JSON matching the `sections` schema. Competitor
   discovery reuses existing sync results (does not re-run Phase 0).
3. **Comps inputs computed in code, not by the LLM** — peer-multiple percentiles
   and base revenue are deterministic; the LLM supplies only the growth proposal +
   rationale + confidence.
4. **Upsert** into `company_analysis`.

### Trigger & UX
- A dedicated header button ("Run deep-dive"), **on-demand**, separate from Sync,
  with staged progress mirroring the existing `SyncButton`.
- Re-run overwrites the row (timestamped).
- **Empty state** before first run: each enriched area shows a compact "Run
  deep-dive" CTA instead of clutter.
- **Staleness:** show `generated_at`; if valuations/competitors changed since,
  render a subtle "may be stale" hint.

### Shared UI
- One small **chip pair**: `Fact`/`Estimate` badge + `Low/Med/High` confidence,
  built on the existing `Badge`. Reused wherever generated content appears.
- Overview's added sections reuse `components/dashboard/collapsible-section.tsx`
  (`CollapsibleSection` / `SectionEmpty`).

---

## 4. Valuation Targets tab (2026–2030) — comps model

Pure comparative valuation. **All inputs already exist in-app.**

| Input | Source |
|---|---|
| Base revenue / ARR | `canonical.revenue.value` |
| Peer V/R multiples | `buildCompetitorRanking` (Competitors tab) |
| Comp multiple | median + p25/p75 across **SEC-verified** peers |
| Current valuation | `latestValuation` |

### Math (per year 2026–2030)
```
projected revenue(year) = base revenue × (1 + growth)^n
implied valuation(year) = projected revenue(year) × applied V/R multiple
```

### Scenarios (two real levers)
- **Bear** — lower growth + multiple compression (p25 peer multiple).
- **Base** — median growth + median peer multiple.
- **Bull** — higher growth + multiple expansion (p75 peer multiple).

### Growth input (locked decision #4)
- Agent proposes a **base growth rate** with confidence + one-line rationale,
  grounded in the company's own history/sector.
- Bear/Base/Bull are presets around it.
- User can **override** growth % and multiple percentile via inputs; the table +
  chart **recompute live** (client-side).

### Presentation
- Table: rows = 2026–2030, columns = Bear / Base / Bull implied valuation.
- Small chart of the three paths (reuse existing dashboard chart approach).
- Every cell shows its inputs on hover; peer multiples carry source + SEC-verified
  badge (same as Competitors tab).
- Explicit disclaimer: *"Implied by peer comparables under the shown assumptions —
  not a forecast."*

### `valuation` JSONB shape
```jsonc
{
  "base_revenue": { "value": 0, "source": "…" },
  "current_valuation": 0,
  "peer_multiple": { "median": 0, "p25": 0, "p75": 0, "n_peers": 0, "n_sec_verified": 0 },
  "growth": {
    "base": 0.0, "bear": 0.0, "bull": 0.0,
    "confidence": "low|med|high",
    "rationale": "…"
  }
}
```

---

## 5. Implementation phases (each independently shippable)

1. **Foundation** — `company_analysis` table + migration + RLS; `runDeepDive`
   agent + Grok structured prompt; "Run deep-dive" header button with staged
   progress; shared Fact/Estimate + confidence chip.
2. **Overview enrichment** — render §1–§5, §7, §9, §11, §12, §18, Outlook & Exit,
   §19 as collapsible sections; empty/stale states.
3. **Competitors enrichment** — threat tiers + Capability Matrix layered on the
   existing ranking table.
4. **Valuation Targets tab** — comps model, interactive growth/multiple controls,
   table + chart; §8 financial detail added to the Valuation tab.

Final tab list (9): `Overview · Provenance · Data room · Investment · Valuation ·
Valuation Targets · Funding Rounds · Competitors · News`.

---

## 6. Out of scope
- §15 fabricated 10-year P&L forecast model.
- Any asserted probability tables (IPO-by-year, acquisition %, scenario % splits).
- Exact $ valuation targets that are not derived from the comps calculation.
