# Codebase Concerns

**Analysis Date:** 2026-07-02

## Tech Debt

**Single hardcoded entity-collision rule (`lib/enrichment/disambiguation.ts`):**
- Issue: `COLLISION_RULES` contains exactly one hand-written rule (private "Accrete Ai" vs. public Tokyo-listed "Accrete Inc." / TYO:4395), discovered because that specific collision was observed. There is no general mechanism to detect a portfolio company name colliding with an unrelated public ticker/entity — every future collision requires a new hardcoded regex.
- Files: `lib/enrichment/disambiguation.ts:23-30`
- Impact: as the portfolio grows, silent wrong-entity contamination (stock quotes, news about an unrelated public company) can leak into a private company's timeline undetected until a human notices, exactly as happened with Accrete.
- Fix approach: at minimum log a warning when `STOCK_SIGNAL` fires for a company not covered by an explicit rule, so new collisions surface for triage instead of silently failing open elsewhere; consider a lighter heuristic (e.g., ticker-symbol pattern + "NYSE/NASDAQ/TSE" co-occurrence) that doesn't require a named company match.

**No retry/backoff on any external API call:**
- Issue: `lib/connectors/grok.ts`, `lib/connectors/exa.ts`, `lib/connectors/sec-edgar.ts`, and `lib/enrichment/enrich.ts` (Anthropic calls) all call `fetch` once and either return `null`/`[]` or throw on non-OK responses. There is no 429/`Retry-After` handling, no exponential backoff, and no jitter anywhere in the codebase (`grep` for `retry|backoff|Retry-After` across `lib/connectors` and `lib/agents` returns nothing).
- Files: `lib/connectors/grok.ts`, `lib/connectors/exa.ts:1-266`, `lib/connectors/sec-edgar.ts:31-38,75-82`, `lib/enrichment/enrich.ts:44-63,127-152`
- Impact: a transient 429/500 from xAI, Exa, or Anthropic during a sync silently degrades that company's ingestion to "partial" (or a swallowed empty profile) instead of being retried — data gaps look identical to "nothing found," and callers can't tell the difference from the summary alone.
- Fix approach: wrap the shared fetch calls in a small retry helper (2-3 attempts, exponential backoff honoring `Retry-After` when present) at the connector layer; keep the existing "best-effort, never throws" contract for the ingestion orchestrator.

**No env var validation at boot:**
- Issue: required secrets are read via non-null assertions (e.g. `process.env.SUPABASE_SERVICE_ROLE_KEY!` in `lib/supabase/admin.ts:11`) rather than a startup schema check. A missing/misnamed env var on a new Vercel deployment fails at first request with a runtime `TypeError` or an opaque upstream 401, not a clear boot-time error.
- Files: `lib/supabase/admin.ts`, `lib/connectors/registry.ts`, `lib/enrichment/enrich.ts`, `app/api/cron/*/route.ts`
- Impact: deployment misconfiguration (a common failure mode per the project's own `deploy-env` notes) surfaces as confusing 500s deep in a cron job rather than a single clear error.
- Fix approach: add a small `lib/env.ts` that validates required vars (with clear per-feature grouping: core Supabase vs. optional connector keys) once at module load, throwing a descriptive error.

**`sanitizeAllSources` dynamic-table escape hatch (`lib/enrichment/sanitize-sources.ts`):**
- Issue: the Supabase generated types can't express a function parameterized over table name, so `sanitizeAllSources` casts `supabase.from` to `(n: string) => DynTable` (`lib/enrichment/sanitize-sources.ts:113-114`) and defines a hand-rolled minimal `DynTable` interface for `select`/`update`. This is a deliberate, narrow escape hatch (documented in the comment) rather than a blanket `any`, but it means the compiler no longer verifies that `TEXT_TABLES`/`PLAIN_TABLES` names or the `source`/`url` columns actually exist on those tables.
- Files: `lib/enrichment/sanitize-sources.ts:33-34 (TEXT_TABLES/PLAIN_TABLES), 106-137`
- Impact: a schema migration that renames/drops a `source` or `url` column, or a typo added to `TEXT_TABLES`/`PLAIN_TABLES`, fails silently at runtime (empty `data`, nothing scanned) instead of at compile time.
- Fix approach: add an integration test (or a lightweight runtime assertion) that calls `sanitizeAllSources` against each declared table name and confirms it returns rows for at least one seeded record per table, catching drift between the constant lists and the live schema.

**No dedicated tests for connectors, agents, or the global-sync pipeline:**
- Issue: `lib/connectors/grok.ts`, `lib/connectors/sec-edgar.ts`, `lib/agents/global-sync.ts`, `lib/agents/financials.ts`, `lib/agents/refresh.ts`, `lib/agents/sentiment.ts` have no `*.test.ts` counterpart (compare with `lib/connectors/exa.test.ts`, `lib/connectors/exa-events-parse.test.ts`, which do exist). Only the pure validators (`timeline-validation.ts`, `sanitize-sources.ts`, `disambiguation.ts`) and `exa.ts` parsing are unit-tested.
- Files: `lib/connectors/grok.ts`, `lib/connectors/sec-edgar.ts`, `lib/agents/global-sync.ts`, `lib/agents/financials.ts`, `lib/agents/refresh.ts`, `lib/agents/sentiment.ts`
- Impact: regressions in the Grok JSON-extraction logic (`extractJson` in `grok.ts:37-60`, a hand-rolled balanced-brace parser) or the SEC EDGAR name-matching heuristics (`lib/connectors/sec-edgar.ts:44-48`) would not be caught by `npm test`.
- Fix approach: add unit tests for `extractJson` (malformed/truncated model output, embedded citation markdown) and for `searchFormD`'s fuzzy-name filter, mirroring the existing `exa-parse` test style.

## Known Bugs

**RSC/client boundary crash from `LucideIcon` props (fixed 2026-07-01, pattern risk remains):**
- Symptoms: `/dashboard` threw "Functions cannot be passed directly to Client Components" at runtime.
- Files: `components/dashboard/collapsible-section.tsx`, `components/dashboard/events-calendar.tsx` (fixed in commit `8d80872`)
- Trigger: a server component (`events-calendar.tsx`) passed a `lucide-react` icon component (a `forwardRef`, non-serializable) as the `icon` prop into the shared `"use client"` `CollapsibleSection`. Any React Server Component that renders `<CollapsibleSection icon={SomeLucideIcon} />` — or any future shared client component with a component-typed prop — will hit the same failure the moment a caller forgets to mark itself `"use client"`.
- Workaround/fix in place: `events-calendar.tsx` now has `"use client"`; `collapsible-section.tsx`'s `icon?: LucideIcon` prop carries a comment warning that consumers must be client components. This is a comment-only guard, not a compile-time one — grep other `icon={...}` call sites (`grep -rn "icon={" components/dashboard`) before adding new `CollapsibleSection` consumers, since nothing prevents reintroducing the same bug in a new server component.

**Cron routes previously failed OPEN when `CRON_SECRET` was unset (fixed 2026-07-01):**
- Symptoms: prior to commit `c755012`, all six cron routes used `if (secret && header !== ...)`, meaning an unset `CRON_SECRET` env var skipped the auth check entirely and allowed unauthenticated triggering of `runGlobalSync` (writes/deletes across every user's data) and every other cron.
- Files: `app/api/cron/*/route.ts` (all six), now uniformly `if (!secret || header !== \`Bearer ${secret}\`) return 401`.
- Status: fixed and verified consistent across `global-sync`, `market-sync`, `daily-refresh`, `news-sentiment`, `exa-events`, `weekly-digest`. No remaining route uses the old pattern (confirmed by direct read of all six files 2026-07-02). Flagging here as a regression risk: any new cron route added by copy-paste must copy the fail-closed guard, not an older stale reference.

## Security Considerations

**Service-role (admin) Supabase client used inside user-triggered server actions:**
- Risk: `createAdminClient()` bypasses RLS by design (`lib/supabase/admin.ts:5-7`) and is intentionally used outside cron contexts in `app/(app)/companies/document-actions.ts` (signed upload URLs, PDF download) and `app/(app)/reports/actions.ts` (`generateDigestNow`), plus `lib/queries.ts:listReports` (signed report URLs) and `app/(auth)/actions.ts` and `app/api/admin/approve/route.ts`.
- Files: `app/(app)/companies/document-actions.ts:229-247,250-272`, `app/(app)/reports/actions.ts:31-45`, `lib/queries.ts:80-108`
- Current mitigation: every one of these call sites re-checks `supabase.auth.getUser()` and an explicit ownership check (`ownsCompany`, or scoping the storage path to `${user.id}/...` / `${companyId}/...`) before invoking the admin client — confirmed by direct read of all these files. `processStoredPdf` additionally validates `path.startsWith(`${companyId}/`)` to prevent cross-tenant storage traversal.
- Recommendation: this pattern is correct today but fragile — a future server action that copy-pastes `createAdminClient()` without also copying the ownership check would silently grant cross-tenant access with no RLS backstop. Consider a lint rule or code-review checklist item flagging any new `createAdminClient()` call site outside `app/api/cron/*`.

**Admin approval token flow:**
- Risk: `app/api/admin/approve/route.ts` GET renders a confirmation page from a bare token in the query string (`?token=...`); the token is single-use and burned on POST, and GET is explicitly non-mutating (documented to defeat email-scanner prefetch). This is a sound design, but the token itself has no visible expiry — `approval_token` appears to remain valid indefinitely until approved.
- Files: `app/api/admin/approve/route.ts:34-68`, `lib/email/approval.ts`
- Recommendation: confirm (in the `profiles` schema/migration) whether `approval_token` rows expire; if not, add a TTL check so a leaked signup-notification email's link can't be replayed months later.

**No secrets committed to git; `.env.local` correctly ignored.**
- `.gitignore` covers `.env` and `.env*.local` (`.gitignore:23-24`); `git ls-files | grep -i env` shows only the checked-in `.env.local.example` (redacted placeholders) is tracked. `.env.local` itself exists on disk but was confirmed absent from git history. No action needed, noted for completeness.

**Clearbit logo dependency is unauthenticated and unversioned:**
- Risk: `resolveLogo()` in `lib/enrichment/enrich.ts:26-34` constructs a `https://logo.clearbit.com/${domain}` URL directly (no API key) and the `<img>` tag loads it client-side. Clearbit's free Logo API has no SLA and can rate-limit or disappear without warning (Clearbit was acquired by HubSpot in 2023 and has periodically changed this endpoint's availability).
- Files: `lib/enrichment/enrich.ts:26-34`, `components/company/add-company-dialog.tsx:196` (fallback comment references "Clearbit -> Google")
- Recommendation: confirm the client-side `<img onError>` fallback (referenced in the add-company-dialog comment) is applied everywhere this logo URL is rendered, not just in the add dialog.

## Performance Bottlenecks

**Sequential per-company queries in `validateAllTimelines` (`lib/enrichment/timeline-validation.ts:174-192`):**
- Problem: loops `for (const c of companies ?? [])` and issues one `await supabase.from("valuations").select(...)` per company, sequentially — an N+1 pattern with zero concurrency (contrast with `runGlobalSync`'s explicit `CONCURRENCY = 4` batching one file over, in `lib/agents/global-sync.ts:104-108`).
- Files: `lib/enrichment/timeline-validation.ts:174-192`
- Cause: no batching/parallelism was added when this was introduced (commit `c9f1715`), even though the strip-deletes are already correctly batched per company (comment at line 187: "Batch the strip-deletes into one round-trip per company instead of N").
- Improvement path: fetch all companies' valuations in one query (`select id, company_id, date, post_money, round, source` with no `.eq`, then group in memory) instead of one round-trip per company; or apply the same `Promise.all` batching pattern already used in `global-sync.ts`.

**Sequential signed-URL generation in `listReports` (`lib/queries.ts:80-108`):**
- Problem: `for (const f of files ?? [])` calls `admin.storage.from("reports").createSignedUrl(path, 3600)` once per file inside the loop — another N+1 against Supabase Storage, bounded by `limit: 100` but still one network round-trip per report file on every `/reports` page load.
- Files: `lib/queries.ts:96-108`
- Improvement path: Supabase Storage doesn't support batch signed-URL creation, so the realistic fix is `Promise.all(files.map(...))` to parallelize the round-trips instead of serializing them.

**Unthrottled per-company external API fan-out in the sync/enrichment pipeline:**
- Problem: `ingestCompany` (`lib/ingestion/orchestrator.ts:38-53`) issues 4 concurrent calls (`fetchCompanyProfile`, `fetchFundingRounds`, `fetchNews`, `fetchSocialSignals`) per connector per company; `runGlobalSync` then runs this across companies in batches of 4 (`lib/agents/global-sync.ts:104-108`). With all three live connectors configured (Grok/xAI, Exa, SEC EDGAR), a single global-sync run can generate roughly 4 companies × 3 connectors × 3-4 calls = 36-48 concurrent external requests per batch, repeated for every batch of 4 companies, with no client-side rate limiting.
- Files: `lib/ingestion/orchestrator.ts:38-53`, `lib/agents/global-sync.ts:104-108`, `lib/connectors/sec-edgar.ts` (`searchFormD` + `fetchFormDDetail`, up to 4 sequential-looking SEC requests per company: 1 search + up to 3 `Promise.all` detail fetches)
- Cause: no shared rate limiter or request queue exists anywhere in `lib/connectors` or `lib/agents`; each connector call is independent.
- Improvement path: SEC EDGAR explicitly documents a ~10 requests/second fair-access limit — `fetchFormDDetail` is called via `Promise.all` for up to 3 filings per company (`lib/connectors/sec-edgar.ts:141-143`) with no delay, and this happens for every company in every batch of 4, concurrently. As the portfolio grows past a few dozen companies this is very likely to trip SEC's rate limiter (typically returns 403/429), silently degrading Form D ingestion to empty results (caught by the connector's own try/catch, so it fails quietly). Consider a shared token-bucket limiter keyed per connector/host, especially for `sec.gov`.

**Weekly cron scheduling overlap risk (`vercel.json`):**
- Problem: `global-sync` (Mon 04:00 UTC), `market-sync` (Mon 13:00 UTC), `exa-events` (Mon 14:00 UTC), and `weekly-digest` (Mon 08:00 UTC) all run on Monday. `weekly-digest` runs at 08:00, four hours after `global-sync` starts (with `maxDuration: 300` = 5 min per route, so global-sync itself should be done by ~04:05), but *before* `market-sync`/`exa-events` run later that same day — meaning the weekly digest is built from data that is one enrichment cycle behind the day's later market/events sync.
- Files: `vercel.json:3-9`
- Improvement path: reorder so `weekly-digest` runs last in the Monday sequence (after `market-sync` and `exa-events`), or explicitly document that the digest intentionally reflects the pre-market-sync snapshot.

## Fragile Areas

**PDF ingestion buffer lifecycle (`app/(app)/companies/document-actions.ts:150-222`):**
- Files: `app/(app)/companies/document-actions.ts:158-175`
- Why fragile: the code depends on an documented but non-obvious side effect — `pdf-parse`'s `PDFParse.getText()` "neuters" (transfers) the underlying `ArrayBuffer` to a worker thread, so the original `buf` becomes unusable afterward. The fix is to clone the bytes *before* calling `getText()` (`const ocrBytes = new Uint8Array(buf)` at line 161) so the OCR fallback path still has valid bytes. This is called out in a comment, but any future refactor that reorders these two lines (clone after `getText()` instead of before) reintroduces a silent empty-buffer bug that only manifests on the image-based-PDF OCR fallback path — not covered by any test in `lib/documents/*.test.ts`.
- Safe modification: never reorder the `ocrBytes` clone to after the `getText()` call; consider a code comment enforcing this at the `getText()` call site too (currently only documented at the `ocrBytes` declaration).
- Test coverage: none — `lib/documents/clean.test.ts` and `lib/documents/heuristic.test.ts` test text cleaning/heuristics, not the PDF-buffer neutering interaction.

**LLM-derived company profile enrichment has no cross-checking against connectors (`lib/enrichment/enrich.ts`):**
- Files: `lib/enrichment/enrich.ts:38-63,155-176`
- Why fragile: `resolveBase()` prefers the Anthropic LLM (`llmEnrich`) whenever `ANTHROPIC_API_KEY` is set, and only falls back to the keyless connectors (Grok/Exa/SEC) on an LLM error — it does not cross-validate the LLM's "known facts" (sector, founded year, founders) against any connector or timeline-validation guard the way `lib/enrichment/timeline-validation.ts` guards valuations. The prompt says "Use null for anything you are unsure of," which is a soft instruction, not an enforced guardrail — unlike the valuation pipeline's hard `isTrustedSource`/`MAX_PLAUSIBLE` checks.
- Safe modification: if extending this module, apply the same "primary-source or flag" discipline used in `timeline-validation.ts`/`sanitize-sources.ts` — e.g. don't let an LLM-only founding year/founders list get written without at least attempting a connector cross-check.
- Test coverage: none for `lib/enrichment/enrich.ts` (no `enrich.test.ts`), unlike the well-tested `timeline-validation.ts`/`sanitize-sources.ts` siblings in the same directory.

**`lib/metrics.ts` (640 lines) and `app/(app)/companies/[id]/page.tsx` (723 lines) are the two largest files in the repo:**
- Files: `lib/metrics.ts`, `app/(app)/companies/[id]/page.tsx`
- Why fragile: `metrics.ts` is well-tested (`lib/metrics.test.ts`, 464 lines) and documented as pure/deterministic, so it is lower risk despite size. `app/(app)/companies/[id]/page.tsx` at 723 lines is the company detail page — a large single page component is more likely to accumulate unrelated concerns (data fetching + multiple tab renderers + formatting) over time; no test file exists for it (page components generally aren't unit tested in this repo, consistent with Next.js conventions, but this raises the manual-QA burden for any change).
- Safe modification: when adding new company-detail-page features, prefer extracting a new component under `components/company/` (the established pattern — see `components/company/valuation-timeline.tsx`, `components/company/provenance.tsx`, etc.) rather than growing `page.tsx` further.

## Scaling Limits

**Portfolio size vs. external API fan-out:**
- Current capacity: `runGlobalSync` batches 4 companies concurrently with `maxDuration: 300` seconds on the cron route (`app/api/cron/global-sync/route.ts:8`).
- Limit: as the portfolio grows, more sequential batches of 4 are needed, each still bound by the slowest connector call; SEC EDGAR rate limits (see Performance section) and xAI/Exa quota limits become the binding constraint well before the 300s `maxDuration` does, likely in the tens-of-companies range depending on API tier.
- Scaling path: raise `CONCURRENCY` cautiously only alongside adding a rate limiter (see above); otherwise split `runGlobalSync` into resumable shards (e.g., process N companies per invocation, track a cursor) rather than one unbounded per-cron-run loop.

## Dependencies at Risk

**Clearbit Logo API (keyless, unversioned, third-party):**
- Risk: no SLA, no API key, historically unstable availability post-HubSpot acquisition.
- Impact: company logos silently fall back to initials (per the add-company-dialog fallback comment) if Clearbit degrades — cosmetic only, not a data-integrity risk.
- Migration plan: none needed unless Clearbit's endpoint is retired; monitor for broken images in production.

**`pdf-parse` (`^2.4.5`) buffer-transfer behavior:**
- Risk: the library's behavior of transferring/neutering the input `ArrayBuffer` during `getText()` is an internal implementation detail being relied upon (worked around, not guarded against) in `document-actions.ts`. A future `pdf-parse` major version could change this behavior in either direction (stop neutering, or neuter earlier/differently), silently breaking the `ocrBytes` workaround.
- Impact: OCR fallback for image-based PDFs could start receiving empty/corrupt bytes without an explicit test catching the regression.
- Migration plan: add a targeted unit/integration test asserting the OCR fallback path receives non-empty bytes after `getText()` runs, so a `pdf-parse` upgrade that changes this behavior fails CI instead of failing silently in production.

## Missing Critical Features

**No env var validation / startup health check** — see Tech Debt above; there's no `/api/health` or boot-time check confirming all configured connectors and required secrets are reachable, so a broken `XAI_API_KEY` or expired `SEC_USER_AGENT` contact only becomes visible via degraded `ingestion_runs` rows, not a proactive alert.

**No rate limiter / circuit breaker for external connectors** — see Performance Bottlenecks; this is the most actionable gap given the SEC EDGAR fair-access policy and growing portfolio size.

## Test Coverage Gaps

**LLM enrichment module (`lib/enrichment/enrich.ts`):**
- What's not tested: `llmEnrich`, `llmDescribe`, `describeFromWebsite`, `resolveBase` — the entire Anthropic-backed company-profile enrichment path, including its JSON-fence-stripping (`raw.replace(/^```(?:json)?\s*|\s*```$/g, "")`) and its fallback-to-connectors logic on LLM failure.
- Files: `lib/enrichment/enrich.ts` (no `enrich.test.ts`)
- Risk: a change to the Anthropic response-parsing logic, or a change in model output format (e.g. the model starts wrapping JSON differently), would not be caught until manual testing or a production failure.
- Priority: Medium — this path is gated behind `ANTHROPIC_API_KEY` and has try/catch fallbacks, but it's one of the few places LLM output is parsed without a validator module backing it (contrast with `timeline-validation.ts`/`sanitize-sources.ts`, which are both thoroughly tested).

**Grok connector (`lib/connectors/grok.ts`) and SEC EDGAR connector (`lib/connectors/sec-edgar.ts`):**
- What's not tested: `extractJson`'s balanced-brace parser, `grokSearch`'s schema validation/rejection path, `searchFormD`'s fuzzy name-matching filter (`f.startsWith(q) && q.startsWith(f)` heuristic) and SPV/fund filtering regex.
- Files: `lib/connectors/grok.ts`, `lib/connectors/sec-edgar.ts`
- Risk: false-positive/false-negative company matches in SEC Form D search (e.g. the documented "Ramp" vs. "ON-RAMP WIRELESS" false-positive class of bug) have no regression test guarding against reintroduction.
- Priority: Medium-High — this connector directly feeds funding-round data that then passes through `timeline-validation.ts`'s guardrails, but a wrong-entity Form D match wouldn't necessarily be caught by those guardrails (they validate valuation chronology, not entity identity).

**Global-sync pipeline orchestration (`lib/agents/global-sync.ts`) and other agents:**
- What's not tested: the batching/concurrency logic, partial-failure aggregation (`errors.push(...)`), and the ordering of the 6 pipeline stages.
- Files: `lib/agents/global-sync.ts`, `lib/agents/financials.ts`, `lib/agents/refresh.ts`, `lib/agents/sentiment.ts`, `lib/agents/exa-events.ts`
- Risk: a refactor that reorders stages (e.g. running source sanitization before timeline validation) could silently change behavior — the current ordering is deliberate (sanitize runs after enrichment specifically to catch freshly-written generic labels, per the code comment at `lib/agents/global-sync.ts:119-121`) but nothing enforces that ordering except convention.
- Priority: Medium — `lib/ingestion/orchestrator.test.ts` covers the per-company ingestion path, but the multi-stage global-sync orchestration itself is untested end-to-end.

---

*Concerns audit: 2026-07-02*
