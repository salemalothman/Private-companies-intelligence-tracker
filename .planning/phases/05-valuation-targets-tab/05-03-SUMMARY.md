---
phase: 05-valuation-targets-tab
plan: 03
subsystem: ui
tags: [valuation, ui, tab, recharts, comps, rsc-boundary]

# Dependency graph
requires:
  - plan: 05-01
    provides: "buildCompsTable / clampGrowth / COMPS_YEARS / GROWTH_MIN / GROWTH_MAX / MultiplePercentile / CompsRow — the only $ source"
  - plan: 05-02
    provides: "HistoricalFinancialsSection type + stored historical_financials section on OverviewSections (VAL-01 data)"
provides:
  - "components/company/valuation-targets.tsx — client Valuation Targets tab (live table + recharts chart, inputs/provenance panel, disclaimer, empty/insufficient states)"
  - "components/company/historical-financials.tsx — server-safe VAL-01 render block"
  - "Wired 'Valuation Targets' tab between Valuation and Funding Rounds + VAL-01 block on the Valuation tab"
affects:
  - "Company detail page — final Phase 5 user-facing deliverable"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "RSC page passes ONLY serializable AnalysisValuation across the boundary; DeepDiveButton passed as ReactNode (existing client component)"
    - "Client tab owns growth-%/percentile state; table AND chart recompute via a single useMemo over buildCompsTable — no server round-trip, no duplicated math"
    - "Null-honesty at the UI: null cells render '—' (never 0); insufficient state names exactly what is missing"
    - "recharts styling matched verbatim to valuation-timeline.tsx (260px, hsl(var(--chart-N)), popover tooltip, formatCurrency ticks)"
    - "Hooks isolated in a ValuationTargetsBody subcomponent so the null-valuation early return respects the Rules of Hooks"

key-files:
  created:
    - "components/company/valuation-targets.tsx"
    - "components/company/historical-financials.tsx"
  modified:
    - "app/(app)/companies/[id]/page.tsx"

key-decisions:
  - "Table columns = Bear/Base/Bull (the CONTEXT table-columns approach): both growth override and percentile selector recompute all three columns via buildCompsTable overrides, so agent presets and the user-adjusted scenario share the same live columns."
  - "Percentile selector always sends a multiplePercentile override (default 'median'); the per-cell input tooltip uses the same applied percentile, so the hover math always matches the rendered cell."
  - "Growth stored/computed as a FRACTION internally; the control displays/edits percent (bounded to [GROWTH_MIN*100, GROWTH_MAX*100]) and passes through clampGrowth before compute."
  - "VAL-01 block is a Server Component (Card + ConfidenceChip only) rendered above the untouched timeline Card; DeepDiveEmpty CTA gates the no-analysis case, mirroring the Overview/Competitors tabs."

requirements-completed: [VAL-02, VAL-03, VAL-04, VAL-05]
# VAL-01 data landed in 05-02; its render block ships here. Final tick pends the human-verify checkpoint.

# Metrics
duration: ~8min
completed: 2026-07-02
---

# Phase 5 Plan 03: Interactive Valuation Targets tab + VAL-01 render block Summary

**A client "Valuation Targets" tab (2026–2030 Bear/Base/Bull comps table + live recharts chart driven by a growth-% input and a p25/median/p75 selector, with an inputs/provenance panel carrying the SEC badge and an always-on "not a forecast" disclaimer) plus a server-safe historical_financials block on the Valuation tab — every $ figure sourced exclusively from the tested buildCompsTable math, wired additively into the company page.**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-07-02T17:38:57Z
- **Tasks:** 3 code tasks complete; Task 4 is a blocking human-verify checkpoint (NOT executed by this agent).
- **Files:** 2 created, 1 modified.

## Accomplishments

- **`components/company/valuation-targets.tsx`** (`"use client"`, 424 lines) — three states:
  - **Empty** (null valuation) → `DeepDiveEmpty` with the deep-dive action.
  - **Insufficient** (null base_revenue OR all three peer multiples null) → an honest dashed panel that names exactly what is missing ("No base revenue on record" / "No SEC-verified peer multiples yet"), no fabricated table, disclaimer shown.
  - **Interactive** → controlled growth-% input (bounded, `clampGrowth`-fed) + p25/median/p75 button group; `rows = useMemo(buildCompsTable(valuation, {growth, multiplePercentile}), …)` for the LIVE recompute (VAL-04). Table rows 2026–2030 × Bear/Base/Bull, each cell `title`-tooltipped with `revenue × (1+g)^n × multiple = value` (VAL-05), null cells "—". recharts `LineChart` of the three scenario paths matched to `valuation-timeline` styling. Inputs/provenance panel: base revenue + source, current valuation, peer percentiles with `n_peers`/`n_sec_verified` + the `ShieldCheck`+"SEC" badge (same title as Competitors), and the agent growth proposal (bear/base/bull rates) with `ConfidenceChip` + rationale. Always-visible disclaimer.
- **`components/company/historical-financials.tsx`** (server component, 82 lines) — renders present `gross_margin`/`burn_rate`/`runway`/`acv` LabelledFields as chip-labelled blocks (eyebrow + text + `ConfidenceChip` + optional source) in a responsive grid inside a Card; returns `null` when nothing is present. No `dangerouslySetInnerHTML`.
- **`app/(app)/companies/[id]/page.tsx`** — three additive edits: the "Valuation Targets" trigger between Valuation and Funding Rounds; a new `TabsContent` rendering `ValuationTargets` with only `analysis?.valuation` (cast `AnalysisValuation | null`) + `DeepDiveButton` as the action; the VAL-01 `HistoricalFinancials` block above the preserved timeline Card (DeepDiveEmpty CTA when no analysis). The existing timeline Card + valuations table are byte-for-byte unchanged (git diff: +28/−1, the single deletion being the widened type import).

## Task Commits

1. **Task 1: historical_financials render block (VAL-01)** — `532d14c` (feat)
2. **Task 2: interactive Valuation Targets tab (VAL-02/03/04/05)** — `a51e3b1` (feat)
3. **Task 3: wire tab + VAL-01 block into page** — `2e2af44` (feat)

## Deviations from Plan

None — plan executed exactly as written. Rules 1–4 not triggered; no auto-fixes, no authentication gates.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint` on all three files — clean.
- `npx next build` — succeeds (`/companies/[id]` compiled).
- `npx vitest run lib/valuation/comps.test.ts` — 16/16 green (the tab's only $ source).
- `grep dangerouslySetInnerHTML` on both new components — only doc-comment mentions, no usage.
- `git diff` on page.tsx — additive-only; timeline Card + valuations table untouched.

## Threat Surface

All threat-register mitigations implemented:
- **T-05-07 (XSS via stored text):** base_revenue.source, growth.rationale, and all historical_financials text rendered as JSX children (React auto-escape); no `dangerouslySetInnerHTML` anywhere.
- **T-05-08 (RSC→client boundary):** page passes only `analysis.valuation` (serializable); `DeepDiveButton` crosses as a ReactNode (existing client component). No lucide component passed as a prop — the `ShieldCheck` icon is rendered inside the client file.
- **T-05-09 (fabricated $ figures):** every $ comes from `buildCompsTable`; null cells render "—"; no LLM-asserted valuation number is rendered.
- **T-05-10 (override DoS):** `clampGrowth` bounds the growth input; `buildCompsTable` is O(15). Accepted.

No new security surface introduced beyond the register.

## Known Stubs

None. Both components are fully wired to real stored data (`analysis.valuation` and `analysis.sections.historical_financials`). The insufficient/empty states are intentional honesty paths, not stubs.

## Pending Checkpoint (Task 4 — blocking human-verify)

Task 4 (`checkpoint:human-verify`, `gate="blocking"`) is intentionally NOT executed by this agent. It requires regenerating a demo company (`node --conditions=react-server --import tsx scripts/regen-deep-dive.ts "Replit"` — a real Grok call needing service-role keys) and a live browser eyeball. The orchestrator runs the regen + live check. Until it returns "approved", VAL-01's final requirement tick and the plan-complete status remain pending. See the checkpoint payload returned to the orchestrator for the exact verification steps and the expected Replit figures (Base 2026 ≈ $3.48B, etc.).

## Self-Check: PASSED

- FOUND: components/company/valuation-targets.tsx
- FOUND: components/company/historical-financials.tsx
- FOUND: app/(app)/companies/[id]/page.tsx
- FOUND commit: 532d14c (feat, Task 1)
- FOUND commit: a51e3b1 (feat, Task 2)
- FOUND commit: 2e2af44 (feat, Task 3)

---
*Phase: 05-valuation-targets-tab*
*Completed (code): 2026-07-02 — live-verify checkpoint pending*
