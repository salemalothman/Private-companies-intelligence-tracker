---
phase: 04-external-grounding-ingestion
plan: 01
subsystem: storage
tags: [supabase, migration, rls, typed-client, grounding-cache]
status: awaiting-checkpoint
requires: []
provides:
  - "peer_financials cache table (sec-edgar XBRL income facts)"
  - "form_d_rounds cache table (company-goat Form D rounds + signals)"
  - "x_posts cache table (x-twitter posts)"
  - "PeerFinancialRow / FormDRoundRow / XPostRow exported types"
affects:
  - "downstream ingestion Plans 03/04/05 (upsert targets)"
  - "runDeepDive grounding gather Plan 06 (read source)"
tech-stack:
  added: []
  patterns:
    - "owner-scoped RLS (auth.uid()=user_id) mirroring company_analysis"
    - "authenticated-read shared-reference RLS mirroring market_valuations"
    - "source-tagged idempotent upsert via natural-key unique()"
key-files:
  created:
    - supabase/migrations/0021_grounding_cache.sql
  modified:
    - lib/types.ts
decisions:
  - "peer_financials has no user_id (public SEC reference data, authenticated-read only)"
  - "form_d_rounds / x_posts are owner-scoped with all_own RLS policies"
  - "natural keys: peer_financials (cik,fiscal_period); form_d_rounds (company_id,subject,accession); x_posts (company_id,post_id)"
  - "factual numeric columns left nullable, never zero-defaulted (data-integrity guardrail)"
metrics:
  duration: ~10m
  completed: 2026-07-02
  tasks_completed: 2
  tasks_total: 3
  files: 2
---

# Phase 4 Plan 01: Grounding Cache Schema Summary

Added three source-tagged Supabase cache tables — `peer_financials` (sec-edgar
XBRL income facts, authenticated-read reference data), `form_d_rounds`
(company-goat Form D rounds + signals, owner-scoped) and `x_posts` (x-twitter
posts, owner-scoped) — in migration `0021_grounding_cache.sql`, and registered
their Row/Insert types in the hand-maintained typed client `lib/types.ts`. This
is the idempotent, source-tagged storage substrate every downstream ingestion
module upserts into and that `runDeepDive` reads.

## What Was Built

### Task 1 — Migration 0021_grounding_cache.sql (commit 9648f8f)
- `peer_financials`: `id, cik, ticker, entity_name, fiscal_period, revenue,
  net_income, gross_profit, operating_income, currency, source, source_url,
  fetched_at, created_at, updated_at`. `unique (cik, fiscal_period)`, index on
  `cik`. RLS enabled; `peer_financials_read` = `for select using (auth.role() =
  'authenticated')` (mirrors `market_valuations_read`). No `user_id` — shared
  public reference data.
- `form_d_rounds`: `company_id` FK + `user_id default auth.uid()` FK, `subject,
  cik, accession, offering_amount, amount_sold, filing_date, exemption,
  related_persons jsonb, signals jsonb, source, source_url, fetched_at, …`.
  `unique (company_id, subject, accession)`, index on `company_id`. RLS +
  `form_d_rounds_all_own` (`for all using/with check auth.uid()=user_id`,
  mirrors `company_analysis_all_own`).
- `x_posts`: `company_id` FK + `user_id default auth.uid()` FK, `subject, handle,
  post_id, text, author, posted_at, url, metrics jsonb, source, fetched_at, …`.
  `unique (company_id, post_id)`, index on `company_id`. RLS + `x_posts_all_own`
  identical to `form_d_rounds_all_own`.
- Idempotent: `create table if not exists` + `drop policy if exists` before
  every `create policy`. Factual numeric columns left nullable (no zero
  defaults), honoring the no-fabricated-data guardrail.

### Task 2 — lib/types.ts registration (commit d5e8a5f)
- Authored `PeerFinancialRow`/`PeerFinancialInsert`,
  `FormDRoundRow`/`FormDRoundInsert`, `XPostRow`/`XPostInsert` following the
  `MarketValuationRow`/`Insert` convention. Row types exported for downstream
  imports.
- Column types match the migration one-to-one: `numeric → number | null`,
  NOT-NULL `text → string`, nullable `text → string | null`, `date/timestamptz →
  string`, `jsonb` → `unknown[]` (related_persons) / `Record<string, unknown>`
  (signals, metrics).
- Insert nullability mirrors defaults: `id`, `source`, `user_id`, `fetched_at`,
  `updated_at` optional; required-on-insert = `cik`+`fiscal_period`
  (peer_financials), `company_id`+`subject`+`accession` (form_d_rounds),
  `company_id`+`subject`+`post_id` (x_posts).
- Registered all three in `Database.public.Tables` with the 3-line
  `Row/Insert/Update` + `Relationships: []` pattern.

## Verification

- Task 1 automated verify: `grep … create table if not exists public.(…)` → **3** ✔
- Task 2 automated verify: `npx tsc --noEmit` clean ✔; `grep -Ec
  "peer_financials:|form_d_rounds:|x_posts:" lib/types.ts` → **3** ✔
- `npx next lint --file lib/types.ts` → No ESLint warnings or errors ✔

## Deviations from Plan

None — plan executed exactly as written.

## Threat Model Compliance

- T-04-01 (EoP): `form_d_rounds` / `x_posts` use owner-scoped `all_own` RLS
  policies; `peer_financials` is authenticated-read reference data with no PII. ✔
- T-04-02 (Info Disclosure): `peer_financials_read` authenticated-read is
  intentional shared reference (public SEC data). ✔
- T-04-03 (Tampering): JSONB columns typed as `unknown[]`/`Record<string,
  unknown>`; parameterized-upsert enforcement deferred to writers (Plans 03-05). ✔
- T-04-SC: no package installs in this plan. ✔

## Checkpoint Status — BLOCKING

Task 3 is a `checkpoint:human-verify` (`gate="blocking-human"`): the migration
must be applied to the live DB via `supabase db push`, run by the human (NOT the
executor). Execution paused here. Code tasks 1-2 are complete and committed.

**Must-haves NOT yet true until the push completes:**
- The three tables existing in the live Supabase DB (requires the push).
- The typed client resolving the tables against the live schema (types compile
  now; live resolution confirmed post-push).

## Known Stubs

None.

## Self-Check: PASSED

- supabase/migrations/0021_grounding_cache.sql — FOUND
- lib/types.ts — FOUND
- .planning/phases/04-external-grounding-ingestion/04-01-SUMMARY.md — FOUND
- commit 9648f8f (migration) — FOUND
- commit d5e8a5f (types) — FOUND
