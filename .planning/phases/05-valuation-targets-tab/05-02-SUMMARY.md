---
phase: 05-valuation-targets-tab
plan: 02
subsystem: api
tags: [deep-dive, grok, agent, valuation, normalize, zod, vitest]

# Dependency graph
requires:
  - phase: 01-foundation
    provides: OverviewSections/AnalysisSections contract, runDeepDive agent (prompt/ANALYSIS_SHAPE/normalizeSections), LabelledField + toLabelled guardrail helper
  - phase: 04-external-grounding-ingestion
    provides: da325a4 hardening (MAX_ATTEMPTS retry loop + zero-sections no-clobber upsert guard), source-attributed grounding
provides:
  - HistoricalFinancialsSection type (gross_margin/burn_rate/runway/acv as LabelledFields only) + optional historical_financials key on OverviewSections
  - Agent emits + normalizes historical_financials (ANALYSIS_SHAPE fragment, prompt bullet + HARD RULE, normalizeSections grouped block via toLabelled)
  - regen-deep-dive.ts prints which historical_financials sub-fields landed (or "(none)")
affects: [05-03, valuation-tab-render, VAL-01]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Grouped labelled-field section normalization (mirrors market_opportunity): isObject guard -> per-field toLabelled -> drop-if-empty"
    - "Guardrail-by-construction: no numeric members on the type, so stray P&L/probability keys are structurally impossible after toLabelled"

key-files:
  created: []
  modified:
    - lib/agents/deep-dive-types.ts
    - lib/agents/deep-dive.ts
    - lib/agents/deep-dive.test.ts
    - scripts/regen-deep-dive.ts

key-decisions:
  - "historical_financials carries LabelledFields ONLY (no numeric P&L members) — the type itself is the no-fabricated-financials guardrail; toLabelled strips any stray numeric/probability keys the model attaches"
  - "Additive-only change to runDeepDive: ANALYSIS_SHAPE fragment + prompt bullet/HARD-RULE + one normalizeSections grouped block; the da325a4 MAX_ATTEMPTS retry loop and zero-sections no-clobber upsert guard are byte-for-byte unchanged (git-diff verified)"

patterns-established:
  - "New Overview labelled-field group = extend type + ANALYSIS_SHAPE + prompt + normalizeSections + tests + regen print, in that order"

requirements-completed: [VAL-01]

# Metrics
duration: 6min
completed: 2026-07-02
---

# Phase 5 Plan 02: historical_financials agent extension Summary

**Deep-dive agent now emits a `historical_financials` section (gross_margin/burn_rate/runway/acv) as honestly-labelled qualitative fields — no fabricated numeric P&L — via extended types, prompt/ANALYSIS_SHAPE, and a toLabelled-based normalizeSections branch, with the da325a4 retry+no-clobber hardening preserved byte-for-byte.**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T17:26:29Z
- **Completed:** 2026-07-02T17:32:16Z
- **Tasks:** 3
- **Files modified:** 4 (+1 planning artifact)

## Accomplishments
- `HistoricalFinancialsSection` type (four optional `LabelledField` members, no numeric P&L) + optional `historical_financials` key on `OverviewSections`; `AnalysisValuation` and the `AnalysisSections` alias untouched.
- Agent extended additively: `ANALYSIS_SHAPE` fragment near `unit_economics`, a `buildPrompt` bullet + a reinforced HARD RULE (no fabricated exact revenue/margin/P&L), and a `normalizeSections` grouped block that shapes each field via `toLabelled` (stripping stray numeric/probability keys) and drops an all-empty object.
- 4 new Vitest cases covering valid shaping, absence-degrades, stray-key stripping, empty-object drop, and non-object ignore — all 34 deep-dive tests green.
- `scripts/regen-deep-dive.ts` prints which `historical_financials` sub-fields were produced (sorted, `/`-joined) or `(none)`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add HistoricalFinancialsSection to the types** - `24c31f7` (feat)
2. **Task 2: Extend prompt + ANALYSIS_SHAPE + normalizeSections** - `721935b` (feat)
3. **Task 3: Unit-test normalization + extend regen print (tdd)** - `1d7d1d2` (test)

_Note: Task 3 was `tdd="true"`. The normalize branch it exercises was implemented in Task 2, so the RED/GREEN cycle collapsed to a single `test(...)` commit — the tests validate the already-landed additive branch (no separate feat commit was warranted for Task 3)._

## Files Created/Modified
- `lib/agents/deep-dive-types.ts` - Added `HistoricalFinancialsSection` (gross_margin/burn_rate/runway/acv optional LabelledFields) + optional `historical_financials` key on `OverviewSections`.
- `lib/agents/deep-dive.ts` - ANALYSIS_SHAPE fragment, prompt bullet + HARD RULE, `normalizeSections` grouped block for `historical_financials`.
- `lib/agents/deep-dive.test.ts` - New `describe("normalizeSections — historical_financials")` block (4 cases).
- `scripts/regen-deep-dive.ts` - Operator print line reporting which historical_financials sub-fields landed.
- `.planning/phases/05-valuation-targets-tab/deferred-items.md` - Logged a pre-existing regen-script eslint disable-directive issue (out of scope).

## Decisions Made
- historical_financials is LabelledFields-only by type design; the guardrail is enforced at three layers (type shape, prompt HARD RULE, `toLabelled` key-stripping in normalizeSections) — same defense-in-depth pattern as `outlook_and_exit`.
- The normalize branch was placed immediately after the single labelled-field `put(...)` group (after `outlook_and_exit`) and before `market_opportunity`, matching the type's logical position after `unit_economics`.

## Deviations from Plan

None - plan executed exactly as written. (Rules 1–4 not triggered; no auto-fixes.)

## Issues Encountered
- `npx eslint scripts/regen-deep-dive.ts` reports "Definition for rule '@typescript-eslint/no-explicit-any' was not found" on line 49. Verified via `git show HEAD:...` that this `eslint-disable-next-line` directive is **pre-existing** (present before 05-02, on the unrelated `runDeepDive(sb as any, ...)` line) — out of scope per the SCOPE BOUNDARY rule. Logged to `deferred-items.md`, not fixed. All in-scope files (`lib/agents/deep-dive{,-types,.test}.ts`) are eslint-clean and tsc-clean; all 34 deep-dive tests pass.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- The data side of VAL-01 is ready: `runDeepDive` now stores a `historical_financials` section future renders can consume.
- 05-03 (the Valuation Targets client tab) can render the margins/burn/runway/ACV fields with the shared ConfidenceChip, alongside the comps table from 05-01.

## Self-Check: PASSED

All modified files exist on disk; all three task commits (`24c31f7`, `721935b`, `1d7d1d2`) are present in the git log.

---
*Phase: 05-valuation-targets-tab*
*Completed: 2026-07-02*
