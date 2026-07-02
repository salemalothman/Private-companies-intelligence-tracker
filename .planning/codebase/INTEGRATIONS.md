# External Integrations

**Analysis Date:** 2026-07-02

## APIs & External Services

**AI / Data Enrichment:**
- **xAI (Grok)** - `lib/connectors/grok.ts` (`GrokConnector`, 409 lines)
  - SDK: `@ai-sdk/xai` via Vercel AI SDK's `generateText`, model `xai.responses("grok-4.3")` with the native `x_search` tool (`xai.tools.xSearch()`)
  - Purpose: X/Twitter-sourced company profile, funding rounds, news, competitor discovery + valuations, single-company valuation/revenue metric, and social-signal auditing of official/founder X accounts
  - Auth: `XAI_API_KEY` env var; gated in `lib/connectors/registry.ts` — only registered when the key is present
  - Notably uses `generateText` (not `generateObject`) on purpose because server-side tools like `x_search` only execute through the text/tool API
  - Prioritizes two trusted sources baked into prompts: `@AaronGDillon`'s X post history and a specific Mailchimp campaign-archive newsletter (see `PRIORITY_SOURCES` constant)
  - Every method catches errors and degrades to `null`/`[]` rather than throwing

- **Exa (web search)** - `lib/connectors/exa.ts` (`ExaConnector` + standalone helpers, 267 lines)
  - SDK: `exa-js` 2.15.0, `searchAndContents` with `type: "auto"`, `highlights: true`
  - Purpose: web-wide (non-X) funding rounds and news (`ExaConnector`); plus standalone helpers used elsewhere: `exaValuationFor` (single valuation lookup for market-cache sweep), `exaFinancialsFor` (revenue/valuation/secondary-price sweep for manual company sync, used by `lib/agents/financials.ts`), `exaCompanyEventsFor` (corporate events, valuation mentions, secondary-market prices for `company_events`)
  - Auth: `EXA_API_KEY` env var; gated in registry and in each standalone function via a `client()` factory that returns `null` when unset
  - Parsing helpers: `lib/connectors/exa-parse.ts` (deal/valuation extraction), `lib/connectors/exa-events-parse.ts` (event classification, date/revenue/share-price parsing) — both have companion `.test.ts` files
  - Also powers the weekly market-cache sweep at `lib/market-cache/exa-sweep.ts`

- **Anthropic (Claude)** - `lib/documents/extract.ts`, `lib/enrichment/enrich.ts`
  - Direct `fetch` calls to `https://api.anthropic.com/v1/messages` (no SDK dependency — raw REST)
  - Model: `claude-haiku-4-5-20251001`
  - Purpose 1 (`lib/documents/extract.ts`): LLM-based structured extraction from uploaded PDF investor decks (funding rounds, valuations, news, competitors, revenue) — falls back to `heuristicExtract` (`lib/documents/heuristic.ts`) when `ANTHROPIC_API_KEY` is unset; supports a `llm-vision` engine path for image-based/no-text PDFs (referenced from `app/(app)/companies/document-actions.ts:187-200`)
  - Purpose 2 (`lib/enrichment/enrich.ts`): fills in missing company profile fields (sector, country, website, founded year, founders, description) for newly added companies
  - Auth: `ANTHROPIC_API_KEY` env var, sent as `x-api-key` header with `anthropic-version: 2023-06-01`
  - Gated with `if (process.env.ANTHROPIC_API_KEY)` checks at every call site; degrades to heuristic/no-op extraction otherwise

- **SEC EDGAR** - `lib/connectors/sec-edgar.ts` (`SecEdgarConnector`, 177 lines)
  - Keyless REST API: full-text search (`https://efts.sec.gov/LATEST/search-index`) filtered to Form D filings, plus direct XML fetch of primary Form D documents from `https://www.sec.gov/Archives/edgar/data/...`
  - Purpose: Regulation D (private fundraising) filings as funding rounds; minimal company profile (entity name, sector, country=US); `hasFilings()` used as a cross-reference signal for competitor validation
  - Auth: none required, but SEC mandates a contact `User-Agent` header on every request — set via `SEC_USER_AGENT` env var (e.g. `"Your Name your-email@domain.com"`); gated in registry on this var being present
  - Name-matching guards against fuzzy false positives and filters out SPV/fund vehicles filed under the company's name

- **Clearbit Logo API** - `lib/enrichment/enrich.ts` (`resolveLogo`)
  - Keyless, URL-only integration: constructs `https://logo.clearbit.com/{domain}` from the company's website domain; never fetched server-side — the `<img>` tag loads it client-side and falls back to an initial on error
  - No auth, no gating (always active); `next.config.mjs` `images.remotePatterns` set to `https://**` in part to support this

## Data Storage

**Databases:**
- Supabase Postgres (sole datastore)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL` (project URL), `NEXT_PUBLIC_SUPABASE_ANON_KEY` (RLS-enforced client key), `SUPABASE_SERVICE_ROLE_KEY` (RLS-bypassing, server-only)
  - Client: `@supabase/supabase-js` + `@supabase/ssr`
    - Browser client: `lib/supabase/client.ts` (`createBrowserClient`, anon key, RLS enforced)
    - Server client: `lib/supabase/server.ts` (`createServerClient`, cookie-bound, RLS enforced via user session)
    - Admin client: `lib/supabase/admin.ts` (`createAdminClient`, service-role key, bypasses RLS — used only in cron jobs and the admin-approve webhook)
    - Middleware client: `lib/supabase/middleware.ts` (`updateSession`) — refreshes session cookies and gates `(app)` routes behind auth + approval status on every request; forces `cache: "no-store"` on the underlying fetch to avoid stale approval-status reads
  - Schema: 19 migrations in `supabase/migrations/` (`0001_init.sql` through `0019_company_revenue.sql`) covering companies, fund analytics, ingestion runs, deal fees, competitors + revenue, news categorization, market cache, document storage policies, portfolio events, alert prefs, company events, user approval workflow, digest prefs, document diffs, company revenue

**File Storage:**
- Supabase Storage, two buckets:
  - `documents` (private, 50MB cap, `application/pdf` only) - `supabase/migrations/0010_documents_storage.sql`. Uploaded directly from the browser via a service-role-issued signed URL (bypasses the 1MB/4.5MB Server Action body limit). RLS policy `documents_rw_own` restricts access to files under a `{companyId}/` folder owned by the requesting user. Used from `app/(app)/companies/document-actions.ts`.
  - `reports` (private) - referenced in `lib/reports/digest.ts` (`REPORT_BUCKET = "reports"`); stores generated weekly digest PDFs at `{userId}/{date}-digest.pdf`

**Caching:**
- `market_cache` table (Postgres, migration `0009_market_cache.sql`) - a weekly-refreshed cache of AG Dillon/trusted-source valuation data, populated by `lib/market-cache/ingest.ts` + `exa-sweep.ts`, read via `lib/market-cache/lookup.ts`. Not a separate caching service (e.g. Redis) — no such service is used.

## Authentication & Identity

**Auth Provider:**
- Supabase Auth (email/password), via `@supabase/ssr` cookie-session integration
  - Signup: `app/(auth)/signup/`
  - Login: `app/(auth)/login/`
  - Session refresh + route gating: `lib/supabase/middleware.ts`
  - Custom admin-gated onboarding layered on top of Supabase Auth: new accounts land in `profiles.status = 'pending_approval'` (migration `0015_user_approval.sql`, trigger fix in `0016_fix_signup_trigger.sql`) and are redirected to `app/(auth)/pending/` until approved
  - Admin approval flow: `app/api/admin/approve/route.ts` — tokenized single-use link (`approval_token` column) emailed to the admin; `GET` renders a confirmation page (no mutation, so link-scanners can't auto-approve), `POST` flips `status` to `active` and burns the token
  - Hardcoded admin recipient: `ADMIN_EMAIL = "salem.alothman@gmail.com"` in `lib/auth/constants.ts`

## Monitoring & Observability

**Error Tracking:**
- None — no Sentry/Bugsnag/etc. Errors are caught per-connector/per-agent and logged via `console.error`/`console.warn`, with cron routes returning `{ ok: false, error }` JSON on failure (see any `app/api/cron/*/route.ts`)

**Logs:**
- `console.log`/`console.info`/`console.warn`/`console.error` only, relying on the hosting platform's log aggregation (Vercel)

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from `vercel.json`, `maxDuration` route segment configs sized to Vercel's serverless limits, and project memory on Vercel env vars for crons/ingestion/email)

**CI Pipeline:**
- None detected in-repo (no `.github/workflows/`)

## Environment Configuration

**Required env vars** (from `.env.local.example` and code references):
- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL (required)
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon/publishable key (required)
- `SUPABASE_SERVICE_ROLE_KEY` — server-only, bypasses RLS; used by seed script and all cron/admin routes (required for those paths)
- `XAI_API_KEY` — enables `GrokConnector` (`lib/connectors/grok.ts`); optional, connector skipped if absent
- `SEC_USER_AGENT` — enables `SecEdgarConnector`; optional, required format `"Name email@domain.com"` per SEC policy
- `EXA_API_KEY` — enables `ExaConnector` and all standalone Exa helpers; optional
- `ANTHROPIC_API_KEY` — enables LLM document extraction (`lib/documents/extract.ts`) and profile enrichment (`lib/enrichment/enrich.ts`); optional, falls back to heuristic extraction
- `RESEND_API_KEY` — enables transactional email via Resend (`lib/email/send.ts`); optional, logs instead of sending when absent
- `EMAIL_FROM` — Resend "from" address; defaults to `onboarding@resend.dev` if unset
- `CRON_SECRET` — bearer token required by all `app/api/cron/*/route.ts` handlers (`Authorization: Bearer ${CRON_SECRET}`); requests without a match get a `401`
- `NEXT_PUBLIC_SITE_URL` — referenced in project memory for building absolute URLs in onboarding-approval emails (not directly grep-confirmed in this pass, but documented as required for email flows)
- Reserved/commented in `.env.local.example` but not currently wired: `OPENAI_API_KEY` (P5/P6 AI layer placeholder)

**Secrets location:**
- `.env.local` locally (gitignored); Vercel Project Settings → Environment Variables in production (per project memory: deploy-env)

## Webhooks & Callbacks

**Incoming:**
- `app/api/admin/approve/route.ts` — tokenized approval "webhook" triggered by clicking the link in the admin notification email; `GET` shows a confirm screen, `POST` performs the mutation
- All six `app/api/cron/*/route.ts` routes function as bearer-token-gated incoming webhooks triggered by Vercel Cron (see below); also manually triggerable with the same token

**Outgoing:**
- Resend API (`https://api.resend.com/emails`) — `lib/email/send.ts`, used for: admin approval-request notifications (`lib/email/approval.ts`), weekly portfolio digest with PDF attachment (`lib/email/digest-email.ts`)

## Scheduled Jobs (Vercel Cron)

Defined in `vercel.json`; every route enforces `Authorization: Bearer ${CRON_SECRET}`, runs on Node runtime (`export const runtime = "nodejs"`), is `force-dynamic`, and capped at `maxDuration = 300` seconds:

| Schedule (UTC) | Route | Handler | Purpose |
|---|---|---|---|
| `0 13 * * 1` (Mon 13:00) | `app/api/cron/market-sync/route.ts` | `runMarketSync` (`lib/market-cache/ingest.ts`) | Refresh the market-cache valuation data from trusted sources, propagate newer figures to existing companies |
| `0 6 * * *` (daily 06:00) | `app/api/cron/daily-refresh/route.ts` | `runDailyRefresh` (`lib/agents/refresh.ts`) | Re-run ingestion (Grok + SEC + Exa) for every tracked company |
| `30 6 * * *` (daily 06:30) | `app/api/cron/news-sentiment/route.ts` | `runSentimentAgent` (`lib/agents/sentiment.ts`) | Score stored news articles with no sentiment yet |
| `0 14 * * 1` (Mon 14:00) | `app/api/cron/exa-events/route.ts` | `runExaEventsSync` (`lib/agents/exa-events.ts`) | Sweep Exa for scheduled corporate events, fresh valuations, secondary-market prices into `company_events` |
| `0 4 * * 1` (Mon 04:00) | `app/api/cron/global-sync/route.ts` | `runGlobalSync` (`lib/agents/global-sync.ts`) | Full enrichment + source-sanitization + competitor-modernization + entity-disambiguation pipeline across all companies |
| `0 8 * * 1` (Mon 08:00) | `app/api/cron/weekly-digest/route.ts` | `runWeeklyDigest` (`lib/reports/digest.ts`) | Build a per-user PDF portfolio digest, store in `reports` bucket, email via Resend |

---

*Integration audit: 2026-07-02*
