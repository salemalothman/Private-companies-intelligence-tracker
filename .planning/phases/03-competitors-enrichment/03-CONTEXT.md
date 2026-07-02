# Phase 3: Competitors Enrichment - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Source:** Approved design spec §Competitors + Phase 1/2 contracts

<domain>
## Phase Boundary

Enrich the **Competitors tab** (`app/(app)/companies/[id]/page.tsx`) with:
1. **Threat tiers** — group the existing competitor ranking rows into
   direct / indirect-asymmetric / emerging-stealth (CMP-01).
2. **Capability Matrix** — the company vs its top 3 threats scored 1–10 across
   IP Depth, GTM Velocity, Capital Efficiency, Workflow Retention (CMP-02).

Like Phase 2, this requires BOTH:
  1. **Extend the agent** — add a `competitors` analysis block to the deep-dive
     output (threat tier per competitor name + the capability matrix), classifying
     the ALREADY-DISCOVERED competitors. Extend `AnalysisSections`/`OverviewSections`
     types, the `runDeepDive` Grok prompt + zod schema, and `normalizeSections`.
  2. **Render** the tiers + matrix in the Competitors tab.

**Reuse existing competitor sync — NO re-discovery.** The competitor list comes from
`buildCompetitorRanking` (`lib/competitors/rank.ts`, `RankedEntity[]` keyed by `name`,
with `valuation`/`revenue`/`multiple`/`secVerified`/`isTarget`). The agent only
CLASSIFIES those existing names; it must not invent new competitors.

**Out of scope:** ingestion (Phase 4), Valuation Targets (Phase 5), Overview
(Phase 2 done). Behavior-preserving for all other tabs.
</domain>

<decisions>
## Implementation Decisions

### Agent extension (data side)
- Add a `competitors` section to the analysis output with:
  - `threat_tiers`: a mapping of competitor `name` → `"direct" | "indirect" | "emerging"`
    (only for names present in the existing ranking; unmatched names ignored).
  - `capability_matrix`: `{ target: name; threats: [{ name, ip_depth, gtm_velocity,
    capital_efficiency, workflow_retention }] }` where each score is an integer 1–10
    and `threats` is the top 3 (agent-selected from the ranked competitors).
  - Optional short `narrative: LabelledField` summarizing the competitive picture.
- The agent receives the ranked competitor NAMES as grounding (already gathered in
  `runDeepDive`) and classifies/scores them. It must NOT add names not in the list.
- `normalizeSections` extends to: clamp all 1–10 scores, coerce tier to the enum
  (drop unknown), drop matrix threats whose name isn't in the ranking, cap threats at 3.
- Guardrail: 1–10 scores are qualitative judgement (allowed, like moat ratings);
  no fabricated financials; comps/valuation shape UNCHANGED.

### Rendering (Competitors tab)
- **Threat tiers (CMP-01):** group the existing ranking table rows by tier
  (direct → indirect → emerging), with a small tier label/heading per group. The
  target company row stays highlighted. PRESERVE all existing columns + behavior
  (rank #, valuation, revenue, V/R multiple, as-of, source link, basis, SEC-verified
  badge). Rows whose name has no classification fall into an "Unclassified" group or
  keep current flat order — pick the cleaner default.
- **Capability Matrix (CMP-02):** a compact grid — rows = target + top 3 threats,
  columns = IP Depth / GTM Velocity / Capital Efficiency / Workflow Retention, cells
  = 1–10 via the existing `RatingIndicator` (reuse from Phase 2). Design-system
  consistent (flat, hairline, tabular-nums).
- Before first deep-dive run (no analysis), the enrichment shows the `DeepDiveEmpty`
  CTA; the raw ranking table still renders as today.
- Server-component rendering; if reusing `CollapsibleSection`, pass it icon-less
  (RSC boundary rule from Phase 2).

### Claude's Discretion
- Exact TypeScript shapes for the `competitors` block + zod schema.
- Whether tiers render as grouped table sections vs a tier badge column.
- Matrix visual (grid of RatingIndicators vs heatmap) within the design system.
- Handling of competitors with no tier (Unclassified group vs omit).
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

- `docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md` — §Competitors (threat tiers + Capability Matrix).
- `.planning/PROJECT.md` — guardrails. `.planning/REQUIREMENTS.md` — CMP-01, CMP-02.
- `lib/competitors/rank.ts` — `RankedEntity`/`buildCompetitorRanking` (the existing ranking to classify; keyed by `name`, has `isTarget`/`secVerified`/`multiple`).
- `lib/agents/deep-dive-types.ts` — extend with the `competitors` block shape.
- `lib/agents/deep-dive.ts` — extend prompt + zod + normalizeSections (mirror the Phase 2 pattern; the competitor names are already gathered in the grounding step).
- `app/(app)/companies/[id]/page.tsx` — Competitors tab (the existing ranking table to enrich; behavior-preserving elsewhere).
- `components/company/rating-indicator.tsx` — reuse for the 1–10 matrix cells + tier scores.
- `components/company/confidence-chip.tsx` — `ConfidenceChip`/`DeepDiveEmpty`.
- `components/company/overview-sections.tsx` — Phase 2 renderer patterns to mirror (server component, RSC-safe reuse).
- `.planning/codebase/CONVENTIONS.md` — design system.
</canonical_refs>

<specifics>
## Specific Ideas
- Match competitor names case-insensitively when joining tiers/matrix to ranking rows.
- Top 3 threats for the matrix should prefer `direct`-tier competitors.
- Reuse `RatingIndicator` (1–10) so the matrix visually matches the Overview moat ratings.
- After extending the agent, regenerate one demo company (Replit — it has competitors:
  Cursor, Cognition, Lovable per the earlier run) to verify tiers + matrix render.
</specifics>

<deferred>
## Deferred Ideas
- Ingested real facts feeding competitor classification (Phase 4 → richer regen later).
- Valuation Targets tab (Phase 5).
</deferred>

---

*Phase: 03-competitors-enrichment*
*Context gathered: 2026-07-02*
