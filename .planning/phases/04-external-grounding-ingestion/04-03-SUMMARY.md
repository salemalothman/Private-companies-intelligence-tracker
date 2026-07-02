---
phase: 04-external-grounding-ingestion
plan: 03
subsystem: infra
tags: [ingestion, company-goat, sec-form-d, cik, cli]

requires:
  - phase: 04-external-grounding-ingestion (04-01)
    provides: form_d_rounds cache table + types
  - phase: 04-external-grounding-ingestion (04-02)
    provides: SourceModule interface, parseEnvelope/resolveCik/runAgentCli
provides:
  - company-goat SourceModule (Form D rounds + signals with mandatory CIK disambiguation)
affects: [04-06]

tech-stack:
  added: []
  patterns:
    - "Source module implements SourceModule; mandatory CIK disambiguation before trusting Form D amounts"

key-files:
  created:
    - lib/ingest/company-goat.ts
    - lib/ingest/company-goat.test.ts
  modified:
    - lib/types.ts

key-decisions:
  - "Ambiguous company-goat results (is_ambiguous/cik_summaries) re-query funding --cik before any upsert; ambiguous name-fragment amounts are never cached"
  - "Idempotent upsert into form_d_rounds on (company_id, subject, accession); real figures nullable, source-tagged"

patterns-established:
  - "execFile array args (no shell) for all pp-cli calls; env-only secrets"

requirements-completed: [ING-03, ING-06]

duration: ~20min
completed: 2026-07-02
---

# Phase 4 · Plan 04-03: company-goat Source Module Summary

**A company-goat `SourceModule` that fetches SEC Form D rounds + startup signals per target, applies mandatory CIK disambiguation (no ambiguous name-fragment amounts), and idempotently upserts source-tagged rows into `form_d_rounds`.**

## Performance
- **Duration:** ~20 min (executor stalled on the stream watchdog after the work + commits landed, before writing this SUMMARY; finalized by orchestrator)
- **Completed:** 2026-07-02
- **Tasks:** 2 (TDD: RED → GREEN)
- **Files modified:** 3

## Accomplishments
- `lib/ingest/company-goat.ts` (358 lines): implements `SourceModule` — `funding`/`snapshot` fetch via `runAgentCli`, mandatory CIK disambiguation via `resolveCik` (re-queries `funding --cik` when ambiguous), maps Form D filings → `form_d_rounds` rows, idempotent upsert on `(company_id, subject, accession)`.
- Real figures nullable (never fabricated); rows source-tagged (`source='company-goat'`, `source_url`, `fetched_at`); owner-scoped.

## Task Commits
1. **Task 1 (RED): failing tests for funding mapper + CIK disambiguation** - `86ef15f` (test)
2. **Task 2 (GREEN): company-goat source module (mapper + dispatch)** - `27cc316` (feat)

## Files Created/Modified
- `lib/ingest/company-goat.ts` - the source module
- `lib/ingest/company-goat.test.ts` - 13 tests (mocked CLI output, no network)
- `lib/types.ts` - minor type touch

## Verification
`npx vitest run lib/ingest/company-goat.test.ts` → 13/13 green · `npx tsc --noEmit` clean · `npx eslint lib/ingest/company-goat.ts` clean. No network in tests.

## Deviations from Plan
None substantive. The executor stalled (stream watchdog, 600s) AFTER committing both TDD tasks but BEFORE writing this SUMMARY / advancing tracking — the orchestrator verified the committed work (13/13 tests, tsc+lint clean) and finalized.

## Next Phase Readiness
- Two more source modules remain (sec-edgar 04-04, x-twitter 04-05), then runDeepDive integration (04-06). The live ingestion run awaits the migration-0021 `supabase db push` (pending human checkpoint).

---
*Phase: 04-external-grounding-ingestion*
*Completed: 2026-07-02*
