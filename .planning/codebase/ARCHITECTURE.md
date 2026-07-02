<!-- refreshed: 2026-07-02 -->
# Architecture

**Analysis Date:** 2026-07-02

## System Overview

```text
┌───────────────────────────────────────────────────────────────────────────┐
│                     Next.js 15 App Router (app/)                          │
├──────────────────────────┬───────────────────────┬────────────────────────┤
│  (app) authenticated UI   │  (auth) public UI      │  api/ route handlers  │
│  `app/(app)/**`           │  `app/(auth)/**`       │  `app/api/**`         │
│  dashboard, companies,    │  login, signup,        │  cron/* (bearer-token │
│  fund, reports            │  pending               │  jobs), admin/approve│
└──────────┬────────────────┴───────────┬───────────┴──────────┬────────────┘
           │ server components +        │ redirects via         │ triggers
           │ server actions             │ middleware.ts          │
           ▼                            ▼                        ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                      Domain / pipeline layer (lib/)                       │
├──────────────┬───────────────┬───────────────┬───────────────┬───────────┤
│ lib/agents/   │ lib/ingestion/│ lib/enrichment│ lib/connectors│ lib/queries│
│ orchestrate   │ map/dedupe/   │ /validate,     │ /Grok, Exa,   │.ts, lib/  │
│ multi-stage   │ apply to DB   │ sanitize,      │ SEC EDGAR,    │metrics.ts,│
│ sync runs     │               │ disambiguate   │ stub          │lib/canon- │
│               │               │                │               │ical.ts    │
└──────┬────────┴──────┬────────┴──────┬────────┴──────┬────────┴─────┬─────┘
       │                │                │                │              │
       ▼                ▼                ▼                ▼              ▼
┌───────────────────────────────────────────────────────────────────────────┐
│                  Supabase (Postgres + Auth + Storage)                     │
│  `lib/supabase/{server,admin,client,middleware}.ts` · RLS-scoped tables   │
│  `supabase/migrations/*.sql`                                              │
└───────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Company detail page | Assembles all per-company tabs from queries + pure derivations | `app/(app)/companies/[id]/page.tsx` |
| Server actions (companies) | CRUD + on-demand sync/enrich triggers, auth-gated, revalidates routes | `app/(app)/companies/actions.ts` |
| Server actions (documents) | Data-room upload → extract → diff → apply pipeline | `app/(app)/companies/document-actions.ts` |
| Cron routes | Bearer-token-gated entry points that invoke agents on a schedule | `app/api/cron/*/route.ts` |
| Ingestion orchestrator | Fan-out to connectors, dedupe, write rows, log run | `lib/ingestion/orchestrator.ts` |
| Ingestion mapper | Pure aggregation/dedupe of raw connector output into DB-ready shapes | `lib/ingestion/map.ts` |
| Ingestion apply | Idempotent DB writer: rounds/valuations/news/competitors + activity events | `lib/ingestion/apply.ts` |
| Connector registry | Chooses enabled connectors based on configured env keys | `lib/connectors/registry.ts` |
| Connector implementations | Source-specific fetch + parse logic (Grok/X, Exa, SEC EDGAR, stub) | `lib/connectors/{grok,exa,sec-edgar,stub}.ts` |
| Enrichment: disambiguation | Strips signals matching the wrong real-world entity | `lib/enrichment/disambiguation.ts` |
| Enrichment: sanitize-sources | Resolves generic aggregator labels to real publisher domains | `lib/enrichment/sanitize-sources.ts` |
| Enrichment: timeline-validation | Write-time + sweep guard against backdated/hallucinated valuations | `lib/enrichment/timeline-validation.ts` |
| Enrichment: enrich | Company-profile auto-fill (LLM or connector) for the Add Company form | `lib/enrichment/enrich.ts` |
| Agents | Multi-stage orchestrated jobs composing ingestion + enrichment + competitors | `lib/agents/{refresh,global-sync,exa-events,financials,sentiment}.ts` |
| Canonical reconciliation | Merges valuation/revenue across sources into one provenance-tagged record | `lib/canonical.ts` |
| Competitor ranking | Pure merge + sort of target + discovered competitors | `lib/competitors/rank.ts` |
| Competitor discovery/refresh | Connector-driven competitor discovery, additive merge into DB | `lib/competitors/{discover,refresh}.ts` |
| Metrics | Pure functions: per-company + portfolio + fund-level financial derivations | `lib/metrics.ts` |
| Queries | All Supabase reads used by server components (RLS-scoped) | `lib/queries.ts` |
| Market-cache pipeline | Weekly valuation-cache ingest from trusted sources + Exa sweep | `lib/market-cache/{ingest,exa-sweep,parse,sources,lookup}.ts` |
| Documents pipeline | PDF/URL → clean → extract (LLM/heuristic) → diff vs. prior doc | `lib/documents/{extract,clean,diff,heuristic,fetch-url}.ts` |
| Supabase clients | Three client flavors: cookie-bound (RLS), admin (service role), browser | `lib/supabase/{server,admin,client}.ts` |
| Auth/session gate | Redirects unauthenticated/unapproved users; approves active users | `lib/supabase/middleware.ts`, `middleware.ts` |

## Pattern Overview

**Overall:** Server-rendered Next.js App Router application with a layered domain pipeline underneath. There is no separate backend service — all "backend" logic lives in `lib/` and is invoked either from React Server Components (reads), Server Actions (user-triggered writes), or Route Handlers (cron-triggered writes). Supabase is the only persistence/auth layer.

**Key Characteristics:**
- **Pipeline composition over inheritance.** Agents (`lib/agents/*`) compose smaller, independently-testable stages (ingest → competitors → financials → disambiguation → sanitize) rather than one monolithic function.
- **Best-effort, isolated failures.** Every multi-company or multi-connector loop treats each unit as independent — one company's or one connector's failure degrades the run status to `"partial"` but never aborts the batch (see `lib/ingestion/orchestrator.ts:40-65`, `lib/agents/global-sync.ts:75-104`).
- **Pure-function core, thin I/O shell.** Reconciliation (`lib/canonical.ts`), ranking (`lib/competitors/rank.ts`), metrics (`lib/metrics.ts`), and dedupe (`lib/ingestion/dedupe.ts`) are dependency-free pure functions unit-tested in isolation; all Supabase I/O is isolated to `apply.ts`, `orchestrator.ts`, `queries.ts`, and the agents.
- **Provenance-first data model.** Nearly every fact (valuation, revenue, competitor row) carries a `source`/`basis` string; the canonical layer explicitly tracks corroboration and conflict rather than silently overwriting.
- **Connector interface as an extension seam.** `lib/connectors/types.ts` defines `DataConnector`; new sources plug into `lib/connectors/registry.ts` gated on an env var, with zero changes to ingestion or UI code.

## Layers

**Presentation (`app/`):**
- Purpose: route composition, layout, auth gating, tab assembly for the UI
- Location: `app/(app)/**`, `app/(auth)/**`, `app/api/**`
- Contains: React Server Components (pages), Server Actions (`actions.ts` files), Route Handlers (`route.ts`)
- Depends on: `lib/queries.ts` (reads), `lib/metrics.ts`, `lib/canonical.ts`, `lib/ingestion/*`, `lib/agents/*` (writes/triggers)
- Used by: end users (browser) and Vercel Cron (bearer-token requests)

**Domain pipeline (`lib/agents/`, `lib/ingestion/`, `lib/enrichment/`, `lib/competitors/`, `lib/documents/`, `lib/market-cache/`, `lib/news/`, `lib/reports/`, `lib/email/`):**
- Purpose: all business logic — data acquisition, reconciliation, validation, reporting
- Location: `lib/*` subdirectories
- Contains: orchestration functions, pure transformation functions, connector clients
- Depends on: `lib/connectors/*` (external fetch), `lib/supabase/*` (DB access passed in as a typed client), `lib/types.ts`
- Used by: server actions, cron route handlers, other agents (e.g. `global-sync` calls `financials`, `competitors/refresh`, `disambiguation`)

**Connectors (`lib/connectors/`):**
- Purpose: isolate every external data source behind one interface
- Location: `lib/connectors/types.ts` (contract), `lib/connectors/{grok,exa,sec-edgar,stub}.ts` (implementations), `lib/connectors/registry.ts` (selection)
- Contains: HTTP calls to xAI Grok, Exa search API, SEC EDGAR Form D full-text search, and a keyless stub
- Depends on: env vars (`XAI_API_KEY`, `EXA_API_KEY`, `SEC_USER_AGENT`) to gate availability
- Used by: `lib/ingestion/orchestrator.ts`, `lib/enrichment/enrich.ts`, `lib/competitors/discover.ts`

**Reconciliation (`lib/canonical.ts`, `lib/competitors/rank.ts`, `lib/metrics.ts`):**
- Purpose: turn raw multi-source rows into one trustworthy, UI-ready number
- Location: `lib/canonical.ts`, `lib/competitors/rank.ts`, `lib/metrics.ts`
- Contains: pure functions only, all unit-tested (`lib/canonical.test.ts`, `lib/competitors/rank.test.ts`)
- Depends on: `CompanyWithRelations` / `CompetitorRow` shapes from `lib/types.ts`
- Used by: `app/(app)/companies/[id]/page.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/fund/page.tsx`

**Data access (`lib/queries.ts`, `lib/supabase/`):**
- Purpose: single place for every Supabase read; three client constructors for the three trust contexts
- Location: `lib/queries.ts`, `lib/supabase/{server,admin,client,middleware}.ts`
- Contains: `createClient()` (cookie-bound, RLS-enforced, for server components/actions), `createAdminClient()` (service-role, for cron jobs), browser client (for client components), `updateSession()` (middleware auth gate)
- Depends on: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Used by: every page, server action, and cron route

## Data Flow

### Primary Request Path — company detail page

1. Route entry: `app/(app)/companies/[id]/page.tsx:87` — awaits `params`, calls `getCompany(id)`.
2. Parallel reads: `getCompetitors(id)`, `getMarketValuation(company.name)`, `getDocuments(id)` (`page.tsx:95-99`, backed by `lib/queries.ts:158-201`).
3. Pure derivations run entirely in the RSC body (no client round-trip): `companyInvested`, `currentValue`, `companyChangePct`, `currentOwnershipPct`, `dealFees` from `lib/metrics.ts` (`page.tsx:101-106`).
4. Dedupe before render: `dedupeValuationRows` / `dedupeFundingRows` from `lib/ingestion/dedupe.ts` collapse rows describing the same financing event (`page.tsx:110-118`).
5. Canonical reconciliation: `buildCanonicalRecord(company, { market, self })` from `lib/canonical.ts` merges the valuations-table figure, the market-cache row, and the competitor "self" row into one provenance-tagged valuation/revenue/multiple (`page.tsx:136-146`).
6. Competitor ranking: `buildCompetitorRanking(target, peers)` from `lib/competitors/rank.ts` produces the sorted table for the Competitors tab, using the canonical revenue so the target's own V/R multiple is populated (`page.tsx:148-160`).
7. Render: a single `<Tabs>` component (`components/ui/tabs.tsx`) with eight `TabsContent` panels — Overview, Provenance, Data room, Investment, Valuation, Funding Rounds, Competitors, News — each fed by the values computed above, no further data fetching per tab.

### Secondary Flow — on-demand sync ("Sync data" button)

1. Client component `components/company/sync-button.tsx` calls the server action `syncCompany(companyId)` in `app/(app)/companies/actions.ts:145`.
2. `ingestCompany(supabase, data)` (`lib/ingestion/orchestrator.ts:27`) fans out to every enabled connector concurrently (Grok, SEC EDGAR, Exa, or the stub), each isolated via `Promise.all` + try/catch per connector.
3. `mapConnectorResults(batch)` (`lib/ingestion/map.ts:39`) purely aggregates + dedupes rounds/news/signals across connectors and synthesizes valuation points from rounds that carry both a date and valuation.
4. `applyMappedIngest(supabase, companyId, mapped)` (`lib/ingestion/apply.ts:35`) dedupes against existing DB rows, runs the write-time timeline guard (`filterIngestValuations` from `lib/enrichment/timeline-validation.ts`), inserts new rounds/valuations/news/competitors, patches the company's durable revenue field (never clobbering a trusted source with an untrusted one), and appends deduped `portfolio_events` rows respecting the user's alert preferences.
5. Back in the action: `refreshCompetitorsFor` (`lib/competitors/refresh.ts`) and `verifyFinancialsFor` (`lib/agents/financials.ts`) run best-effort, then `revalidatePath` invalidates `/companies/[id]`, `/dashboard`, `/fund`.

### Background Flow — weekly global sync (cron)

1. `app/api/cron/global-sync/route.ts` validates the `Authorization: Bearer ${CRON_SECRET}` header, then calls `runGlobalSync(createAdminClient())`.
2. `lib/agents/global-sync.ts:52` reads every company (service-role, all users) and processes them in bounded concurrency batches of 4 (`CONCURRENCY = 4`, `global-sync.ts:109-112`) to stay within the cron's 300s `maxDuration`.
3. Per company: (1) `ingestCompany`, (2) `refreshCompetitorsFor(..., { mode: "merge" })` — additive only, never overwrites verified rows, (3) `verifyFinancialsFor`, (4) `purgeWrongEntitySignals` (disambiguation).
4. Globally, once: `runExaEventsSync` (corporate/valuation/secondary events sweep), `validateAllTimelines` (strips backdated/hallucinated valuations across the whole DB), `sanitizeAllSources` (resolves generic aggregator labels to real publisher domains).
5. Sibling cron jobs run the same agent-composition pattern for narrower scopes: `daily-refresh` → `runDailyRefresh` (ingestion only), `market-sync` → `runMarketSync` (market-cache), `exa-events` → `runExaEventsSync` alone, `news-sentiment` → `runSentimentAgent`, `weekly-digest` → `runWeeklyDigest` (PDF report generation to the `reports` storage bucket).

**State Management:**
- No client-side global store. All state is server-derived per request; client components (`"use client"`, e.g. `components/company/sync-button.tsx`) hold only local UI state (loading, dialog open/closed) and call server actions, then rely on `revalidatePath` to refresh server-rendered data.
- The only "cache" is the `market_valuations` table (`lib/market-cache/`), refreshed weekly by cron — a deliberate reference-data cache, not a request cache.

## Key Abstractions

**DataConnector (`lib/connectors/types.ts`):**
- Purpose: uniform contract for any external data source — profile, funding rounds, news, optional competitors/valuation-metric/social-signals
- Examples: `lib/connectors/grok.ts` (xAI Grok X/Twitter search), `lib/connectors/exa.ts` (Exa web search), `lib/connectors/sec-edgar.ts` (SEC Form D filings), `lib/connectors/stub.ts` (keyless placeholder)
- Pattern: strategy pattern selected at runtime by `lib/connectors/registry.ts` based on which env keys are set; ingestion code never branches on connector identity

**CanonicalRecord / CanonicalField (`lib/canonical.ts`):**
- Purpose: represent one reconciled fact (valuation or revenue) with full source lineage — every observation, a corroboration count, and a conflict flag
- Examples: built once per company detail page render (`buildCanonicalRecord`), consumed by `components/company/provenance.tsx` and the header stat cards
- Pattern: reduce-to-canonical with trust preference (`isTrustedSource` filters before picking most-recent) and a time-window check (`WINDOW_MS = 120 days`) so historical rounds are never mistaken for present-day disagreement

**MappedIngest (`lib/ingestion/map.ts`):**
- Purpose: the DB-ready intermediate shape between raw connector output and `applyMappedIngest`
- Examples: `mapConnectorResults(batch)` produces `{ fundingRounds, valuations, news, profilePatch }`
- Pattern: pure aggregation + dedupe stage, isolated from all I/O so it is directly unit-testable (`lib/ingestion/map.ts` has no test file itself, but `dedupe.ts`/`orchestrator.ts` are tested around it)

**Agent (`lib/agents/*.ts`):**
- Purpose: an orchestrated, multi-stage job that composes lower-level pipeline functions and is safe to invoke from either a server action or a cron route
- Examples: `runDailyRefresh` (ingestion only), `runGlobalSync` (ingestion + competitors + financials + disambiguation + events + timeline validation + source sanitization), `runExaEventsSync`, `runSentimentAgent`
- Pattern: every agent takes a Supabase client as its first argument (`DB = SupabaseClient<Database>`) so the same function runs under RLS (button-triggered, current user only) or service-role (cron, all users)

**Ingestion event → `portfolio_events` (`lib/events.ts`, applied in `lib/ingestion/apply.ts:197-248`):**
- Purpose: turn newly-ingested facts into a deduped, preference-filtered activity feed entry
- Pattern: built once per ingest, deduped both against prior events (composite key `type|title|occurred_at`) and the table's unique index, so repeated daily/weekly runs are idempotent

## Entry Points

**Company detail page:**
- Location: `app/(app)/companies/[id]/page.tsx`
- Triggers: navigation to `/companies/[id]`
- Responsibilities: fetch company + competitors + market valuation + documents; run all pure derivations (metrics, canonical, dedupe, ranking); render the 8-tab UI

**Dashboard page:**
- Location: `app/(app)/dashboard/page.tsx`
- Triggers: navigation to `/dashboard` (also the post-login/approval redirect target, see `lib/supabase/middleware.ts:80-84`)
- Responsibilities: portfolio-level aggregates via `lib/metrics.ts` (`portfolioSummary`, `sectorAllocation`, `topPerformers`, `latestValuationChanges`, `portfolioValueSeries`), activity feed, events calendar

**Server actions (`app/(app)/companies/actions.ts`, `app/(app)/companies/document-actions.ts`, `app/(app)/dashboard/actions.ts`, `app/(app)/reports/actions.ts`, `app/(auth)/actions.ts`):**
- Triggers: form submissions and button clicks from client components (`"use server"` directive)
- Responsibilities: auth check (`requireUser`/`authed`), validate input, write via the cookie-bound Supabase client, best-effort trigger ingestion/enrichment, `revalidatePath` affected routes

**Cron route handlers (`app/api/cron/*/route.ts`):**
- Triggers: Vercel Cron schedule (see `vercel.json`) sending `Authorization: Bearer ${CRON_SECRET}`; also manually triggerable with the same token
- Responsibilities: validate the bearer token, instantiate `createAdminClient()` (service role — bypasses RLS, covers all users), invoke exactly one agent, return a JSON summary
- Runtime config: every cron route pins `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`

**Middleware:**
- Location: `middleware.ts` (root) delegates to `lib/supabase/middleware.ts:updateSession`
- Triggers: every request except static assets (see `middleware.ts` matcher config)
- Responsibilities: refresh the Supabase session cookie, redirect unauthenticated users to `/`, gate unapproved profiles to `/pending`, bounce approved users away from auth/holding screens to `/dashboard`; explicitly treats `/api/*` as self-authenticating and never redirects it

## Architectural Constraints

- **Threading:** Single-threaded Node.js request handling per Next.js convention; concurrency within a request/job is expressed via `Promise.all` / `Promise.allSettled`, not worker threads. Cron agents cap fan-out with an explicit `CONCURRENCY` batch size (`lib/agents/global-sync.ts:109`) to respect the 300s `maxDuration` on Vercel.
- **Global state:** None at the module level for business logic — every pipeline function receives its Supabase client as a parameter rather than importing a singleton, which is what allows the same code to run under both RLS and service-role contexts.
- **Circular imports:** None observed; dependency direction is strictly `app/` → `lib/agents|ingestion|enrichment|competitors` → `lib/connectors|documents|market-cache` → `lib/types`, with `lib/queries.ts`, `lib/metrics.ts`, `lib/canonical.ts` as leaf-level pure/read modules imported directly by `app/`.
- **Server-only boundary:** Modules that must never ship to the client import `"server-only"` as their first line (e.g. `lib/queries.ts:1`, `lib/ingestion/orchestrator.ts:1`, `lib/enrichment/enrich.ts:1`) — a build-time guard against accidentally bundling secrets/DB access into client bundles.
- **RLS as the authorization boundary:** There is no separate application-level authorization layer; every table (except reference data like `market_valuations`) is scoped by Postgres RLS policies keyed on `auth.uid()` (see `supabase/migrations/0001_init.sql:184-247`). Server actions and RSCs rely entirely on the cookie-bound client enforcing this; cron/admin code deliberately uses the service-role client to bypass it for cross-user jobs.

## Anti-Patterns

### Directly mutating tables outside `applyMappedIngest`

**What happens:** Most write paths for connector-derived data funnel through `applyMappedIngest` (`lib/ingestion/apply.ts`), but ad hoc inserts (e.g. `addValuation`, `addFundingRound` in `app/(app)/companies/actions.ts:301-358`) write directly to `valuations`/`funding_rounds` without the dedupe/timeline-guard logic.
**Why it's wrong:** Manual entries bypass `filterIngestValuations`, so a user-entered backdated/implausible valuation is never checked, while connector-sourced ones are. This is an intentional distinction (manual entry is trusted user input) but is easy to miss when adding a new write path — the guard exists exactly once and callers must remember to route through it.
**Do this instead:** Route any new *connector-or-document-derived* write through `applyMappedIngest`; only genuinely user-typed form data should insert directly, following the pattern already in `actions.ts`.

### Casting Supabase joined rows with `as unknown as X`

**What happens:** Several `lib/queries.ts` functions (`getRecentEvents:220`, `getCompanyEvents:249`, `getCompany:154`, `getCompaniesWithRelations:136`) cast the Supabase response through `as unknown as <Row>[]` because the generated/typed client can't infer the shape of `select("*, companies(name)")` joins.
**Why it's wrong:** This silently defeats type-checking on the exact rows most likely to have a shape mismatch (joined foreign tables). A schema change to `companies` (e.g. renaming `name`) would not be caught at compile time here.
**Do this instead:** Keep joins narrow and explicit (already done — selecting only `name`), and add/extend a unit test asserting the runtime shape when adding a new joined query, since the type system cannot help here.

## Error Handling

**Strategy:** Best-effort and non-throwing at every batch/loop boundary; hard failures are reserved for auth checks and required-field validation in server actions.

**Patterns:**
- Connector calls: wrapped per-connector in try/catch inside `Promise.all`, degrading the run to `status: "partial"` and collecting error strings rather than throwing (`lib/ingestion/orchestrator.ts:40-65`, `lib/agents/global-sync.ts:75-104`).
- Server actions: return an `ActionResult` object (`{ error?: string }`) rather than throwing, so client components can render inline errors without an error boundary (`app/(app)/companies/actions.ts:18-21`).
- Cron routes: catch-all try/catch returning `{ ok: false, error }` with HTTP 500, after an explicit 401 check for the bearer token (every file in `app/api/cron/*/route.ts`).
- Supabase read failures: logged via `console.error` and degrade to an empty array/null rather than throwing, so a transient DB error never crashes a page render (every function in `lib/queries.ts`).
- LLM calls (enrichment, document extraction): wrapped in try/catch with a heuristic or keyless fallback (`lib/enrichment/enrich.ts:164-171`, `lib/documents/extract.ts:144-155`).

## Cross-Cutting Concerns

**Logging:** `console.error`/`console.warn` at the call site, no structured logger. Ingestion runs are also persisted to the `ingestion_runs` table (`lib/ingestion/orchestrator.ts:98-104`) and cron summaries are returned as JSON for external log capture (Vercel).

**Validation:** Zod is a dependency (`package.json`) but the primary validation observed is hand-written (`num`/`str`/`list` coercion helpers in `app/(app)/companies/actions.ts:23-41`) plus the domain-specific timeline/source guards in `lib/enrichment/`.

**Authentication:** Supabase Auth via `@supabase/ssr`; session refresh + route gating centralized in `lib/supabase/middleware.ts`; per-request user identity obtained via `supabase.auth.getUser()` in every server action/page; admin-only actions (`app/api/admin/approve/route.ts`) use a separate token check, not user auth.

---

*Architecture analysis: 2026-07-02*
