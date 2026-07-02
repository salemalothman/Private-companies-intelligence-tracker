# Codebase Structure

**Analysis Date:** 2026-07-02

## Directory Layout

```
Private-Companies-tracking-system/
├── app/                          # Next.js App Router: routes, layouts, server actions, API handlers
│   ├── (app)/                    # Authenticated route group (behind middleware auth gate)
│   │   ├── companies/
│   │   │   ├── [id]/page.tsx     # Company detail page (8-tab view)
│   │   │   ├── actions.ts        # Server actions: CRUD, sync, enrich, competitors
│   │   │   ├── document-actions.ts # Data-room upload → extract → diff → apply
│   │   │   └── page.tsx          # Companies list page
│   │   ├── dashboard/
│   │   │   ├── actions.ts
│   │   │   └── page.tsx          # Portfolio-level dashboard
│   │   ├── fund/page.tsx         # Fund-level analytics view
│   │   ├── reports/
│   │   │   ├── actions.ts
│   │   │   └── page.tsx          # Generated PDF digest list
│   │   └── layout.tsx            # Sidebar + mobile nav shell, auth redirect
│   ├── (auth)/                   # Public route group: login, signup, pending approval
│   │   ├── actions.ts
│   │   ├── login/page.tsx
│   │   ├── pending/page.tsx
│   │   └── signup/page.tsx
│   ├── api/
│   │   ├── admin/approve/route.ts        # Token-gated onboarding approval webhook
│   │   └── cron/                         # Vercel Cron entry points (bearer-token gated)
│   │       ├── daily-refresh/route.ts    # -> lib/agents/refresh.ts
│   │       ├── exa-events/route.ts       # -> lib/agents/exa-events.ts
│   │       ├── global-sync/route.ts      # -> lib/agents/global-sync.ts
│   │       ├── market-sync/route.ts      # -> lib/market-cache/ingest.ts
│   │       ├── news-sentiment/route.ts   # -> lib/agents/sentiment.ts
│   │       └── weekly-digest/route.ts    # -> lib/reports/digest.ts
│   ├── globals.css
│   ├── layout.tsx                # Root HTML layout
│   └── page.tsx                  # Public landing / login entry
├── components/                   # React components, grouped by feature area
│   ├── app/                      # Shell chrome: sidebar, mobile nav, logo, page header
│   ├── auth/                     # Auth form
│   ├── company/                  # Company-detail-page widgets (dialogs, provenance, data room, etc.)
│   ├── dashboard/                # Dashboard widgets (charts, tables, calendar, activity feed)
│   ├── fund/                     # Fund analytics table
│   ├── reports/                  # Reports view
│   └── ui/                       # Design-system primitives (Radix-based): button, card, dialog, tabs...
├── lib/                          # All domain logic, pipelines, and data access
│   ├── agents/                   # Multi-stage orchestrated jobs (composed for cron + on-demand)
│   ├── auth/                     # Auth-related constants
│   ├── competitors/              # Competitor discovery, ranking, refresh
│   ├── connectors/                # External data source clients + shared interface
│   ├── documents/                # PDF/URL document intelligence pipeline
│   ├── email/                    # Transactional email (approval, digest)
│   ├── enrichment/                # Cross-source data-quality guards (disambiguation, sanitize, timeline)
│   ├── ingestion/                 # Connector-result mapping, dedupe, DB apply, orchestration
│   ├── market-cache/              # Weekly market-valuation reference-data cache
│   ├── news/                     # News classification (contract-win detection)
│   ├── reports/                  # PDF digest generation
│   ├── supabase/                  # Supabase client constructors (server/admin/browser/middleware)
│   ├── canonical.ts               # Cross-source reconciliation (valuation/revenue → canonical record)
│   ├── metrics.ts                 # Pure portfolio/deal/fund financial calculations
│   ├── queries.ts                 # All Supabase reads for server components
│   ├── types.ts                   # Hand-maintained DB types (mirrors supabase/migrations)
│   └── utils.ts                   # Formatting helpers (currency, date, percent, cn)
├── supabase/
│   └── migrations/                # Sequential numbered SQL migrations (0001–0019)
├── scripts/                       # One-off / operational tsx scripts (seed, market-sync, sync-company, test-connectors)
├── docs/
│   └── superpowers/specs/         # Project specs
├── .agents/skills/                # Project skill definitions (supabase, ui-ux-pro-max, etc.)
├── .claude/skills/                # Claude-specific skill mirror
├── .planning/codebase/            # Generated codebase-map documents (this file's directory)
├── public/                        # Static assets
├── middleware.ts                  # Root middleware — delegates to lib/supabase/middleware.ts
├── next.config.mjs
├── tailwind.config.ts
├── vitest.config.ts
├── vercel.json                    # Cron schedule definitions
└── package.json
```

## Directory Purposes

**`app/(app)/`:**
- Purpose: every authenticated screen and its server actions
- Contains: `page.tsx` (RSC), `actions.ts` / `document-actions.ts` (`"use server"` files, colocated with the route that uses them)
- Key files: `app/(app)/companies/[id]/page.tsx` (most complex page — assembles 8 tabs), `app/(app)/companies/actions.ts` (largest action file — CRUD + sync + enrich)

**`app/(auth)/`:**
- Purpose: unauthenticated flows — login, signup, pending-approval holding page
- Contains: `actions.ts` (signup/login server actions), one `page.tsx` per screen

**`app/api/cron/`:**
- Purpose: scheduled job entry points, one route per agent, all following an identical shape (bearer-token check → invoke one agent → JSON summary)
- Contains: `route.ts` files only, no page components
- Key files: every route pins `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`

**`components/company/`:**
- Purpose: widgets specific to the company detail page's tabs and dialogs
- Contains: `provenance.tsx` (renders `CanonicalRecord`), `data-room.tsx`, `valuation-timeline.tsx`, `entity-dialogs.tsx` (Add Investment/Valuation/FundingRound/News dialogs), `sync-button.tsx`, `business-model-analysis.tsx`

**`components/ui/`:**
- Purpose: design-system primitives wrapping Radix UI (accordion, dialog, dropdown-menu, select, tabs) plus plain styled elements (button, card, input, table, badge)
- Contains: one file per primitive, all client-safe, no domain logic

**`lib/agents/`:**
- Purpose: top-level orchestrated jobs — the only `lib/` modules that cron routes call directly
- Contains: `refresh.ts` (daily ingestion), `global-sync.ts` (full weekly pipeline), `exa-events.ts` (events sweep), `financials.ts` (temporal financial verification), `sentiment.ts` (news sentiment scoring)

**`lib/ingestion/`:**
- Purpose: the pipeline that turns raw connector output into DB rows
- Contains: `orchestrator.ts` (fan-out + coordinate), `map.ts` (pure aggregate/dedupe), `apply.ts` (idempotent DB writer + activity events), `dedupe.ts` (row-collapsing heuristics used both at ingest-time and at render-time for display)

**`lib/enrichment/`:**
- Purpose: data-quality guards applied across the whole dataset, not tied to one ingest run
- Contains: `disambiguation.ts` (wrong-entity signal filtering), `sanitize-sources.ts` (generic-label → publisher-domain resolution), `timeline-validation.ts` (backdated/hallucinated valuation guard, used both at write-time in `apply.ts` and as a full-DB sweep in `global-sync.ts`), `enrich.ts` (Add Company form auto-fill)

**`lib/connectors/`:**
- Purpose: one file per external data source, all implementing `DataConnector` from `types.ts`
- Contains: `grok.ts` (xAI Grok X/Twitter search — profile, rounds, news, competitors, social signals), `exa.ts` (Exa web search), `exa-parse.ts` / `exa-events-parse.ts` (response parsing helpers), `sec-edgar.ts` (SEC Form D filings), `stub.ts` (keyless fallback), `registry.ts` (env-gated selection)

**`lib/market-cache/`:**
- Purpose: a separate, global (non-per-user) reference-data cache of company valuations from trusted publishers (AG Dillon list + Exa sweep)
- Contains: `ingest.ts` (weekly cron entry, `runMarketSync`), `parse.ts` (source-list parsing, `nameKey` normalization used by `lib/queries.ts:getMarketValuation`), `sources.ts` (trusted source URLs), `exa-sweep.ts`, `lookup.ts`

**`lib/documents/`:**
- Purpose: the data-room document-intelligence pipeline (PDF/URL ingestion, independent of the connector pipeline)
- Contains: `fetch-url.ts` (fetch + readable-text extraction for URLs), `clean.ts` (PDF text cleanup / readability check), `extract.ts` (LLM or LLM-vision or heuristic entity extraction), `heuristic.ts` (keyless regex-based extraction fallback), `diff.ts` (compare extracted entities against the prior document for the same company)

**`lib/competitors/`:**
- Purpose: competitive-landscape discovery and ranking, separate from the core ingestion pipeline because it targets a different table (`competitors`) with additive-merge semantics
- Contains: `discover.ts`, `refresh.ts` (`refreshCompetitorsFor`, called from both the on-demand sync action and `global-sync`), `rank.ts` (pure ranking/multiple calculation, tested)

**`lib/reports/`, `lib/email/`:**
- Purpose: weekly PDF digest generation and delivery
- Contains: `reports/digest.ts` (`runWeeklyDigest`, builds and stores a per-user PDF in the `reports` storage bucket), `email/{approval,digest-email,send}.ts` (Resend-based transactional email)

**`lib/supabase/`:**
- Purpose: the only place that constructs a Supabase client; every other module receives a client as a parameter or imports one of these constructors
- Contains: `server.ts` (`createClient()` — cookie-bound, RLS), `admin.ts` (`createAdminClient()` — service role), `client.ts` (browser client for client components), `middleware.ts` (`updateSession` — session refresh + route gating)

**`supabase/migrations/`:**
- Purpose: the source of truth for the database schema, applied sequentially
- Contains: 19 numbered `.sql` files (`0001_init.sql` through `0019_company_revenue.sql`); `lib/types.ts` is hand-maintained to mirror these
- Generated: No — hand-authored SQL
- Committed: Yes

**`scripts/`:**
- Purpose: operational/dev scripts run via `tsx` (see `package.json` `"seed"` script), not part of the Next.js build
- Contains: `seed.ts`, `market-sync.ts`, `sync-company.ts`, `test-connectors.ts` — useful for manually invoking a pipeline stage against real data during development

**`.agents/skills/`, `.claude/skills/`:**
- Purpose: project-level skill definitions consumed by Claude Code (Supabase best practices, UI/UX design system)
- Generated: No
- Committed: Yes

## Key File Locations

**Entry Points:**
- `app/layout.tsx`: root HTML shell
- `app/(app)/layout.tsx`: authenticated shell (sidebar, mobile nav), redirects to `/login` if unauthenticated
- `app/(app)/companies/[id]/page.tsx`: company detail page — the most data-dense page in the app
- `app/api/cron/*/route.ts`: six cron entry points, each invoking exactly one `lib/agents/*` (or `lib/market-cache/ingest.ts` / `lib/reports/digest.ts`) function
- `middleware.ts`: request-level auth gate (delegates to `lib/supabase/middleware.ts`)

**Configuration:**
- `next.config.mjs`: Next.js build config
- `tailwind.config.ts`: design tokens (see design-system memory doc for token locations)
- `vitest.config.ts`: test runner config
- `vercel.json`: cron schedule definitions
- `.env.local` / `.env.local.example`: environment variables (never read contents — see forbidden files policy)
- `tsconfig.json`: path aliases (`@/*` → repo root)

**Core Logic:**
- `lib/canonical.ts`: cross-source reconciliation — the single place that decides "what is the real valuation/revenue"
- `lib/metrics.ts`: every financial calculation (portfolio, deal, fund) — pure, dependency-free, unit-tested
- `lib/queries.ts`: every Supabase read used by server components
- `lib/ingestion/orchestrator.ts` + `lib/ingestion/apply.ts`: the write path for connector-derived facts
- `lib/agents/global-sync.ts`: the most complex single orchestration — six stages across every company

**Testing:**
- Co-located `*.test.ts` files next to the module they test (e.g. `lib/canonical.test.ts`, `lib/metrics.test.ts` is notably absent but `lib/ingestion/orchestrator.test.ts`, `lib/ingestion/dedupe.test.ts`, `lib/connectors/exa.test.ts`, `lib/enrichment/*.test.ts`, `lib/documents/*.test.ts`, `lib/competitors/rank.test.ts` exist)
- Run via `npm test` (`vitest run`) or `npm run test:watch`

## Naming Conventions

**Files:**
- React Server Component pages: always `page.tsx`, inside the route-segment directory (`app/(app)/companies/[id]/page.tsx`)
- Server actions: `actions.ts` (or a descriptive prefix like `document-actions.ts`) with a top-of-file `"use server"` directive, colocated with the route
- Route handlers: `route.ts` inside the endpoint's directory (`app/api/cron/daily-refresh/route.ts`)
- Pure logic modules: lowercase, hyphenated where multi-word (`sanitize-sources.ts`, `timeline-validation.ts`, `exa-events-parse.ts`)
- Tests: `<module-name>.test.ts` co-located in the same directory as the module

**Directories:**
- Route groups use parentheses to avoid affecting the URL path: `(app)`, `(auth)`
- Dynamic segments use brackets: `[id]`
- `lib/` subdirectories are named after the domain concern, not the technology (`enrichment/`, `ingestion/`, `agents/` — not `services/` or `utils/`)
- `components/` subdirectories mirror the page/feature they belong to (`company/`, `dashboard/`, `fund/`, `reports/`), with `ui/` reserved for generic design-system primitives

**Types/Functions:**
- DB row types: `<Entity>Row` (e.g. `CompanyRow`, `ValuationRow`) in `lib/types.ts`, with a convenience alias dropping the `Row` suffix (`Company`, `Valuation`)
- Pure derivation functions: verb-first or noun-phrase matching what they compute (`companyInvested`, `currentValue`, `buildCanonicalRecord`, `buildCompetitorRanking`)
- Agent entry points: `run<Thing>` (`runDailyRefresh`, `runGlobalSync`, `runMarketSync`, `runSentimentAgent`, `runWeeklyDigest`, `runExaEventsSync`)

## Where to Add New Code

**New page/route:**
- Authenticated: add a directory under `app/(app)/` with a `page.tsx`; add an `actions.ts` beside it for any server actions specific to that route
- Public: add under `app/(auth)/`
- New cron job: add `app/api/cron/<name>/route.ts` following the existing bearer-token-check + single-agent-call template (copy `app/api/cron/daily-refresh/route.ts` as the shape), add the corresponding `run<Thing>` function under `lib/agents/` (or a dedicated `lib/<domain>/` if it doesn't fit an existing agent), and register the schedule in `vercel.json`

**New external data source:**
- Implement `DataConnector` from `lib/connectors/types.ts` in a new `lib/connectors/<source>.ts` file
- Register it in `lib/connectors/registry.ts`, gated on a new env var following the existing `if (process.env.X_API_KEY) connectors.push(...)` pattern
- No changes needed to `lib/ingestion/orchestrator.ts`, `lib/ingestion/map.ts`, or any UI — they operate purely on the `DataConnector` interface

**New enrichment/data-quality guard:**
- Add a new module under `lib/enrichment/`, export a pure "scan" function plus (if it should run at write-time too) a filter function
- Wire the full-DB sweep version into `lib/agents/global-sync.ts` alongside the existing `validateAllTimelines` / `sanitizeAllSources` calls
- Wire any write-time guard into `lib/ingestion/apply.ts` following the `filterIngestValuations` pattern

**New per-company UI tab:**
- Add a new `<TabsTrigger>` / `<TabsContent>` pair in `app/(app)/companies/[id]/page.tsx`
- If the tab needs its own data, add a query function to `lib/queries.ts` and fetch it alongside the existing `Promise.all` in the page body (`page.tsx:95-99`)
- If the tab needs its own dialogs/widgets, add them under `components/company/`

**New financial metric:**
- Add a pure function to `lib/metrics.ts` (no I/O, take `CompanyWithRelations` or `CompanyWithRelations[]` as input), and add a matching case to whichever test file covers metrics
- Consume it directly from the page/component that needs it — metrics functions are called inline in RSCs, not wrapped in a service class

**Utilities:**
- Shared formatting/helpers: `lib/utils.ts` (currency, date, percent formatting, `cn` class merger)
- Shared types: `lib/types.ts` (DB row shapes) — update this file whenever a new migration changes the schema

## Special Directories

**`.planning/codebase/`:**
- Purpose: generated codebase-map documents (this file and its siblings: ARCHITECTURE.md, STACK.md, INTEGRATIONS.md, CONVENTIONS.md, TESTING.md, CONCERNS.md as produced)
- Generated: Yes (by the map-codebase tooling)
- Committed: Yes

**`.next/`:**
- Purpose: Next.js build output
- Generated: Yes
- Committed: No (gitignored)

**`supabase/migrations/`:**
- Purpose: schema history, applied in filename order
- Generated: No (hand-authored)
- Committed: Yes

**`node_modules/`:**
- Generated: Yes
- Committed: No

---

*Structure analysis: 2026-07-02*
