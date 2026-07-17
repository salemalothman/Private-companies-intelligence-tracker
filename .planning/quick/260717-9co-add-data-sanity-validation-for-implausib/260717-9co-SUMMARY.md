---
phase: 260717-9co
plan: 01
subsystem: enrichment + company-header UI
tags: [data-integrity, timeline-validation, progress-ux, tdd]
requires:
  - lib/enrichment/timeline-validation.ts (existing rejectionReasons / isTrustedSource)
  - lib/format-remaining.ts (new pure helper)
  - components/company/progress-countdown.tsx (new client component)
provides:
  - "pdf:/url: prefix source trust"
  - "SPIKE_MULTIPLE upward-outlier guard (write-time + sweep)"
  - "formatRemaining(ms) pure time formatter"
  - "ProgressCountdown + recordObservedDuration"
affects:
  - components/company/sync-button.tsx
  - components/company/deep-dive-button.tsx
tech-stack:
  added: []
  patterns: [pure-function-core, tdd-red-green, ssr-guarded-localStorage]
key-files:
  created:
    - lib/format-remaining.ts
    - lib/format-remaining.test.ts
    - components/company/progress-countdown.tsx
  modified:
    - lib/enrichment/timeline-validation.ts
    - lib/enrichment/timeline-validation.test.ts
    - components/company/sync-button.tsx
    - components/company/deep-dive-button.tsx
decisions:
  - "Spike guard lives inside the untrusted branch of the shared rejectionReasons — trust always wins, so a trusted publisher's high mark is never stripped."
  - "Comparison pool is trusted-preferred (trustedRefs if any, else all other dated entries); an empty pool pushes no reason, so a lone untrusted value is never fabricated into a rejection."
  - "Placed the pdf:/url: prefix short-circuit immediately before the domain regex so the generic/manual/aggregate/SEC guards above it are untouched."
  - "Countdown is decorative (aria-hidden) — the buttons already carry role=progressbar / busy semantics, so it avoids double-announcing."
metrics:
  duration: ~15m
  completed: 2026-07-17
---

# Phase 260717-9co Plan 01: Data-sanity validation + progress countdown Summary

Hardened `timeline-validation` so a fabricated untrusted outlier can never win
canonicalization (pdf/url document sources are now trusted by prefix, and an
untrusted valuation above 20x the highest known mark is stripped at write time
and in the sweep), and added a live, adaptive estimated-time-remaining countdown
under both the Sync and Deep-dive buttons.

## What was built

**Task 1 — timeline validation hardening (`lib/enrichment/timeline-validation.ts`)**
- `isTrustedSource` now short-circuits `pdf:`/`url:` prefixes to `true` (case-insensitive),
  fixing the Accrete incident where `pdf:Deal_Overview_-_Accrete_.pdf` was under-trusted
  because the `_.pdf` underscore defeats the domain regex.
- New `SPIKE_MULTIPLE = 20` upward-outlier guard added to the shared `rejectionReasons`
  via a third `otherRefs` parameter. Comparison pool is trusted-preferred; empty pool
  pushes nothing. The check sits inside the untrusted branch, so trusted entries are exempt.
- Wired `otherRefs` in both call sites: `validateTimeline` (sweep) builds every-other-dated-entry
  pool by identity exclusion; `filterIngestValuations` (write-time) passes all established dated entries.

**Task 2 — pure formatter + shared component**
- `lib/format-remaining.ts`: `formatRemaining(ms)` → `~Xm Ys left` / `~Ys left`, `wrapping up…` on non-positive.
- `components/company/progress-countdown.tsx`: `ProgressCountdown({ running, kind })` renders a
  determinate hairline bar + adaptive label while running and an honest wrapping-up shimmer on
  overrun; `recordObservedDuration(kind, ms)` is the SSR-guarded localStorage write seam
  (`pct:est:sync` / `pct:est:deep-dive`), clamped to a 30s–20m sane range.

**Task 3 — button wiring (`sync-button.tsx`, `deep-dive-button.tsx`)**
- Both buttons capture `startRef` before the transition and call `recordObservedDuration`
  on success only, then render `<ProgressCountdown running={pending} kind=… />` stacked under
  the existing action row (`flex flex-col gap-1`). All prior pending/done/error/staged-label
  behavior preserved.

## Deviations from Plan

None — plan executed exactly as written.

## Threat model

- **T-9co-01 (Tampering)** mitigated: SPIKE_MULTIPLE guard applied at write time and in the sweep.
- **T-9co-02 (Spoofing)** mitigated: pdf:/url: prefix trust restores legitimate deck-source verification.
- **T-9co-03 (Info disclosure)** accepted as planned: `pct:est:*` holds non-sensitive per-browser UX timing only.

No new threat surface introduced. No new packages installed.

## Known Stubs

None. The countdown reads/writes real observed durations; the validator guard is live in both paths.

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (no ESLint warnings or errors)
- `npm run test` — 378 passed (35 files), including 14 timeline + 4 formatRemaining tests
- Behavior-preserving: no DB rows or migrations touched; buttons retain all existing states.

## TDD Gate Compliance

Both TDD tasks followed RED → GREEN:
- Task 1: `test(260717-9co)` 394b78c (RED) → `feat(260717-9co)` b2a7f60 (GREEN)
- Task 2 helper: `test(260717-9co)` f2e7f63 (RED) → `feat(260717-9co)` f9e2e7c (GREEN)

## Commits

- 394b78c test(260717-9co): failing tests for pdf/url trust + spike guard
- b2a7f60 feat(260717-9co): pdf/url prefix trust + upward-outlier spike guard
- f2e7f63 test(260717-9co): failing tests for formatRemaining time helper
- f9e2e7c feat(260717-9co): pure formatRemaining time helper
- 6431113 feat(260717-9co): shared ProgressCountdown component + duration recorder
- 04c4ce5 feat(260717-9co): wire ProgressCountdown into Sync + Deep-dive buttons

## Self-Check: PASSED

- lib/format-remaining.ts — FOUND
- components/company/progress-countdown.tsx — FOUND
- All 6 commits present in git log
