---
phase: 01-foundation
verified: 2026-07-02T10:15:00Z
status: passed
score: 11/11 must-haves verified
overrides_applied: 0
---

# Phase 1: Foundation Verification Report

**Phase Goal:** A user can run one on-demand deep-dive per company that generates and stores a grounded, honestly-labelled analysis object, with the shared confidence-labelling primitive in place for every downstream tab to consume.

**Verified:** 2026-07-02
**Status:** PASSED
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Clicking "Run deep-dive" triggers generation (separate from Sync) with staged progress; re-run overwrites with updated timestamp | VERIFIED | `components/company/deep-dive-button.tsx` — `useTransition`, staged `STAGES = ["Gathering context…", "Analysing…"]`, rendered next to (not replacing) `<SyncButton />` in `app/(app)/companies/[id]/page.tsx:236-237`. `lib/agents/deep-dive.ts:317-327` upserts on `onConflict: "company_id"` with a fresh `generated_at: new Date().toISOString()` every call — re-run overwrites, never inserts a duplicate. |
| 2 | After a run, exactly one `company_analysis` row exists per company (JSONB `sections`+`valuation`, `generated_at`, `model`), owner-only via RLS | VERIFIED | `supabase/migrations/0020_company_analysis.sql` — `unique (company_id)` (line 18) enforces one row/company; RLS enabled (line 24) + `company_analysis_all_own` policy `using (auth.uid() = user_id) with check (auth.uid() = user_id)` (lines 26-28). Table + RLS already REST-verified live per orchestrator (taken as given, not re-queried in this pass per explicit scope instruction). |
| 3 | Stored analysis is grounded in existing in-app context; no fabricated financials, no invented probabilities | VERIFIED | `runDeepDive` (`lib/agents/deep-dive.ts:230-272`) gathers `competitors`, `market_valuations`, `buildCanonicalRecord`, `buildCompetitorRanking`, `company.funding_rounds`, `company.news` — all existing app data, no new discovery pass. Prompt (`buildPrompt`, lines 142-163) explicitly forbids "invent probabilities... assert price targets or exact valuation figures; fabricate revenue, margins, or P&L as fact... Numbers you emit appear ONLY inside 'growth'". |
| 4 | Comps inputs (peer-multiple percentiles, base revenue) computed in code; LLM supplies only growth proposal + rationale + confidence | VERIFIED | `computePeerMultiple` (deep-dive.ts:49-65) and `deriveBaseRevenue` (deep-dive.ts:73-80) are pure functions with zero LLM/network I/O, unit-tested in `deep-dive.test.ts` (5 assertions: median/p25/p75 over SEC-verified peers, exclusion of non-verified/null-multiple peers, all-null on zero SEC-verified peers, base-revenue null-safety). Zod schema (`analysisSchema`, lines 116-127) restricts LLM numeric output to `growth.{base,bear,bull,confidence,rationale}` only — `sections` values are `z.unknown()`, no numeric valuation fields accepted elsewhere. `base_revenue.value` is `number \| null` (never a fabricated 0). |
| 5 | Shared Fact/Estimate + Low/Med/High chip renders on labelled fields; compact "Run deep-dive" empty state before first run; "may be stale" hint when data changed after `generated_at` | VERIFIED | `ConfidenceChip` (`components/company/confidence-chip.tsx:58-92`) renders a `Badge` (Fact=`success` tint / Estimate=`muted`) + a 3-step dot confidence indicator using exact `"med"` (not `"medium"`) literal. `DeepDiveEmpty` (lines 98-119) is the compact CTA with an `action?` slot, wired into the page at line 261 (`<DeepDiveEmpty action={<DeepDiveButton .../>} />`) when `analysis` is null. `isStale` (`lib/analysis/staleness.ts:24-32`) is pure, tested (7 assertions), wired at page.tsx:118-120 comparing `analysis.generated_at` against the max of `valuations.created_at`/`competitors.updated_at ?? created_at`; renders a "May be stale" `Badge` at page.tsx:254-258. |

**Score:** 5/5 roadmap success criteria verified.

### Requirements Coverage (FND-01..06)

| Requirement | Source Plan | Description | Status | Evidence |
|---|---|---|---|---|
| FND-01 | 01-01 | `company_analysis` table, JSONB, RLS, `generated_at`/`model` | VERIFIED | Migration file + `lib/types.ts` Database registration (`company_analysis` at lines 537-540) + `getCompanyAnalysis` reader (`lib/queries.ts:159-174`). Note: REQUIREMENTS.md line 14 shows an unchecked `[ ]` checkbox for FND-01 while its own status table (line 96) says "Complete" — a documentation inconsistency, not a code gap (see Non-Blocking Notes). |
| FND-02 | 01-02 | Single Grok agent, one structured `sections` call from in-app grounding | VERIFIED | `runDeepDive` — one `generateText` call (deep-dive.ts:279-286), `generateObject` count = 0 (grep-confirmed), grounding gathered from existing tables only. |
| FND-03 | 01-02 | Comps computed in code; LLM supplies only growth | VERIFIED | `computePeerMultiple`/`deriveBaseRevenue` pure + tested; LLM schema confines numbers to `growth`. |
| FND-04 | 01-04 | On-demand header trigger, separate from Sync, staged progress, re-run overwrites | VERIFIED | `DeepDiveButton` + `runDeepDiveAction`; upsert keyed on `company_id`. |
| FND-05 | 01-03 | Fact/Estimate + Low/Med/High chip on labelled fields | VERIFIED | `ConfidenceChip` built on `Badge`, uses `LabelledField` literals exactly. |
| FND-06 | 01-03/01-04 | Empty-state CTA pre-generation + "may be stale" hint | VERIFIED | `DeepDiveEmpty` + `isStale`, both wired into `page.tsx`. |

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `supabase/migrations/0020_company_analysis.sql` | table + RLS | VERIFIED | `create table if not exists public.company_analysis` with all 9 columns, `unique(company_id)`, index, RLS enabled, owner-only policy. |
| `lib/agents/deep-dive-types.ts` | LabelledField/AnalysisSections/AnalysisValuation | VERIFIED | All three exported; `AnalysisValuation` matches spec §4 exactly incl. `peer_multiple.{median,p25,p75,n_peers,n_sec_verified}` and `growth.{base,bear,bull,confidence,rationale}`; `base_revenue.value: number \| null`. |
| `lib/types.ts` | company_analysis Row/Insert/Update in Database | VERIFIED | Lines 400-566: `CompanyAnalysisRow`/`Insert`, registered in `Database.public.Tables.company_analysis`, `CompanyAnalysis` alias. |
| `lib/queries.ts` (`getCompanyAnalysis`) | single-row reader | VERIFIED | `.from("company_analysis").select("*").eq("company_id", companyId).maybeSingle()`, error-logs-and-null pattern matching `getCompany`. |
| `lib/agents/deep-dive.ts` (`runDeepDive`) | agent, ≥60 lines | VERIFIED | 334 lines; gathers grounding, one Grok call, code comps, upsert. |
| `lib/agents/deep-dive.test.ts` | comps unit tests, ≥20 lines | VERIFIED | 109 lines, 5 assertions, all pass (`npm run test -- deep-dive` green). |
| `components/company/confidence-chip.tsx` | ConfidenceChip + DeepDiveEmpty, ≥30 lines | VERIFIED | 120 lines; both exported; no `dangerouslySetInnerHTML` (grep = 0). |
| `lib/analysis/staleness.ts` (`isStale`) | pure staleness helper | VERIFIED | 33 lines, pure, tested (7 assertions). |
| `app/(app)/companies/actions.ts` (`runDeepDiveAction`) | server action | VERIFIED | Uses `requireUser()`'s RLS client; no `createAdminClient` anywhere in file (grep = 0 hits). |
| `components/company/deep-dive-button.tsx` (`DeepDiveButton`) | client trigger, ≥30 lines | VERIFIED | 95 lines; `"use client"` first line; `useTransition` + `runDeepDiveAction`. |
| `app/(app)/companies/[id]/page.tsx` | header + empty/stale wiring | VERIFIED | Imports and renders `DeepDiveButton`, `DeepDiveEmpty`, `getCompanyAnalysis`, `isStale`; `SyncButton` still present (behavior-preserving). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `lib/types.ts` | `0020_company_analysis.sql` | hand-maintained Row/Insert mirror | WIRED | Columns match 1:1 (id, company_id, user_id, generated_at, model, sections, valuation, created_at, updated_at). |
| `lib/queries.ts` | `company_analysis` | typed `.from("company_analysis")` read | WIRED | `getCompanyAnalysis` confirmed. |
| `lib/agents/deep-dive.ts` | `lib/competitors/rank.ts` | `buildCompetitorRanking` | WIRED | Imported and called (line 6, 264). |
| `lib/agents/deep-dive.ts` | `company_analysis` | `.upsert(..., {onConflict:"company_id"})` | WIRED | Confirmed lines 317-327. |
| `lib/agents/deep-dive.ts` | `deep-dive-types.ts` | `AnalysisValuation`/`AnalysisSections` | WIRED | Imported and used to type the assembled object. |
| `deep-dive-button.tsx` | `actions.ts` | `runDeepDiveAction` in `useTransition` | WIRED | Confirmed line 55. |
| `actions.ts` | `deep-dive.ts` | `runDeepDive(supabase, company)` + `revalidatePath` | WIRED | Confirmed lines 217-219; `supabase` is `requireUser()`'s RLS client, not admin. |
| `page.tsx` | `deep-dive-button.tsx` | header action render | WIRED | Confirmed line 237 and empty-state action slot at line 261. |
| `confidence-chip.tsx` | `components/ui/badge.tsx` | `Badge` variant composition | WIRED | Imported line 5, used lines 70. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|---|---|---|---|---|
| `page.tsx` analysis block | `analysis` | `getCompanyAnalysis(id)` → real Supabase read (RLS) | Yes — reads live table, not static | FLOWING |
| `page.tsx` stale hint | `analysisStale` | `isStale(analysis.generated_at, latestDataChange)` where `latestDataChange` is derived from `company.valuations`/`competitors` already loaded via `getCompany`/`getCompetitors` | Yes — computed from real page data, not hardcoded | FLOWING |
| `deep-dive.ts` valuation object | `peer_multiple`/`base_revenue` | `buildCompetitorRanking` + `buildCanonicalRecord` fed by live `competitors`/`market_valuations` Supabase queries | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| TypeScript compiles across the whole repo | `npx tsc --noEmit` | Clean, no errors | PASS |
| Full unit suite green | `npm run test` | 22 files / 156 tests passed | PASS |
| Repo-wide lint clean | `npm run lint` | "No ESLint warnings or errors" | PASS |
| Production build compiles + all routes generate | `npm run build` | "Compiled successfully", 11/11 static pages generated, exit 0 | PASS |
| Comps math unit tests isolate correctly | `npm run test -- deep-dive` (subset, included in full run) | 5/5 assertions pass | PASS |
| All summary-cited commits exist in history | `git cat-file -e <hash>` for 11 commits | All 11 found | PASS |

Note: `npm run build` now passes fully clean (exit 0), which is a stronger result than the SUMMARY claimed ("blocked only by pre-existing lint" at time of writing) — the pre-existing `lib/agents/refresh.ts` lint issue was independently fixed by a later, unrelated commit (`68887fa`, confirmed via `git log` to postdate and not overlap Phase 1's own commits).

Browser/runtime render of the button was not executed in this pass, per explicit scope instruction (RLS-gated dev session noted by the orchestrator as already investigated; live REST/DB re-verification was explicitly out of scope for this pass and was denied by the execution sandbox when attempted). Source-level wiring (imports, calls, conditional render branches) is directly verified above and is sufficient to confirm the button/page wiring is correct.

### Anti-Patterns Found

None. Scanned all phase-modified files (migration, deep-dive-types.ts, deep-dive.ts, deep-dive.test.ts, queries.ts, confidence-chip.tsx, confidence-chip.test.ts, staleness.ts, staleness.test.ts, actions.ts, deep-dive-button.tsx, page.tsx, types.ts) for `TBD|FIXME|XXX|TODO|HACK|PLACEHOLDER|placeholder|coming soon|not yet implemented|not available|dangerouslySetInnerHTML` — zero matches across every file.

### Guardrail Compliance (explicit checks requested by orchestrator)

| Guardrail | Status | Evidence |
|---|---|---|
| No fabricated financials / no invented probabilities | VERIFIED | LLM confined to `growth` numbers via zod schema; prompt hard-forbids price targets/probabilities/fabricated P&L; `base_revenue.value` is `number \| null`, never defaulted to 0. |
| Peer-multiple percentiles + base revenue computed in code from SEC-verified peers | VERIFIED | `computePeerMultiple` filters `secVerified === true` and finite `multiple`; unit-tested for the zero-verified null case. |
| `runDeepDiveAction` uses RLS user client, not admin | VERIFIED | `requireUser()` → `createClient()` (cookie-bound); zero `createAdminClient` references in `actions.ts`. |
| Confidence chip renders basis + confidence; no `dangerouslySetInnerHTML` | VERIFIED | `ConfidenceChip` renders both via React children; grep count of `dangerouslySetInnerHTML` = 0. |
| Existing tabs behavior-preserving | VERIFIED | Deep-dive UI is purely additive (new header button beside `SyncButton`, new status block between header and Key Stats card); no existing rendering blocks modified; full test suite (156/156) still green with no regressions. |

### Human Verification Required

None. All must-haves are verifiable via source, build, lint, and test evidence; no visual/runtime-only behavior was left unverifiable in a way that blocks passing this phase.

### Non-Blocking Notes

1. **REQUIREMENTS.md FND-01 checkbox is stale.** Line 14 shows `- [ ] **FND-01**...` (unchecked) while the requirements status table below (line 96) correctly lists it "Complete" and the code/table/RLS/reader are all present and verified. This is a documentation bookkeeping miss, not a functional gap — recommend checking the box in a follow-up doc-only commit.
2. **`confidence-chip.tsx` is a whole-file `"use client"` component**, not server-safe as the plan's interface notes aspired ("Keep ConfidenceChip free of hooks and lucide-icon props so it is usable from Server Components"). The SUMMARY documents this deviation directly (`DeepDiveEmpty`'s lucide icon forced the client boundary onto the whole file). `ConfidenceChip` itself has no hooks and no lucide props — it could be split into a server-safe file later if a downstream phase needs to render it from a pure Server Component without pulling in client JS, but nothing in Phase 1's own scope requires that split. Not a blocker for Phase 1's goal.
3. Live-DB REST re-verification (table existence + RLS enabled) was intentionally not repeated in this pass per the orchestrator's explicit instruction to take it as given; code-level evidence (migration content, hand-maintained types, working reader, full build/test/lint pass) independently corroborates the same conclusion.

---

*Verified: 2026-07-02*
*Verifier: Claude (gsd-verifier)*
