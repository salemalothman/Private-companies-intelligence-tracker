---
phase: 01-foundation
plan: 02
subsystem: agents
tags: [agent, grok, xai, comps, valuation, tdd, vitest, supabase, rls]

requires:
  - company_analysis table + AnalysisSections/AnalysisValuation contracts (01-01)
  - buildCanonicalRecord (lib/canonical.ts), buildCompetitorRanking (lib/competitors/rank.ts)
  - Grok structured-call pattern (lib/connectors/grok.ts)
provides:
  - runDeepDive(supabase, company) — the single Grok deep-dive agent (lib/agents/deep-dive.ts)
  - computePeerMultiple / deriveBaseRevenue — pure, code-computed comps inputs
  - one upserted company_analysis row per company (sections + valuation JSONB)
affects: [01-04, overview-enrichment, competitors-enrichment, valuation-targets]

tech-stack:
  added: []
  patterns:
    - "Agent signature: supabase client is first arg → runs identically under RLS user session or service-role"
    - "Comps inputs computed in code (SEC-verified peer percentiles + base revenue); LLM numbers confined to valuation.growth"
    - "Grok call degrades to an empty timestamped analysis (try/catch) rather than throwing — matches connector convention"
    - "server-only module made unit-testable via a Vitest alias stub (test/stubs/server-only.ts)"

key-files:
  created:
    - lib/agents/deep-dive.ts
    - lib/agents/deep-dive.test.ts
    - test/stubs/server-only.ts
  modified:
    - lib/agents/deep-dive-types.ts
    - vitest.config.ts

key-decisions:
  - "Percentile method: R-7 / Excel PERCENTILE.INC linear interpolation (documented in code); over [2,4,6,8] → p25=3.5, median=5, p75=6.5"
  - "AnalysisValuation.base_revenue.value widened to number|null so unknown revenue is honestly null, never a fabricated 0"
  - "server-only aliased to a no-op test stub in vitest.config.ts so the agent's pure helpers stay unit-testable without weakening the app-build guard"

requirements-completed: [FND-02, FND-03]

metrics:
  duration: ~11min
  completed: 2026-07-02
  tasks: 2
  files: 5
---

# Phase 1 Plan 01-02: runDeepDive Grok Agent Summary

**`runDeepDive(supabase, company)` gathers the in-app grounding (canonical record, competitor ranking + multiples, funding/valuation history, news), makes exactly one structured Grok (`grok-4.3` + `x_search`) call for the narrative `sections` and a growth-RATE proposal, computes the comps inputs (SEC-verified peer-multiple percentiles + base revenue + current valuation) deterministically in code, and upserts one `company_analysis` row per company — the LLM's numbers live only inside `valuation.growth`.**

## Performance

- **Duration:** ~11 min
- **Completed:** 2026-07-02
- **Tasks:** 2 (both TDD: RED → GREEN)
- **Files:** 5 (3 created, 2 modified)

## Accomplishments

- **Task 1 — pure comps math (tested):** `computePeerMultiple` (R-7 linear-interpolation median/p25/p75 over SEC-verified peers with finite V/R multiples; all-null when none qualify; `n_peers`/`n_sec_verified` counts) and `deriveBaseRevenue` (canonical revenue value + its as-of observation source). 5 Vitest assertions cover the median/p25/p75 math, the SEC-verified + null-multiple exclusions, the zero-verified null case, and the base-revenue derivation.
- **Task 2 — the agent:** `runDeepDive` gathers grounding via the passed supabase client (reusing existing competitor sync rows — no Phase-0 re-discovery), makes one `generateText` + `x_search` structured call with a balanced-JSON extractor + zod `safeParse` + try/catch degrade, assembles `AnalysisValuation` with code-computed comps and LLM-only `growth`, and upserts on `company_id` with a fresh `generated_at`.

## Task Commits

1. **Task 1 (RED):** `e4b4c2a` (test) — failing tests + server-only test stub + vitest alias
2. **Task 1 (GREEN):** `ef70cd1` (feat) — comps percentile + base-revenue helpers; contract widened to number|null
3. **Task 2 (GREEN):** `661f093` (feat) — runDeepDive agent (gather → one Grok call → code comps → upsert)
4. **Docs:** `c5dd591` (docs) — deferred-items log for pre-existing refresh.ts lint error

## Files Created/Modified

- `lib/agents/deep-dive.ts` — `runDeepDive` + pure `computePeerMultiple` / `deriveBaseRevenue` (server-only first line)
- `lib/agents/deep-dive.test.ts` — Vitest coverage of the comps math + anti-fabrication guard (5 assertions)
- `test/stubs/server-only.ts` — no-op stub aliased under Vitest so server-only modules are testable
- `lib/agents/deep-dive-types.ts` — `base_revenue.value` widened to `number | null`
- `vitest.config.ts` — `server-only` alias to the test stub

## Decisions Made

- **Percentile method:** R-7 / Excel `PERCENTILE.INC` linear interpolation (the plan gave Claude's discretion; documented in code). Over `[2,4,6,8]` this yields p25=3.5, median=5, p75=6.5 — the test expectations and the doc comment were aligned to the chosen method.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `server-only` broke the Vitest import of the agent module**
- **Found during:** Task 1 (RED). The plan mandates `import "server-only";` as the agent's first line AND that the pure helpers in the same module be unit-tested. `server-only` throws under plain-Node Vitest, so the test suite failed to import.
- **Fix:** Aliased `server-only` → `test/stubs/server-only.ts` (no-op) in `vitest.config.ts`. This keeps the helpers in `deep-dive.ts` as the plan requires while making them testable, without weakening the guard in the real Next.js build. (This is the standard Next.js testing approach; existing tested modules previously side-stepped `server-only` by living in separate pure files — not an option here.)
- **Files modified:** `vitest.config.ts`, `test/stubs/server-only.ts`
- **Commit:** `e4b4c2a`

**2. [Rule 1 - Anti-fabrication correctness] `base_revenue.value` type forced a fabricated 0**
- **Found during:** Task 1 (GREEN). Plan 01's frozen `AnalysisValuation.base_revenue.value` was typed `number`, but this plan's guardrail requires null when revenue is unknown. A `number`-only type would force a fabricated `0`, violating the no-fabricated-financials guardrail.
- **Fix:** Widened `base_revenue.value` to `number | null` in `lib/agents/deep-dive-types.ts` with a comment. `company_analysis` is JSONB so no migration is needed; this is a type-contract widening, not a schema change.
- **Files modified:** `lib/agents/deep-dive-types.ts`
- **Commit:** `ef70cd1`

### Plan-checker nits absorbed
- Derived base-revenue source from `revenue.observations.find(o => o.date === asOf)?.source ?? null` (no top-level `.source` on `CanonicalField`; null-safe).
- Lint gate folded into Task 2 verification.

## Issues Encountered

**Pre-existing, out-of-scope lint failure (deferred, NOT fixed):** `next lint` errors on `lib/agents/refresh.ts:34` (`@typescript-eslint/no-explicit-any` rule undefined — the config lacks that plugin). `refresh.ts` was introduced by commit `88415bb` and is not in this plan's file set; this plan's own files lint clean in isolation. Logged to `.planning/phases/01-foundation/deferred-items.md`.

## TDD Gate Compliance

Both tasks followed RED → GREEN. Task 1 has a `test(...)` RED commit (`e4b4c2a`, 4 failing assertions) before its `feat(...)` GREEN commit (`ef70cd1`). Task 2's behavior (Grok orchestration + upsert) is I/O-bound wrapper logic verified by the plan's tsc + grep gates + the still-green Task 1 suite; the pure, test-critical math it depends on was RED/GREEN-gated in Task 1. No REFACTOR commit was needed.

## Threat-Model Compliance

- **T-01-04 (comps tampering):** percentiles + base revenue computed in code from SEC-verified peers only; LLM numbers confined to `growth`; enforced by `secVerified` grep gate (7 hits) + unit tests + prompt guard. ✓
- **T-01-05 (injection):** all values written via parameterized `.upsert(obj)`, never string-concatenated SQL; zod `safeParse` gates parsed JSON. ✓
- **T-01-06 (XAI_API_KEY disclosure):** `import "server-only";` first line. ✓
- **T-01-07 (wrong-owner writes):** upsert routes through the passed RLS client; `user_id` set from the owning company. ✓
- No new threat surface beyond the register.

## Next Phase Readiness

- The generation engine is live: `runDeepDive` produces one grounded, honestly-labelled `company_analysis` row. Plan `01-04` can now wire the "Run deep-dive" header button + server action to invoke it; Phases 2–4 read the stored `sections` / `valuation` slices.

## Self-Check: PASSED

- Files exist: `lib/agents/deep-dive.ts`, `lib/agents/deep-dive.test.ts`, `test/stubs/server-only.ts` — all FOUND.
- Commits exist: `e4b4c2a`, `ef70cd1`, `661f093`, `c5dd591` — all FOUND in git log.
- Gates: `tsc` clean; `generateObject`==0; `onConflict`>=1; `buildCompetitorRanking`/`buildCanonicalRecord` present; `secVerified` gate present; anti-fabrication prompt guard present; 5/5 Vitest green; plan files lint clean.

---
*Phase: 01-foundation*
*Completed: 2026-07-02*
