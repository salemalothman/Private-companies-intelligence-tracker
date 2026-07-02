---
phase: 04-external-grounding-ingestion
plan: 04
subsystem: infra
tags: [ingestion, sec-edgar, xbrl, peer-financials, cik, cli]

requires:
  - phase: 04-external-grounding-ingestion (04-01)
    provides: peer_financials cache table + PeerFinancial types
  - phase: 04-external-grounding-ingestion (04-02)
    provides: SourceModule interface, parseEnvelope/runAgentCli/hasBinary/requireEnv
provides:
  - sec-edgar SourceModule (public-peer XBRL income facts + peer-revenue cross-section → peer_financials)
  - mapStatementResult / mapCrossSection pure XBRL mappers
affects: [04-06]

tech-stack:
  added: []
  patterns:
    - "Source module implements SourceModule; resolve public peers to CIK before pulling XBRL; private targets (no CIK) skipped, never fabricated"
    - "Idempotent upsert into peer_financials on (cik, fiscal_period); real XBRL figures nullable, never zeroed"

key-files:
  created:
    - lib/ingest/sec-edgar.ts
    - lib/ingest/sec-edgar.test.ts
  modified: []

key-decisions:
  - "Only competitors are candidate public peers; portfolio companies are private (no XBRL) and skipped+counted, not treated as errors"
  - "Canonical us-gaap:Revenues preferred over the contract-revenue tag; tags are never summed (no fabricated figures)"
  - "Missing us-gaap tag → null (never 0, never carried across periods); label-less periods and cik-less peers dropped"
  - "Preflight SEC_EDGAR_USER_AGENT + binary → clean skip if either missing (the CLI 403s without a contact user-agent)"

patterns-established:
  - "execFile array args (no shell) for all sec-edgar-pp-cli calls; SEC_EDGAR_USER_AGENT env-only, never logged"

requirements-completed: [ING-02, ING-06]

duration: ~15min
completed: 2026-07-02
---

# Phase 4 · Plan 04-04: sec-edgar Source Module Summary

**A sec-edgar `SourceModule` that resolves public competitors to a CIK, pulls their XBRL income-statement facts (revenue / net income / gross profit / operating income) plus a peer-revenue cross-section, and idempotently upserts source-tagged rows into `peer_financials` on the natural key `(cik, fiscal_period)` — private targets without XBRL are skipped, never fabricated.**

## Performance
- **Duration:** ~15 min
- **Completed:** 2026-07-02
- **Tasks:** 2 (TDD: RED → GREEN)
- **Files created:** 2

## Accomplishments
- `lib/ingest/sec-edgar.ts`: implements the `SourceModule` contract.
  - **Pure mappers (Vitest-tested, no network):**
    - `mapStatementResult(result, ctx)` — flattens a `facts statement --kind income` result into one `PeerFinancialInsert` per `fiscal_period`, reading each metric from the us-gaap tags present (canonical `us-gaap:Revenues` preferred, `RevenueFromContractWithCustomerExcludingAssessedTax` fallback, never summed). Missing tag → `null` (never 0, never carried); label-less periods dropped; empty → `[]`.
    - `mapCrossSection(result)` — pivots a `cross-section --tag us-gaap:Revenues` peer×period result into `(cik, fiscal_period)` rows; null revenue dropped (never zeroed); cik-less peers dropped.
  - **`ingestSecEdgar(admin, targets)` dispatch:** preflights `hasBinary("sec-edgar-pp-cli")` AND `SEC_EDGAR_USER_AGENT` (clean `"skipped"` if either missing); resolves each competitor to a CIK via `companies lookup` (no CIK ⇒ private target ⇒ skipped + counted, not an error); pulls income facts and upserts on `(cik, fiscal_period)` via the service-role client; a final `cross-section` over the resolved tickers backfills peer revenue. Per-target `try/catch` so one 403/429 skips a peer without aborting the run. `runSecEdgar` alias wired to `scripts/ingest-grounding.ts`.
- Real XBRL figures stay nullable (never fabricated); rows source-tagged (`source='sec-edgar'`, `source_url`, `fetched_at`); no `user_id` (shared authenticated-read reference table).

## Task Commits
1. **Task 1 + 2 (TDD GREEN): sec-edgar source module (mappers + dispatch) + tests** - `cd11b5f` (feat)

## Files Created/Modified
- `lib/ingest/sec-edgar.ts` - the source module (pure mappers + impure dispatch)
- `lib/ingest/sec-edgar.test.ts` - 10 tests (inline fixtures, mocked CLI output, no network)

## Verification
`npx vitest run lib/ingest/sec-edgar.test.ts` → 10/10 green · `npx tsc --noEmit` clean · `npx eslint lib/ingest/sec-edgar.ts` clean. No network in tests. Live ingestion NOT run (peer_financials push is a pending human checkpoint) — build + unit-test only, per guardrails.

## Deviations from Plan
**[Structural] Task 1 and Task 2 landed in a single `feat` commit rather than two.** The plan split the work into a TDD mapper task (Task 1) and a dispatch task (Task 2), but — mirroring the sibling `lib/ingest/company-goat.ts` — the pure mappers and the impure dispatch live in one unified module file (`lib/ingest/sec-edgar.ts`). The two are an indivisible unit at the file level, so a clean per-task commit split was not meaningful; both tasks were verified (10/10 tests, tsc + eslint clean) and committed together. No behavioral deviation from the plan.

Otherwise: none. Missing tags → `null` (never 0), label-less periods and cik-less peers dropped, empty → `[]`, canonical revenue tag preferred, private targets skipped, secret env-only — all per `<behavior>` and `<threat_model>`.

## Next Phase Readiness
- One source module remains (x-twitter 04-05), then runDeepDive integration (04-06) consumes `peer_financials` revenue for honest comps. The live ingestion run awaits the migration-0021 `supabase db push` (pending human checkpoint).

## Self-Check: PASSED
- FOUND: lib/ingest/sec-edgar.ts
- FOUND: lib/ingest/sec-edgar.test.ts
- FOUND: .planning/phases/04-external-grounding-ingestion/04-04-SUMMARY.md
- FOUND commit: cd11b5f

---
*Phase: 04-external-grounding-ingestion*
*Completed: 2026-07-02*
