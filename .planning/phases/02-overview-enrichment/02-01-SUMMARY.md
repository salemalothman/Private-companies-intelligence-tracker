---
phase: 02-overview-enrichment
plan: 01
subsystem: deep-dive-analysis
tags: [types, agent, grok, zod, normalization, guardrails, tdd]
requires:
  - "lib/agents/deep-dive-types.ts (Phase-1 AnalysisSections/LabelledField/AnalysisValuation)"
  - "lib/agents/deep-dive.ts (Phase-1 runDeepDive + code-computed comps)"
provides:
  - "OverviewSections typed per-section shape (source of truth for the Overview tab)"
  - "clampRating pure helper (integer 1..10 or null)"
  - "normalizeSections pure helper (LLM-output shaping + guardrail filtering)"
  - "Extended Grok prompt + ANALYSIS_SHAPE emitting the full 11-section OVR set"
  - "scripts/regen-deep-dive.ts (service-role end-to-end regeneration)"
affects:
  - "Plan 02-02 (Overview rendering consumes OverviewSections)"
tech-stack:
  added: []
  patterns:
    - "Pure, throw-free normalizer at the LLM→app trust boundary (clamp/coerce/strip before persist)"
    - "Types as single source of truth; spec table mirrors them"
    - "TDD RED→GREEN for pure helpers (clampRating, normalizeSections)"
key-files:
  created:
    - "scripts/regen-deep-dive.ts"
  modified:
    - "lib/agents/deep-dive-types.ts"
    - "lib/agents/deep-dive.ts"
    - "lib/agents/deep-dive.test.ts"
    - "docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md"
decisions:
  - "clampRating returns null (not a clamped 1/10) for out-of-domain input, so an out-of-range rating is treated as 'no rating' rather than a silently rewritten legal value — never fabricated."
  - "AnalysisSections redefined as OverviewSections ∩ legacy open index, keeping lib/types.ts and Phase-1 stored rows valid with no migration."
  - "OverviewSections producer value cast to the wider AnalysisSections column type at the upsert boundary (a normalized OverviewSections is always a valid AnalysisSections)."
  - "Guardrail enforced in three layers: type (LabelledField only for outlook_and_exit), prompt hard-rules, and normalizeSections stripping stray probability/price keys."
metrics:
  duration: "~10 min"
  completed: "2026-07-02"
  tasks: 3
  files: 5
---

# Phase 2 Plan 01: Overview Data Layer (typed sections + full-set agent) Summary

Tightened `AnalysisSections` into a typed per-section `OverviewSections` shape and extended `runDeepDive`'s Grok prompt + zod boundary so a run emits the full 11-section OVR set (executive summary → IC conclusion), with a pure `normalizeSections` that clamps 1–10 ratings, coerces the IC rating enum, and strips probability/price-target keys before persistence — plus a service-role regeneration script and spec §3 update.

## What Was Built

### Task 1 — Typed OverviewSections + clampRating (commit `020eca5`)
- `Rating1to10` type and exported pure `clampRating(n)` → integer 1..10 or `null` (floors fractionals; null for 0, 11, negatives, NaN, Infinity, null/undefined).
- `OverviewSections` interface naming all 11 OVR section keys with typed shapes: `executive_summary` (thesis/value_prop/positioning/most_likely_outcome + strengths[]/weaknesses[]), `technology` (narrative + `moat_rating`), `product_portfolio`, `vertical_customer`, `business_model`, `unit_economics`, `market_opportunity` (tam/sam/som), `strategic_moat` (4 dimensions + optional narrative), `historical_analogue`, `outlook_and_exit` (narrative LabelledField only), `ic_conclusion` (rating enum + bull/bear/recommendation).
- Every field optional so Phase-1 partial rows still type-check.
- `AnalysisSections` redefined as `OverviewSections & { open index }` → lib/types.ts unchanged, no migration.
- `LabelledField` and `AnalysisValuation` left exactly as-is.

### Task 2 — Full-set prompt/zod + normalizeSections (commit `9cc77ab`)
- Exported pure `normalizeSections(raw): OverviewSections` — throw-free; `{}` for non-object input; `clampRating` on `moat_rating` and each strategic_moat dimension; `toLabelled` keeps only {text, basis, confidence, source} (this is what strips stray `probability`/`price_target` keys); IC rating coerced to the four-value enum or dropped; unknown/missing keys dropped.
- Rewrote `ANALYSIS_SHAPE` to describe the full nested section set to Grok (reusing a `LABELLED` field template).
- Extended `buildPrompt` to enumerate every section and repeat the hard rules, explicitly stating the only emitted numbers are growth RATES and the 1–10 rating indicators.
- `runDeepDive` step 2 now `sections = normalizeSections(parsed.data.sections)`; growth parsing, comps calls, valuation object, and upsert untouched.

### Task 3 — Regen script + spec §3 (commit `c046027`)
- `scripts/regen-deep-dive.ts` mirrors `scripts/sync-company.ts`: `ws` polyfill, `process.loadEnvFile(".env.local")`, service-role client, `ilike` lookup (`NAME = argv[2] ?? "Replit"`), loads full nested relations, calls `runDeepDive`, re-reads `company_analysis`, and prints the produced section keys + `ic_conclusion.rating`. Exits non-zero on error.
- Spec §3: replaced the single generic field-shape block with a per-section table mirroring `OverviewSections`, plus the note "Types in `lib/agents/deep-dive-types.ts` are the source of truth." §4 (valuation) unchanged.

## Deviations from Plan

None — plan executed exactly as written. One necessary in-scope adjustment: the `OverviewSections` producer value is cast to the wider `AnalysisSections` column type at the upsert (`sections as AnalysisSections`) since the stored alias is intentionally wider for legacy rows; a test cast was widened via `as unknown as` for a deliberate off-type key probe. Both are type-level plumbing, not behavior changes.

## Guardrail Compliance
- No fabricated financials: only growth RATES (unchanged) and 1–10 rating indicators are numeric.
- No probabilities/price targets in `outlook_and_exit`: enforced at the type level (LabelledField only), in the prompt hard-rules, AND in `normalizeSections` (strips stray keys). Covered by a dedicated unit test.
- `AnalysisValuation` / `computePeerMultiple` / `deriveBaseRevenue` / `percentile` untouched (confirmed via diff); existing comps tests still green.

## Verification
- `npx vitest run lib/agents/deep-dive.test.ts` → 14 passed (5 new: clampRating; 5 new: normalizeSections; 4 existing comps).
- `npx tsc --noEmit` → clean; `lib/types.ts` has zero diff.
- `npm run lint` → clean.
- Manual (operator, not run here): `node --conditions=react-server --import tsx scripts/regen-deep-dive.ts "Replit"`.

## Threat Register Follow-through
- T-02-01 (Tampering, Grok sections output) → mitigated by `normalizeSections` (drop unknown keys, clamp ratings, coerce IC enum, strip probability/price keys).
- T-02-02 (fabricated financials) → mitigated by repeated prompt hard-rules + LabelledField honesty model.
- T-02-03 (regen service-role) → accepted; operator-run local/CI script, secrets in gitignored `.env.local`.
- No new package installs (T-02-SC).

## Known Stubs
None. All produced/normalized data flows to real storage; the renderer (Plan 02-02) consumes `OverviewSections`.

## Self-Check: PASSED
All created/modified files exist on disk; all three task commits (020eca5, 9cc77ab, c046027) are present in git history.
