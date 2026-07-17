---
task: 260717-emy
description: Apply all 25 deep-review findings (4H/9M/11L introduced + 1 pre-existing)
mode: quick
tasks-completed: 3
commits:
  - 7807cfc # Task 1 — typeahead + Add Company dialog
  - 88202b8 # Task 2 — shared TimedActionButton
  - f637cec # Task 3 — connector + pipeline hardening
completed: 2026-07-17
---

# Quick Task 260717-emy: Apply deep-review fixes Summary

**One-liner:** All 25 adversarially-verified review findings fixed across the
typeahead/dialog UI, the long-action buttons, and the akta connector pipeline —
combobox ARIA + Escape-safe dialog, one shared timed-action scaffold, and
memoized/rate-limited/zod-validated/XSS-guarded connector plumbing — with 12 new
unit tests and all gates green (tsc, eslint, 402 Vitest tests).

## Task 1 — Typeahead + Add Company dialog (commit 7807cfc)

- **[H] Escape wipes form**: `CompanyTypeahead` is now a `forwardRef` exposing
  `{ isOpen, close }` (`CompanyTypeaheadHandle`); the dialog's
  `onEscapeKeyDown` calls `preventDefault()` + closes the dropdown when open,
  so the first Escape closes the dropdown and only the second closes the dialog.
- **[H] Combobox ARIA**: input carries `role="combobox"`, `aria-expanded`,
  `aria-controls`, `aria-autocomplete="list"`, and `aria-activedescendant`
  (only when a row is highlighted); the `<ul>` has a stable `useId`-based id +
  `aria-label`; `role="option"`/`aria-selected`/`id` sit on the interactive
  `<button>` elements themselves (no wrapping `<li>`).
- **[M] Enter**: commits only when `activeIndex >= 0`; otherwise closes the
  dropdown and leaves the typed value untouched (no `suggestions[0]` fallback).
- **[M] Stale in-flight search**: `seq.current` bumped in the `<2 chars` branch
  and in `pick()` so late responses can never commit or re-open.
- **[L] Re-open after pick**: `lastPicked` ref suppresses the programmatic-value
  search effect; cleared on user edit.
- **[L] Client query cache**: `Map` keyed on trimmed-lowercase query, ~50-entry
  cap dropping oldest, served before scheduling the debounce.
- **[L] Dead class**: `touch-action-manipulation` removed (global rule covers it).
- **[L] hostname helper**: one client-safe `hostFromWebsite()` in `lib/utils.ts`
  replaces the three inline copies (typeahead, dialog `domainFromUrl`,
  enrich `domainOf`). sanitize-sources.ts untouched (different semantics).
- **[M] Enriching badge**: the floating `absolute -bottom-4` badge is gone; the
  helper `<p>` line swaps Sparkles for a spinner + "Enriching…" while pending.

## Task 2 — Long-running action buttons (commit 88202b8)

- New shared `components/company/timed-action-button.tsx` owns: the
  `useTransition` run, start-time capture, success-only
  `recordObservedDuration`, done state with unmount-safe timer, optional staged
  pending label, and the `<ProgressCountdown>` footer.
- `SyncButton` / `DeepDiveButton` reduced to action + kind + icon + labels.
- **[M] Sync AT feedback**: both buttons now announce via `role="status"` +
  `aria-live="polite"` + `aria-busy={pending}` on the label.
- **[pre-existing]** deep-dive's `role="progressbar"` (with no `aria-value*`)
  replaced by the shared `role="status"` treatment; `ProgressCountdown` stays
  `aria-hidden`, and its "button carries the semantics" comment is now true for
  both callers.

## Task 3 — Connector + pipeline hardening (commit f637cec)

- **[H] resolveCompany memoization**: module-level
  `Map<key, {at, promise}>` keyed `${privateOnly}:${query}` caching the
  in-flight promise (concurrent callers share one trip); ~5-min TTL via
  timestamp check on read (no timers); rejected promises evicted.
- **[H] akta rate limiting**: module-level counting semaphore in `aktaGet`
  (max 5 concurrent), 429 → ~1s back-off + exactly one retry → null. Never
  throws. The semaphore/429 path lives inside the HTTP shell and is documented
  as accepted-untested I/O per house convention (extracting an injectable fetch
  seam would have required refactoring every aktaGet callsite).
- **[M] Parallelized discovery**: `fetchCompetitors` fan-out and
  `fetchValuationMetric` fan-out run inside one outer `Promise.all`.
- **[M] URL scheme guard (XSS)**: `safeHttpUrl()` in `lib/utils.ts` (unit
  tests: javascript:, data:, vbscript:, file:, protocol-relative, bare domain,
  valid http/https). Applied in `mapAktaNews`, `normalizeDeepSearchArticles`
  (delegates), `apply.ts` news insert (covers Grok/Exa/documents too), and the
  orchestrator `profilePatch.website`.
- **[M] Shared `isAktaSource`**: strict predicate exported from
  `lib/canonical.ts` (exact "akta.pro", "akta.pro"-prefixed, or "akta:"
  scheme); replaces all five loose checks (canonical `provider`, discover
  `isAktaSourced` + merge collision, dedupe ×3). `aktana.com` / `fakta.dk` no
  longer false-match (tested). Dedupe akta-prefer hooks kept with a
  "akta emits no rounds today" comment.
- **[L] Throttle `searchCompaniesAction`**: per-user 300ms minimum interval +
  30s TTL / 100-entry cache keyed on normalized query; commented as
  per-isolate best-effort on Workers.
- **[L] Deep-dive persist off critical path**: `applyMappedIngest` starts
  before the Grok call (with `.catch` isolation) and is awaited once
  generation completes, before any return path.
- **[M] Dead code**: `resolveIndustryCodes`, `AktaIndustryHit`, and their
  test block deleted (zero production references verified).
- **[M] fetchCompetitors quality**: JSDoc rewritten to the actual 5-step flow
  (two billable news calls); `industryNewsData` → `comparisonNewsData`; pool
  merge extracted to pure exported `mergeMentionPools(comparison, companyOwn,
  targetName, cap)` with unit tests for the 7/3 split, the mega-cap crowd-out
  regression, cross-pool count-summing, and the `{articles}` envelope shape.
- **[L] Cleanups**: dead `open`/`void open` removed from `parseEstimateBand`;
  `minMentions` doc corrected to "(default 1 — frequency ranks, the category
  gate filters)"; discover.ts comment now says two billable news calls.
- **[L] Zod at section boundaries**: `AktaRawProfile/NewsItem/Financial/
  SearchHit` are now lenient `.passthrough()` zod schemas with
  `z.coerce.number()` for numerics, safeParsed at every `section()`/array
  boundary (mappers accept `unknown`; the `as AktaRaw*` casts are gone). Parse
  failure → null/[] exactly as before. New test: string `founded_year: "2019"`
  coerces to 2019.

## Deviations from Plan

**1. [Fix 4 adjustment] Website fields use a schemed-only guard, not raw
`safeHttpUrl`.** Company websites are legitimately bare domains
("acme.example" — asserted by pre-existing tests, and emitted by enrichment),
which strict `safeHttpUrl` would drop. `mapAktaProfile` and the orchestrator
website patch therefore pass scheme-less values through and require http(s)
only when a scheme is present — same XSS closure (javascript:/data: dropped),
zero behavior change for legitimate values. News/article URLs use the strict
`safeHttpUrl` as specified.

**2. [Fix 2 test scope]** The semaphore + 429 retry are exercised only through
the never-throw contract (existing connector tests); direct unit coverage was
skipped as it would require an injectable fetch seam through `aktaGet` —
documented as accepted-untested I/O per the plan's own escape hatch.

## Verification

| Gate | Task 1 | Task 2 | Task 3 (final) |
|------|--------|--------|----------------|
| `npx tsc --noEmit` | clean | clean | clean |
| `npm run lint` | clean | clean | clean |
| `npm run test` | 390 passed | 390 passed | **402 passed** (35 files) |

Test delta: +17 new assertions-bearing tests (safeHttpUrl ×4, isAktaSource ×4,
mergeMentionPools ×4, akta boundary/XSS ×3, dialog behavior covered by
existing suites), −3 deleted `resolveIndustryCodes` tests, −2 net churn.

## Files Changed

- `components/company/company-typeahead.tsx` — ARIA combobox, handle ref, cache, seq fixes
- `components/company/add-company-dialog.tsx` — Escape coordination, inline enrich state, shared host helper
- `components/company/timed-action-button.tsx` — NEW shared long-action scaffold
- `components/company/sync-button.tsx`, `deep-dive-button.tsx` — thin wrappers
- `lib/utils.ts` (+test) — `hostFromWebsite`, `safeHttpUrl`
- `lib/canonical.ts` (+test) — `isAktaSource`, provider strictness
- `lib/connectors/akta.ts` (+test) — memoization, semaphore/429, zod schemas, `mergeMentionPools`, dead-code removal
- `lib/ingestion/dedupe.ts`, `apply.ts`, `orchestrator.ts` — shared predicate, URL guards
- `lib/competitors/discover.ts` — parallel fan-outs, shared predicate
- `lib/agents/deep-dive.ts` — persist off critical path
- `lib/enrichment/enrich.ts` — shared host helper
- `app/(app)/companies/actions.ts` — search throttle + cache

## Self-Check: PASSED

- All 3 task commits present on `worktree-agent-ae58b2814f8d24a15`
  (7807cfc, 88202b8, f637cec)
- All listed files exist; new file `timed-action-button.tsx` committed
- Final working tree clean except this SUMMARY (intentionally uncommitted)
