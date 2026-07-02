---
phase: 05-valuation-targets-tab
plan: 01
subsystem: valuation
tags: [valuation, comps, pure-function, tdd]
requires:
  - "lib/agents/deep-dive-types.ts (AnalysisValuation — read-only input contract)"
provides:
  - "buildCompsTable — pure 2026–2030 comps table builder (only $ source in Phase 5)"
  - "clampGrowth — user-override growth bounds [-0.5, 3.0], non-finite → null"
  - "CompsInputs / CompsOverrides / CompsRow / ScenarioKey / MultiplePercentile types"
  - "COMPS_YEARS / BASE_YEAR / GROWTH_MIN / GROWTH_MAX consts"
affects:
  - "Wave-2 client Valuation Targets tab (recomputes this table live for VAL-04)"
tech-stack:
  added: []
  patterns:
    - "Pure-function core, thin I/O shell (matches lib/canonical.ts, lib/metrics.ts)"
    - "Null-honesty: null input → null cell, never a fabricated 0 (mirrors clampRating)"
    - "TDD RED → GREEN with atomic test/feat commits"
key-files:
  created:
    - "lib/valuation/comps.ts"
    - "lib/valuation/comps.test.ts"
  modified: []
decisions:
  - "CompsInputs = Pick<AnalysisValuation, base_revenue|peer_multiple|growth> so callers pass the stored row directly — no reshaping, no coupling to the full valuation shape"
  - "clampGrowth returns null (not a fabricated default) for absent/non-finite input, so callers distinguish 'no override' from a real rate — same honesty rule as clampRating"
  - "Growth override is a single lever collapsing all three scenarios; multiplePercentile override collapses all three multiples onto one percentile (VAL-04 semantics)"
  - "Module is isomorphic (no use client / server-only) so both the RSC page and the client tab import the identical math"
metrics:
  duration: ~2 min
  completed: 2026-07-02
  tasks: 2
  files: 2
---

# Phase 5 Plan 1: Pure Comps Math Module Summary

Pure, code-computed comps builder — `buildCompsTable` projects revenue × applied
peer multiple over 2026–2030 with Bear/Base/Bull → p25/median/p75, honest null
propagation, and `clampGrowth`-bounded user overrides — backed by 16 exhaustive
Vitest cases. It is the single deterministic source of every $ figure in Phase 5.

## What Was Built

- **`lib/valuation/comps.ts`** — `buildCompsTable(inputs, overrides?)` returns
  exactly 5 rows (2026–2030). For each `year`, `n = year − 2026` and each cell =
  `base_revenue × (1 + growth)^n × multiple`. Default mapping bear→p25,
  base→median, bull→p75, each with its own growth rate. `clampGrowth` bounds
  overrides to `[GROWTH_MIN, GROWTH_MAX] = [-0.5, 3.0]` and returns `null` for
  non-finite/absent input. Exports the `CompsInputs / CompsOverrides / CompsRow /
  ScenarioKey / MultiplePercentile` types + `COMPS_YEARS / BASE_YEAR /
  GROWTH_MIN / GROWTH_MAX` consts.
- **`lib/valuation/comps.test.ts`** — 16 cases across 6 describes: COMPS_YEARS
  shape, exact math (240e6 × 14.5 = 3.48e9; 2027 compounding 5.046e9; 2030
  bear/base/bull), scenario→percentile mapping (swapping only p75 moves bull
  alone), null propagation (null base_revenue → all null; null median → only base
  null; strictly `null`, never `0`), clampGrowth bounds/non-finite, and overrides
  (single growth lever recomputes all columns; multiplePercentile collapses all
  columns; out-of-range override clamped).

## Deviations from Plan

None — plan executed exactly as written. No auto-fixes, no checkpoints, no
authentication gates.

## Verification

- `npx vitest run lib/valuation/comps.test.ts` — 16/16 green.
- `npx tsc --noEmit` — clean.
- `npx eslint lib/valuation/comps.ts lib/valuation/comps.test.ts` — clean.
- `git diff --exit-code lib/agents/deep-dive-types.ts lib/agents/deep-dive.ts` —
  both UNCHANGED (read-only contract + sibling-owned file untouched).

## TDD Gate Compliance

- RED: `test(05-01)` commit `607c15e` — suite failed only because the module did
  not yet exist.
- GREEN: `feat(05-01)` commit `a96c0fe` — all 16 cases pass, tsc + eslint clean.
- REFACTOR: none needed — the GREEN implementation was already allocation-light
  and side-effect-free.

## Known Stubs

None. This is a complete, self-contained pure module; the Wave-2 tab wires its
output to the UI.

## Threat Flags

None. The two mitigations in the plan's threat register are implemented and
unit-tested: T-05-01 (null base_revenue/multiple → null cell, never 0) and
T-05-02 (`clampGrowth` bounds override to [-0.5, 3.0]; non-finite → null). No new
security surface — no I/O, no secrets, no PII (T-05-03 accept).

## Self-Check: PASSED

- FOUND: lib/valuation/comps.ts
- FOUND: lib/valuation/comps.test.ts
- FOUND commit: 607c15e (test)
- FOUND commit: a96c0fe (feat)
