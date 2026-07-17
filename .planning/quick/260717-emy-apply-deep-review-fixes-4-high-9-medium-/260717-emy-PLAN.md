---
task: 260717-emy
description: Apply all 25 deep-review findings (4H/9M/11L introduced + 1 pre-existing) — behavior-preserving fixes, verified by adversarial review
mode: quick
tasks: 3
---

# Plan: Apply deep-review fixes (batch d268678..HEAD review)

Every finding below passed Gate 1 (verbatim quote check) and Gate 2 (adversarial
verification). Fixes must be behavior-preserving except where the finding IS the
behavior bug. Gates after each task: `npx tsc --noEmit`, `npm run lint`,
`npm run test` — all green.

## Task 1 — Typeahead + Add Company dialog (correctness, a11y, UX)

Files: `components/company/company-typeahead.tsx`, `components/company/add-company-dialog.tsx`, `lib/utils.ts`, `lib/enrichment/enrich.ts`

1. **[H] Escape wipes form**: the typeahead's Escape handler cannot win — Radix
   `useEscapeKeydown` listens on the document CAPTURE phase and dismisses unless
   `event.defaultPrevented`. Fix at the dialog: expose the dropdown-open state
   from CompanyTypeahead (e.g. `onOpenStateChange` callback or a forwarded ref),
   and in add-company-dialog's `<DialogContent onEscapeKeyDown={...}>` call
   `e.preventDefault()` + close the dropdown when it is open. Second Escape then
   closes the dialog normally.
2. **[H] Combobox ARIA**: full WAI-ARIA combobox wiring — Input gets
   `role="combobox"`, `aria-expanded`, `aria-controls="<listbox id>"`,
   `aria-autocomplete="list"`, `aria-activedescendant` (only when activeIndex>=0);
   `<ul>` gets a stable id + `aria-label`; each option element (put role/option +
   `aria-selected` + `id={company-opt-${i}}` on the interactive element itself,
   not a wrapping li around a button).
3. **[M] Enter replacement**: Enter picks ONLY when `activeIndex >= 0`; with
   activeIndex -1, close the dropdown and leave the typed value untouched (no
   suggestions[0] fallback).
4. **[M] Stale in-flight search**: bump `seq.current` in the `q.length < 2`
   branch AND in `pick()` so late responses are discarded; never `setOpen(true)`
   from a stale commit.
5. **[L] Re-open after pick**: record the picked name in a ref; the `[value]`
   search effect early-returns (no fetch, no open) when `value` equals the last
   picked name. Clear the ref on user edit.
6. **[L] Client query cache**: small `Map<string, CompanySuggestion[]>` keyed by
   trimmed lowercase query, checked before scheduling the debounce; serve hits
   instantly. Cap ~50 entries (drop oldest) to bound memory.
7. **[L] Dead class**: remove `touch-action-manipulation` (global button rule in
   globals.css already applies touch-action).
8. **[L] hostname helper 4th copy**: add ONE client-safe exported helper in
   `lib/utils.ts` (e.g. `hostFromWebsite(raw): string | null` — protocol-default,
   `new URL`, strip `www.`, null on failure). Use it in company-typeahead.tsx,
   add-company-dialog.tsx (replacing its inline `domainFromUrl`), and
   lib/enrichment/enrich.ts (`domainOf`). Do NOT touch sanitize-sources.ts (its
   normalizer has different semantics — leave with a pointer comment only if
   trivially safe, else skip).
9. **[M] Enriching badge overlap**: remove the `absolute -bottom-4` badge; render
   the enriching state inline in the existing helper `<p>` (swap the Sparkles
   icon for the spinner + "enriching…" text while enrichment is pending).

## Task 2 — Long-running action buttons (a11y + DRY)

Files: `components/company/sync-button.tsx`, `components/company/deep-dive-button.tsx`, new `components/company/use-timed-action.ts` (or shared wrapper component — executor's choice, kebab-case)

1. **[L→shared] Extract the duplicated scaffolding**: one shared hook/component
   owning startRef timing + `recordObservedDuration` on success only, done/error
   state, done-timer WITH unmount cleanup, and the `<ProgressCountdown>` footer
   row. SyncButton and DeepDiveButton keep only action, kind, icon, labels.
2. **[M] Sync AT feedback**: via the shared piece, BOTH buttons get
   `role="status"` + `aria-live="polite"` + `aria-busy={pending}` on the label.
3. **[pre-existing] role="progressbar"** on deep-dive-button's label span:
   replace with the shared `role="status"` treatment (no aria-value* needed).
   ProgressCountdown stays aria-hidden — the status label now genuinely carries
   the semantics for both callers, making its comment true.

## Task 3 — Connector + pipeline hardening (perf, security, quality)

Files: `lib/connectors/akta.ts` (+test), `lib/canonical.ts` (+test), `lib/ingestion/dedupe.ts`, `lib/competitors/discover.ts` (+test), `app/(app)/companies/actions.ts`, `lib/agents/deep-dive.ts`, `lib/ingestion/apply.ts`, `lib/utils.ts`

1. **[H] resolveCompany memoization**: module-level `Map<string, Promise<AktaSearchHit | null>>`
   keyed `${privateOnly}:${query.trim().toLowerCase()}`; store the in-flight
   promise (dedupes concurrent callers); evict entry after ~5 min TTL (setTimeout
   unref'd or timestamp check on read — timestamp check preferred, no timers).
   On rejected promise, delete the entry so failures aren't cached.
2. **[H] akta rate limiting**: tiny module-level semaphore inside `aktaGet`
   (max 5 concurrent akta requests). On 429 specifically: wait ~1s and retry ONCE,
   then degrade to null as today. Keep never-throw. Unit-test the semaphore
   ordering logic if extracted pure; otherwise cover 429-retry via a small
   injectable fetch wrapper — if that requires heavy refactoring, document as
   accepted-untested I/O per house convention.
3. **[M] Parallelize discovery**: in discover.ts run the fetchCompetitors
   Promise.all AND the fetchValuationMetric Promise.all inside one outer
   `Promise.all` (no data dependency; per-call try/catch already isolates).
4. **[M] URL scheme guard (XSS)**: add `safeHttpUrl(raw: unknown): string | undefined`
   to `lib/utils.ts` (parse with `new URL`, allow only http:/https:, undefined
   otherwise). Apply in akta.ts `mapAktaNews` (url), `mapAktaProfile` (website),
   `normalizeDeepSearchArticles` (url), AND centrally in
   `lib/ingestion/apply.ts` news-insert path + orchestrator profilePatch website
   if trivially reachable (defense in depth — covers Grok/Exa too; keep
   behavior-preserving: valid http(s) URLs pass through byte-identical). Unit
   tests: javascript:, data:, vbscript:, protocol-relative, plain domain,
   valid https.
5. **[M] Shared isAktaSource predicate**: export strict
   `isAktaSource(source: string | null | undefined): boolean` (true when the
   trimmed lowercased source === "akta.pro" or starts with "akta.pro" or
   "akta:") — put it in lib/canonical.ts (already imported by the other sites or
   import from there). Replace ALL five loose checks: canonical.ts provider()
   early-return (keep returning "akta"), discover.ts:84, dedupe.ts:133/151/170.
   Keep the dedupe hooks (akta emits no rounds TODAY — add a one-line comment
   saying so). Tests: aktana.com and fakta.dk must NOT match; "akta.pro",
   "akta.pro:news" must match.
6. **[L] Throttle searchCompaniesAction**: in-memory per-user minimum interval
   (e.g. 300ms) + tiny TTL cache (30s, cap 100 entries) keyed on normalized
   query. Note in a comment this is per-isolate best-effort on Workers.
7. **[L] Deep-dive persist off critical path**: start `applyMappedIngest` WITHOUT
   awaiting before the Grok call (`const persistP = ...catch(e => console.error(...))`),
   await it after generation completes (before returning), preserving error
   isolation.
8. **[M] Dead code**: delete `resolveIndustryCodes`, `AktaIndustryHit`, and the
   `resolveIndustryCodes` describe block in akta.test.ts (verified zero
   production references).
9. **[M] Docstring + naming + pure extraction**: rewrite the fetchCompetitors
   JSDoc to the actual flow (resolve → target-news + comparison-query news →
   pool merge → free resolves → relevance filter; TWO billable news calls);
   rename `industryNewsData` → `comparisonNewsData`; extract the pool-merge
   (toArticles/takePool/7-3 split/merge/sort/cap) into a pure exported
   `mergeMentionPools(comparisonArticles, companyArticles, targetName, cap)`
   and unit-test: the 7/3 split, the crowd-out regression (9x-mention mega-caps
   in company pool must not evict a 1-mention comparison-pool peer), dedupe
   count-summing across pools.
10. **[L] Cleanups**: delete `const open = ...` + `void open;` in
    parseEstimateBand; fix `minMentions` interface doc to "(default 1 —
    frequency ranks, the category gate filters)"; fix discover.ts stale comment
    to say fetchCompetitors is hard-capped at TWO billable news calls.
11. **[L] Zod at section boundaries**: replace the `as AktaRawProfile/NewsItem/
    Financial/SearchHit` casts with lenient zod schemas (all fields optional,
    `.passthrough()`, `z.coerce.number()` for founded_year/similarity/numeric
    estimates) safeParsed at each `section()`/array boundary; parse failure →
    null/[] exactly as today. Existing tests must stay green unchanged (the
    schemas are lenient supersets); add one test: string founded_year "2019"
    coerces to 2019.

## Verification
- All gates green after each task; full suite at end.
- Post-fix re-review (orchestrator-run) on the fix diff.
- No DB/migrations; no new deps.
