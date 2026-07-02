---
phase: 04-external-grounding-ingestion
plan: 06
subsystem: deep-dive-agent
tags: [grounding, deep-dive, grok, source-attribution, ING-05]
requires: ["04-01", "04-03", "04-04", "04-05"]
provides: "runDeepDive grounds on the three ingested caches with real source attribution"
affects: [lib/agents/deep-dive.ts, lib/agents/deep-dive.test.ts]
tech-stack:
  added: []
  patterns:
    - "Pure source-attributed serialization helper (summarizeCachedGrounding) — no I/O, unit-tested"
    - "Concurrent second-stage cache reads (Promise.all) after peer identifiers are known"
    - "Degrade-not-throw: null/error cache reads coalesce to [] so empty caches add no grounding"
key-files:
  created: []
  modified:
    - lib/agents/deep-dive.ts
    - lib/agents/deep-dive.test.ts
decisions:
  - "peer_financials matched to peers by entity_name (case-insensitive set of ranked peer names) because CompetitorRow/RankedEntity carry neither cik nor ticker"
  - "Cached facts capped at 8 items per source (CACHED_GROUNDING_CAP) to protect the already-large structured completion from truncation"
  - "buildPrompt guard EXTENDED (not replaced): a fact carrying a real source tag → basis:fact + tag in source; untagged claims → estimate"
  - "The da325a4 hardening (retry-once + no-clobber upsert guard) preserved verbatim; only the grounding-gather + prompt string were extended"
metrics:
  duration: ~15min
  completed: 2026-07-02
---

# Phase 4 Plan 06: runDeepDive Cached-Grounding Integration Summary

Extended `runDeepDive`'s grounding gather to read the three ingested caches
(`form_d_rounds`, `peer_financials`, `x_posts`) and fold their real,
source-attributed facts into the Grok prompt, so generated fields can cite Form D
/ SEC XBRL / X sources instead of the LLM alone — closing the ING-05 loop as the
final plan of the phase.

## What Was Built

**Task 1 — `summarizeCachedGrounding` pure helper + tests (commit `e540938`)**
- New exported pure function `summarizeCachedGrounding({ formD, peerFin, posts })`
  in `lib/agents/deep-dive.ts`. Renders one compact line per real cached fact,
  each prefixed with its true source tag: `Form D (SEC, source: company-goat)`,
  `Peer XBRL (SEC, source: sec-edgar)`, `X post (source: x-twitter)`.
- Contracts: missing numerics render as `?` (never fabricated); an empty source
  array omits its whole section (no empty headers); all-empty returns `""`; peer
  XBRL lines always carry `fiscal_period`; each source capped at 8 items.
- Added a `describe("summarizeCachedGrounding")` block to the existing
  `lib/agents/deep-dive.test.ts` (the plan assumed a fresh test file; the file
  already existed with the hardening tests, so the coverage was appended):
  all-three, mixed-empty, all-empty, and missing-numeric cases.

**Task 2 — Wire the three cache reads into `runDeepDive` + prompt (commit `ffc2b51`)**
- Step 1b: a second `Promise.all` reads `form_d_rounds` and `x_posts` by
  `company_id` (RLS owner-scopes these to the current user), and `peer_financials`
  by the ranked peers' `entity_name` (shared reference data). Every read coalesces
  `null`/error `data` to `[]` — empty caches simply add no grounding, so
  `runDeepDive` behaves exactly as before when the tables are empty (they
  currently are).
- The `summarizeCachedGrounding` output is appended to the in-app grounding block
  under a `CACHED SOURCE-TAGGED FACTS:` header before being passed to `buildPrompt`.
- `buildPrompt`'s HARD RULES guard gained a `SOURCE ATTRIBUTION` paragraph:
  reinforcing (not replacing) the no-fabrication rules, it instructs the model to
  set `basis:"fact"` and carry the tag in `source` for tagged facts, and to label
  anything untagged as an `"estimate"`.
- Extended the hand-rolled Supabase test fake with `in`/`order`/`limit` so the
  preserved persistence-guard tests still drive the (now longer) read chain.

## Guardrails Preserved

- **da325a4 hardening intact**: `MAX_ATTEMPTS = 2` retry loop and the
  `Object.keys(sections).length === 0` no-clobber upsert guard are byte-for-byte
  unchanged (verified by grep). A transient LLM hiccup still cannot overwrite a
  good stored analysis.
- **Comps stay code-computed**: `computePeerMultiple(ranking)` +
  `deriveBaseRevenue(canonical)` and the `AnalysisValuation` shape are untouched;
  the LLM still proposes only growth RATES.
- **No fabricated data**: cached facts are REAL and rendered verbatim-or-`?`;
  `summarizeCachedGrounding` is pure and unit-tested for the missing-numeric case.
- **Upsert unchanged**: `onConflict: "company_id"`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Extended the Supabase test fake for the new read chain**
- **Found during:** Task 2 (full vitest run)
- **Issue:** The new `x_posts` read chains `.order().limit()` and `peer_financials`
  chains `.in()`; the existing hand-rolled Supabase fake in the persistence-guard
  tests only implemented `select/eq/maybeSingle/upsert/then`, so 4 preserved
  hardening tests threw `.order is not a function`.
- **Fix:** Added `in`/`order`/`limit` to the fake's builder (all return the
  thenable builder, resolving reads to `{ data: [] }` — which also exercises the
  empty-cache degrade path).
- **Files modified:** `lib/agents/deep-dive.test.ts`
- **Commit:** `ffc2b51`

**2. [Plan assumption correction] Test file already existed**
- The plan said "Create `lib/agents/deep-dive.test.ts` ... (the file currently has
  no test)". The file already existed (with the da325a4 hardening tests). Coverage
  for `summarizeCachedGrounding` was appended rather than creating a new file, and
  the hardening tests were preserved.

**3. [Plan interface adjustment] peer_financials matched by entity_name, not cik/ticker**
- The plan's interface suggested `.in("cik", peerCiks)` OR `.in("ticker", peerTickers)`.
  Neither `CompetitorRow` nor `RankedEntity` carries a `cik`/`ticker` column, so
  peers were matched by `entity_name` against the set of ranked peer names — the
  only identifier the peers actually carry. When there are no peer names the
  `peer_financials` read is skipped gracefully with an empty array.

## Threat Mitigations Applied

- **T-04-19 (fabrication):** `buildPrompt` guard extended to require source
  attribution; comps stay code-computed. Mitigated.
- **T-04-20 (info disclosure):** `form_d_rounds`/`x_posts` read under the RLS user
  client scoped by `company_id`; `peer_financials` is public reference data.
  Mitigated.
- **T-04-21 (tampering):** `summarizeCachedGrounding` renders real values or `?`,
  unit-tested. Mitigated.

## Verification

- `npx tsc --noEmit` — clean.
- `npx eslint lib/agents/deep-dive.ts` — clean.
- `npx vitest run` — 232 passed (26 files), including the 4 new
  `summarizeCachedGrounding` tests and the 4 preserved persistence-guard tests.
- Per guardrail: no live regen was run (requires a real Grok call); the
  orchestrator performs live validation.

## Known Stubs

None — the caches are currently empty by design (not yet populated by the
ingestion script runs), which is the intended graceful-degrade path, not a stub.
`runDeepDive` works identically with empty caches.

## Self-Check: PASSED

- FOUND: lib/agents/deep-dive.ts
- FOUND: lib/agents/deep-dive.test.ts
- FOUND: .planning/phases/04-external-grounding-ingestion/04-06-SUMMARY.md
- FOUND commit: e540938 (Task 1)
- FOUND commit: ffc2b51 (Task 2)
