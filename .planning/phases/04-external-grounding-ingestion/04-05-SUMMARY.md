---
phase: 04-external-grounding-ingestion
plan: 05
subsystem: api
tags: [x-twitter, ingestion, supabase, source-module, vitest, execFile]

# Dependency graph
requires:
  - phase: 04-external-grounding-ingestion (Plan 01)
    provides: x_posts table + XPostRow/XPostInsert types (migration 0021)
  - phase: 04-external-grounding-ingestion (Plan 02)
    provides: runAgentCli / parseEnvelope / hasBinary / requireEnv (lib/ingest/cli.ts), IngestTarget / SourceSummary / SourceModule (lib/ingest/types.ts)
provides:
  - x-twitter SourceModule (ingestXTwitter / runXTwitter) — opt-in on X_BEARER_TOKEN, doctor-gated, read-only tweet sync
  - pure appOnlyLaneReady doctor-lane gate + mapTweetsResult mapper
  - idempotent upsert into x_posts on (company_id, post_id), owner-scoped
affects: [04-06-deep-dive-integration, news-tab, sentiment-agent]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SourceModule: pure mapper + doctor-lane gate (no server-only) + impure dispatch in one file, mirroring company-goat.ts / sec-edgar.ts"
    - "Read-only invariant enforced by a type-level subcommand allowlist (READ_SUBCOMMANDS) that builds every runAgentCli call"
    - "Opt-in secret gate: requireEnv(X_BEARER_TOKEN) → clean skip; token passed via child env only, never logged"

key-files:
  created:
    - lib/ingest/x-twitter.ts
    - lib/ingest/x-twitter.test.ts
  modified:
    - lib/types.ts

key-decisions:
  - "Omit `import server-only`: this file's pure helpers are loaded by Vitest in plain Node, where server-only throws — same rationale used by company-goat.ts and sec-edgar.ts. Off-app/ boundary kept by convention (only the local script imports it)."
  - "Read-only enforced structurally: a type-level READ_SUBCOMMANDS allowlist (doctor/sync/recent-search) is the only way to build a CLI call; no post/reply/quote/like string exists in the module."
  - "handle is the envelope-level subject handle (null when absent); the per-tweet author is a separate column and is never used as a handle fallback."
  - "Bounded --since window (14d): X bills reads per-use, so a short fixed window caps paid-read cost per run."

patterns-established:
  - "Pattern: type-constrained subcommand allowlist as a compile-time read-only guarantee for a CLI source module."

requirements-completed: [ING-04, ING-06]

# Metrics
duration: 6min
completed: 2026-07-02
---

# Phase 4 Plan 05: x-twitter Source Module Summary

**Opt-in, doctor-gated x-twitter SourceModule that syncs company + competitor posts read-only via the app-only bearer lane and idempotently caches them in `x_posts` on (company_id, post_id).**

## Performance

- **Duration:** 6 min
- **Started:** 2026-07-02T14:47:23Z
- **Completed:** 2026-07-02T14:53:14Z
- **Tasks:** 2
- **Files modified:** 3 (2 created, 1 modified)

## Accomplishments
- `appOnlyLaneReady(doctorResult)` — pure gate on `auth_lanes.app_only_api.status !== "missing"`; false for missing/absent-lane/non-object results.
- `mapTweetsResult(result, target)` — pure mapper to `XPostInsert[]`; `post_id` required (rows without it dropped — natural-key anchor never fabricated), absent fields → null, owner-scoped + source-tagged, tolerates bare-array / `{tweets}` / `{posts}` / `{results}` shapes.
- `ingestXTwitter` SourceModule — three-stage preflight (X_BEARER_TOKEN → binary → doctor app-only lane), per-target read-only `sync --resources tweets --since 14d`, idempotent upsert on `(company_id, post_id)` with `user_id` from the target, per-target try/catch, never throws out of the loop.
- Read-only invariant enforced by a type-level `READ_SUBCOMMANDS` allowlist — no write subcommand exists anywhere in the file; bearer token env-only, never logged.
- 11 unit tests (mocked CLI envelopes, no network) green; full ingest suite (62 tests) green; tsc + eslint clean.

## Task Commits

Each task was committed atomically:

1. **Task 1: Pure tweets mapper + doctor-lane gate with unit tests** - `0128710` (feat)
2. **Task 2: ingestXTwitter SourceModule — preflight, sync, upsert** - `83852d6` (feat)

_Note: Task 1 is a `tdd="true"` task; RED (failing test — module absent) was confirmed before GREEN, then test + impl committed together as the single plan-defined task._

## Files Created/Modified
- `lib/ingest/x-twitter.ts` - x-twitter SourceModule: pure `appOnlyLaneReady` + `mapTweetsResult`, impure `ingestXTwitter` dispatch (opt-in, doctor-gated, read-only sync, idempotent x_posts upsert), `runXTwitter` alias.
- `lib/ingest/x-twitter.test.ts` - unit tests for the doctor gate (ready/missing/absent/non-object) and the mapper (normal, envelope handle, missing id, bare fields → null, empty, bare array, numeric id).
- `lib/types.ts` - exported `XPostInsert` (was declared without `export`, only referenced inside the `Database` Insert map).

## Decisions Made
- **No `import "server-only"`:** the pure helpers must load under Vitest in plain Node; `server-only` throws outside a React-Server bundle. This matches the existing sibling modules (company-goat.ts, sec-edgar.ts). The off-app/ boundary is preserved by convention — only `scripts/ingest-grounding.ts` imports the module.
- **Structural read-only guarantee:** every CLI call is built from a member of the type-level `READ_SUBCOMMANDS` (`doctor`/`sync`/`recent-search`) allowlist, so no post/reply/quote/like invocation can be constructed. Verified by grep — only `doctor` and `sync` are ever invoked.
- **`handle` semantics:** mapped from the envelope-level subject handle (null when absent); the per-tweet `author` is a distinct column and is not used as a handle fallback.
- **Bounded `--since 14d` window:** caps paid-read cost per run (X bills reads per-use).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported `XPostInsert` from lib/types.ts**
- **Found during:** Task 1 (mapper implementation)
- **Issue:** The plan's `<interfaces>` and read_first direct importing `XPostInsert` from `lib/types.ts`, but it was declared `type XPostInsert = { ... }` without `export` (only referenced inside the `Database` Insert map). The module could not import it.
- **Fix:** Added `export` to the `XPostInsert` declaration — additive, mirrors the exported `XPostRow` directly above it. (sec-edgar.ts sidestepped the same gap by deriving its insert type locally from the Row; exporting is the cleaner fit here since the Row/Insert pair is already the convention.)
- **Files modified:** lib/types.ts
- **Verification:** tsc clean; import resolves; vitest green.
- **Committed in:** `0128710` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** The single deviation is a one-line export required to satisfy the plan's own import contract. No scope creep; no behavior change to existing code.

## Issues Encountered
- During GREEN, one test (`handle` on a bare tweets array) initially failed because the mapper fell back to per-tweet `author` for `handle`. Resolved by making `handle` strictly the envelope-level subject handle (author is a separate column) — the more correct semantic, matching the schema's distinct `handle` / `author` columns.

## Threat Model Compliance
All four mitigations from the plan's STRIDE register are implemented:
- **T-04-15 (secret disclosure):** `requireEnv("X_BEARER_TOKEN")`; passed via child env to execFile only; never logged; absent → clean skip.
- **T-04-16 (write privilege):** type-level `READ_SUBCOMMANDS` allowlist builds every call; no post/reply/quote/like string in the file.
- **T-04-17 (DoS/cost):** opt-in on token presence + doctor preflight + bounded `--since 14d` + per-target try/catch.
- **T-04-18 (service-role upsert):** `user_id` set from `target.userId`; parameterized upsert on `(company_id, post_id)`.

No new security surface introduced beyond the plan's threat model.

## User Setup Required
None for build/test. For a live run (out of scope here — deferred to the pending `x_posts` push checkpoint): set `X_BEARER_TOKEN` in the local/cron env; without it the source is skipped cleanly. A live read costs X API credits and was intentionally NOT executed.

## Next Phase Readiness
- x_posts cache is now populated read-only + idempotently; ready for Plan 06 (`runDeepDive` grounding) to cite recent X news and for the News tab + sentiment agent.
- No blockers. The live-sync + `x_posts` DB push remains a pending human checkpoint (paid read + migration apply), consistent with the Phase 4 plan.

## Self-Check: PASSED

- FOUND: lib/ingest/x-twitter.ts
- FOUND: lib/ingest/x-twitter.test.ts
- FOUND: .planning/phases/04-external-grounding-ingestion/04-05-SUMMARY.md
- FOUND commit: 0128710 (Task 1)
- FOUND commit: 83852d6 (Task 2)

---
*Phase: 04-external-grounding-ingestion*
*Completed: 2026-07-02*
