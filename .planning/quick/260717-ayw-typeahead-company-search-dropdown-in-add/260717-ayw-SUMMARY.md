---
phase: 260717-ayw
plan: 01
subsystem: company-entry
tags: [typeahead, akta, private-only, add-company, ui]
requires:
  - lib/connectors/akta.ts (PUBLIC_MARKET_STATUSES, pickPrimaryCompanyHit, aktaGet)
  - app/(app)/companies/actions.ts (requireUser, ActionResult)
  - components/company/add-company-dialog.tsx
provides:
  - searchAktaCompanies + toPrivateSuggestions + CompanySuggestion + exported AktaSearchHit
  - searchCompaniesAction server action
  - CompanyTypeahead client component
affects:
  - Add Company flow (name field is now a live private-only typeahead)
tech-stack:
  added: []
  patterns: [debounced-server-action, stale-response-sequence-guard, pure-mapper-over-http-shell]
key-files:
  created:
    - components/company/company-typeahead.tsx
  modified:
    - lib/connectors/akta.ts
    - lib/connectors/akta.test.ts
    - app/(app)/companies/actions.ts
    - components/company/add-company-dialog.tsx
decisions:
  - Reused PUBLIC_MARKET_STATUSES for the typeahead exclusion (no new list)
  - No new dependencies — plain-div dropdown, no cmdk/downshift
  - Logo derived client-side from website (Clearbit + monogram); server never stores a logo URL
metrics:
  duration: ~15m
  completed: 2026-07-17
---

# Phase 260717-ayw Plan 01: Private-Only Company Search Typeahead Summary

Live private-only company-search typeahead in the Add Company flow: an
akta-backed debounced dropdown (logo + name + brief) that visually disambiguates
similarly-named entities and strictly excludes public-market companies, extending
the `pickPrimaryCompanyHit` guardrail to the UI entry point.

## What Was Built

- **Task 1 (TDD):** `lib/connectors/akta.ts` — exported `AktaSearchHit`, added
  `CompanySuggestion` type, `toPrivateSuggestions` pure mapper (list-returning
  sibling of `pickPrimaryCompanyHit`, reusing `PUBLIC_MARKET_STATUSES`, cap 8),
  and `searchAktaCompanies` HTTP fn (full array-guarded hit list, no filtering).
  7 new HTTP-free unit tests in `akta.test.ts`.
- **Task 2:** `searchCompaniesAction` in `app/(app)/companies/actions.ts` —
  auth-gated bridge from the server-only akta key to the client; trims + caps the
  query to 80 chars, returns `{ suggestions: [] }` below 2 chars, and degrades to
  empty on any akta failure (no error toast per keystroke).
- **Task 3:** `components/company/company-typeahead.tsx` (`"use client"`) —
  250ms debounce, `useRef` sequence stale-response guard, loading/results/empty
  states, Clearbit-logo rows with monogram fallback, full keyboard nav
  (Down/Up/Enter/Escape), outside-click/blur close. Wired into
  `add-company-dialog.tsx` replacing the raw name Input; `handlePickSuggestion`
  fills name/website/sector and marks them user-set so re-enrichment never
  clobbers a pick. The existing `enrichCompany` debounce effect is untouched.

## Deviations from Plan

**Base-commit correction (pre-execution):** The worktree spawned at `96b7c2e`,
which predates commit `1e1f92f` (the `PUBLIC_MARKET_STATUSES` / `pickPrimaryCompanyHit`
guardrail the plan builds on) and the plan file itself. Per the worktree branch
check, reset `--hard` to the designated base `43116636`, which contains both. No
code deviation — this was the prescribed setup step.

**Minor UI adjustment (Task 3):** The dialog's "enriching…" badge was moved from
`right-2.5` (overlapping the typeahead's right-aligned search spinner) to
`-bottom-4 left-0` so the two loading indicators never collide. Cosmetic;
behavior-preserving.

Otherwise the plan executed as written.

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- `npm run test` — 390 passed (35 files), including 7 new `toPrivateSuggestions` cases

## TDD Gate Compliance

- RED: `test(260717-ayw): add failing tests for toPrivateSuggestions...` (5b32fc5) — 7 tests failing
- GREEN: `feat(260717-ayw): export akta private-only search mapper + HTTP fn` (9a9f3fa) — all green
- No separate REFACTOR commit needed.

## Commits

- 5b32fc5 test(260717-ayw): add failing tests for toPrivateSuggestions private-only mapper
- 9a9f3fa feat(260717-ayw): export akta private-only search mapper + HTTP fn
- c6335f7 feat(260717-ayw): add searchCompaniesAction server action
- 25440d5 feat(260717-ayw): CompanyTypeahead dropdown wired into Add Company dialog

## Self-Check: PASSED

- components/company/company-typeahead.tsx — FOUND
- lib/connectors/akta.ts (toPrivateSuggestions, searchAktaCompanies) — FOUND
- app/(app)/companies/actions.ts (searchCompaniesAction) — FOUND
- Commits 5b32fc5, 9a9f3fa, c6335f7, 25440d5 — all present in git log
