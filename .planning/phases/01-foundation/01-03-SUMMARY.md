---
phase: 01-foundation
plan: 03
subsystem: ui-primitives
tags: [ui, badge, chip, empty-state, staleness, tdd, vitest, design-system]

requires:
  - Badge variant API (components/ui/badge.tsx)
  - LabelledField basis/confidence literals (lib/agents/deep-dive-types.ts, 01-01)
  - "Premium Minimal Flat" design tokens (.label-eyebrow, hairline border, muted/success tints)
provides:
  - ConfidenceChip — shared Fact/Estimate + Low/Med/High chip, server-safe (components/company/confidence-chip.tsx)
  - DeepDiveEmpty — compact "Run deep-dive" empty state with optional action slot
  - basisLabel/basisVariant/confidenceLabel/confidenceSteps — pure exported mapping helpers
  - isStale(generatedAt, latestDataChange) — pure "may be stale" hint helper (lib/analysis/staleness.ts)
affects: [01-04, overview-enrichment, competitors-enrichment, valuation-targets]

tech-stack:
  added: []
  patterns:
    - "Server-safe primitive: pure label/variant mapping helpers extracted + exported so a node-only Vitest env can unit-test them without rendering React"
    - "Chip composes on existing Badge variants (success tint = fact/affirmed, muted = estimate) — no new saturated color, design-system compliant"
    - "isStale defaults to NOT-stale on null/undefined/unparseable inputs so the UI errs toward a quiet state"
    - "DeepDiveEmpty exposes an action?: React.ReactNode slot so Plan 04 drops the trigger button in without coupling"

key-files:
  created:
    - lib/analysis/staleness.ts
    - lib/analysis/staleness.test.ts
    - components/company/confidence-chip.tsx
    - components/company/confidence-chip.test.ts
  modified: []

key-decisions:
  - "Confidence rendered as a 3-step filled-dot indicator + .label-eyebrow text label (distinct element per level); dot count comes from the pure confidenceSteps helper"
  - "File carries \"use client\" because DeepDiveEmpty renders a lucide Sparkles icon; ConfidenceChip itself stays hook-free and icon-prop-free so it remains usable from Server Components"
  - "Test written as .test.ts (not the plan's .test.tsx): Vitest include is **/*.test.ts and env is node-only, so a .test.tsx would never run — tested the extracted pure mapping helpers per the plan's own node-only fallback clause"

requirements-completed: [FND-05, FND-06]

metrics:
  duration: ~10min
  completed: 2026-07-02
  tasks: 2
  files: 4
---

# Phase 1 Plan 3: Confidence Chip + Empty-State + Staleness Summary

Shared honesty-labelling UI primitives (Fact/Estimate + Low/Med/High `ConfidenceChip` built on `Badge`, plus a compact `DeepDiveEmpty` CTA) and a pure, unit-tested `isStale` helper backing the "may be stale" hint — the leaf substrate every enriched area in Phases 2–4 consumes.

## What Was Built

### Task 1 — `lib/analysis/staleness.ts` (TDD)
- Pure `isStale(generatedAt, latestDataChange): boolean` that returns `true` only when both timestamps parse and `latestDataChange > generatedAt` (strictly after).
- Returns `false` for equal/earlier timestamps, `null`/`undefined` on either side (no analysis yet → empty state, not stale), and unparseable input.
- Accepts ISO strings and/or `Date`. Dependency-free; observational only (never mutates or regenerates).
- 7 Vitest assertions (`lib/analysis/staleness.test.ts`) cover all documented behaviors, including the required null-generatedAt = false case.

### Task 2 — `components/company/confidence-chip.tsx`
- `ConfidenceChip({ basis, confidence })` — a quiet Fact/Estimate `Badge` (`success` tint for fact, `muted` for estimate) plus a Low/Med/High 3-step filled-dot indicator with a `.label-eyebrow` text label and an `aria-label`/`title`. Hairline borders, reduced-opacity tints, no saturated brand default — matches `provenance.tsx` visual weight.
- Uses the exact `LabelledField` literals (`"med"`, not `"medium"`).
- `DeepDiveEmpty({ message?, action? })` — compact dashed-border empty state with a lucide `Sparkles` glyph and an optional `action` slot for Plan 04's trigger button.
- Pure exported helpers (`basisLabel`, `basisVariant`, `confidenceLabel`, `confidenceSteps`) keep `ConfidenceChip` free of hooks/icon props so it stays server-usable, and make the mapping unit-testable under node-only Vitest. 4 assertions cover the mappings and per-level distinctness.
- No `dangerouslySetInnerHTML` — LLM-derived strings render as React children only (T-01-08 mitigation).

## Verification

- `npx tsc --noEmit`: clean (no errors in the new files).
- `npm run lint` on own files (`staleness.ts`, `staleness.test.ts`, `confidence-chip.tsx`, `confidence-chip.test.ts`): clean.
- `npm run test`: full suite green — 22 files / 156 tests pass (was 145 before; +11 new: 7 staleness + 4 chip).
- Grep gates: `dangerouslySetInnerHTML` == 0; `ConfidenceChip` export == 1; `DeepDiveEmpty` exported; `@/components/ui/badge` imported.
- Behavior-preserving: no existing files modified; existing tabs' rendering untouched.

## TDD Gate Compliance

Task 1 followed RED → GREEN:
- RED: `test(01-03): add failing test for isStale staleness helper` (5bee3db) — failed on missing module.
- GREEN: `feat(01-03): implement pure isStale staleness helper` (ff82c60) — 7/7 pass.
- REFACTOR: none needed (implementation already minimal).

## Deviations from Plan

**1. [Rule 3 - Blocking] Test file named `.test.ts` instead of the plan's `.test.tsx`**
- **Found during:** Task 2 test authoring.
- **Issue:** `vitest.config.ts` has `include: ["**/*.test.ts"]` (not `.tsx`) and `environment: "node"`. A `components/company/confidence-chip.test.tsx` would neither be collected by Vitest nor be able to render React, so the plan's acceptance gate (`npm run test` green) could not be met with a `.tsx` test.
- **Fix:** Wrote `components/company/confidence-chip.test.ts` targeting the exported pure mapping helpers — exactly the node-only fallback the plan's Task 2 `<action>` authorizes ("if the repo's Vitest env is node-only and cannot render React, instead unit-test a pure label/variant-mapping helper you extract from the component and export").
- **Files:** components/company/confidence-chip.test.ts (created); confidence-chip.tsx exports the helpers.
- **Commit:** 3adcc7b

## Known Stubs

None. Both primitives are fully wired to their inputs; `DeepDiveEmpty`'s `action` slot is an intentional extension point for Plan 04 (documented, not a stub).

## Pre-existing Issue (not in scope)

The known undefined-eslint-rule error in `lib/agents/refresh.ts` was already logged as a deferred item in commit c5dd591 during Plan 02. Per guardrail, it was left untouched; own-file lint was run directly and is clean.

## Self-Check: PASSED

- FOUND: lib/analysis/staleness.ts
- FOUND: lib/analysis/staleness.test.ts
- FOUND: components/company/confidence-chip.tsx
- FOUND: components/company/confidence-chip.test.ts
- FOUND commit: 5bee3db (RED test)
- FOUND commit: ff82c60 (GREEN isStale)
- FOUND commit: 3adcc7b (ConfidenceChip + DeepDiveEmpty)
