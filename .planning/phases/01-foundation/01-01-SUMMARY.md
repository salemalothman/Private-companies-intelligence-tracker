---
phase: 01-foundation
plan: 01
subsystem: database
tags: [supabase, postgres, rls, jsonb, typescript, migration]

requires: []
provides:
  - company_analysis table (one JSONB row per company: sections + valuation) with owner-only RLS
  - AnalysisSections / AnalysisValuation TypeScript contracts (lib/agents/deep-dive-types.ts)
  - company_analysis registered in the hand-maintained lib/types.ts Database interface
  - getCompanyAnalysis(id) reader in lib/queries.ts
affects: [01-02, 01-03, 01-04, overview-enrichment, competitors-enrichment, valuation-targets]

tech-stack:
  added: []
  patterns:
    - "Per-company analysis storage: unique(company_id) row upserted by the deep-dive agent"
    - "Owner-only RLS via user_id default auth.uid(), mirroring the competitors table"

key-files:
  created:
    - supabase/migrations/0020_company_analysis.sql
    - lib/agents/deep-dive-types.ts
  modified:
    - lib/types.ts
    - lib/queries.ts

key-decisions:
  - "unique(company_id) drives the one-row-per-company upsert"
  - "user_id NOT NULL default auth.uid() + FK to auth.users; RLS FOR ALL using/with-check auth.uid()=user_id"
  - "JSONB sections/valuation default '{}' so a row is always shape-safe before first generation"

patterns-established:
  - "Analysis JSONB contracts live in lib/agents/deep-dive-types.ts, consumed by producer (agent) and consumers (chip/tabs)"
  - "Idempotent migration (create table if not exists, drop policy if exists) — safe re-run"

requirements-completed: [FND-01]

duration: ~5min
completed: 2026-07-02
---

# Phase 1 · Plan 01-01: Analysis Storage Summary

**`company_analysis` table (owner-only RLS, one JSONB row per company holding `sections` + `valuation`) plus the `AnalysisSections`/`AnalysisValuation` type contracts, `lib/types.ts` registration, and a `getCompanyAnalysis` reader.**

## Performance

- **Duration:** ~5 min (code) + human DB-push checkpoint
- **Completed:** 2026-07-02
- **Tasks:** 3 (2 code, 1 human-verify checkpoint)
- **Files modified:** 4

## Accomplishments
- New `company_analysis` table with all 9 columns, `unique(company_id)`, cascade FKs, and owner-only RLS mirroring `competitors`.
- Migration applied to the live Supabase database and **verified via REST** (HTTP 200, all 9 columns queryable, table empty).
- `AnalysisSections` / `AnalysisValuation` TypeScript contracts defined once for producer + consumers.
- `company_analysis` registered in the hand-maintained `lib/types.ts`; `getCompanyAnalysis(id)` reader added.

## Task Commits

1. **Task 1: JSONB contracts + register company_analysis in lib/types.ts** - `c02f719` (feat)
2. **Task 2: company_analysis migration + getCompanyAnalysis reader** - `1f5e243` (feat)
3. **Task 3: [BLOCKING] apply migration to live DB** - human-verify checkpoint (applied by user; verified via REST API)

## Files Created/Modified
- `supabase/migrations/0020_company_analysis.sql` - table + index + RLS policy
- `lib/agents/deep-dive-types.ts` - `AnalysisSections` / `AnalysisValuation` contracts
- `lib/types.ts` - `company_analysis` Row/Insert/Update
- `lib/queries.ts` - `getCompanyAnalysis(id)` reader

## Decisions Made
None beyond plan — followed the plan and CONTEXT as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
The Supabase CLI was not linked; the user ran `supabase login` → `link` → `db push` to apply `0020`. Table existence then confirmed non-fabricated via a service-role REST query (HTTP 200 + empty result).

## User Setup Required
None ongoing — the one-time migration push is complete.

## Next Phase Readiness
- The storage substrate + type contracts are live. Wave 2 (`01-02` agent, `01-03` chip) can now build and verify against the real table.

---
*Phase: 01-foundation*
*Completed: 2026-07-02*
