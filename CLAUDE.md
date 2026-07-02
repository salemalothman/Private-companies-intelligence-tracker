<!-- GSD:project-start source:PROJECT.md -->
## Project

**Private Companies Intelligence Tracker — Deep-Dive Analysis**

A Next.js 15 / React 19 / Supabase web app for tracking a private-company
investment portfolio: per-company valuations, funding rounds, competitor
benchmarking, news, and documents, backed by an LLM/web enrichment pipeline
(xAI/Grok, Exa, SEC EDGAR). This body of work adds a **per-company "deep-dive
analysis" layer** — an institutional-grade business/technology/competitive/
valuation analysis generated from data the app already holds — distributed across
the existing company tabs, plus a new comps-based **Valuation Targets (2026–2030)**
tab.

**Core Value:** Every generated insight is **grounded and honestly labelled** — real facts vs.
confidence-tagged estimates vs. transparent comps math — never fabricated
financials or invented probabilities.

### Constraints

- **Data integrity**: No fabricated financial data; no predictive risk metrics.
  Forward-looking content must carry `basis: fact|estimate` and
  `confidence: low|med|high`. Quantitative valuation only via transparent
  peer-multiple comps.
- **Tech stack**: Next.js 15 App Router, React 19, TypeScript, Tailwind, Supabase
  (typed client + RLS), Vitest. Match existing patterns.
- **Generation**: One structured Grok pass per company → stored JSONB; comps
  inputs (multiples, base revenue) computed in code, not by the LLM.
- **UX**: On-demand generation (separate from Sync); reuse `CollapsibleSection`
  and the design system; empty/stale states.
- **Security**: `.env.local` gitignored; never commit secrets; service-role/cron
  secrets stay in Vercel env.
- **Quality gates**: tsc clean, eslint clean, Vitest green after each phase;
  behavior-preserving for existing tabs.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.7.2 (strict mode) - entire app (`app/`, `lib/`, `components/`), config in `tsconfig.json`
- SQL - Supabase/Postgres migrations, `supabase/migrations/0001_init.sql` through `0019_company_revenue.sql`
- CSS (Tailwind utility classes) - `app/globals.css`, component files
## Runtime
- Node.js v20.18.2 (no `.nvmrc` committed; `@types/node` pinned to `^20.17.11`)
- Next.js server runtime (`export const runtime = "nodejs"` explicitly set on all cron routes and the admin-approve route, since they use `fetch`-based external APIs and the Supabase service-role client, which don't run on Edge)
- npm — `package-lock.json` present (353KB, committed)
## Frameworks
- Next.js 15.1.3 - App Router (`app/`), Server Components, Server Actions, Route Handlers
- React 19.2.7 / React DOM 19.2.7 - UI layer
- Tailwind CSS 3.4.17 - styling, config at `tailwind.config.ts`, `postcss.config.mjs`
- Radix UI primitives (`@radix-ui/react-accordion`, `-dialog`, `-dropdown-menu`, `-label`, `-select`, `-slot`, `-tabs`) - unstyled accessible components under `components/ui/`
- `class-variance-authority`, `clsx`, `tailwind-merge` - style-variant composition
- `lucide-react` 0.469.0 - icon set
- `recharts` 2.15.0 - valuation/fund charts
- `react-hook-form` 7.54.2 + `@hookform/resolvers` 3.9.1 + `zod` 3.24.1 - form state + schema validation
- Vitest 2.1.8 - unit tests, config at `vitest.config.ts` (`environment: "node"`, includes `**/*.test.ts`, path alias `@` -> repo root)
- Run via `npm run test` (single run) or `npm run test:watch`
- ESLint 8.57.1 with `eslint-config-next` 15.1.3, config `.eslintrc.json` (extends `next/core-web-vitals`; `@next/next/no-img-element` disabled)
- `tsx` 4.19.2 - runs `scripts/seed.ts` (`npm run seed`) and other TS scripts directly
- `autoprefixer` 10.4.20 / `postcss` 8.4.49 - CSS pipeline
## Key Dependencies
- `@supabase/supabase-js` 2.47.10 + `@supabase/ssr` 0.12.0 - database client, auth, storage, cookie-based SSR session handling (`lib/supabase/client.ts`, `server.ts`, `admin.ts`, `middleware.ts`)
- `ai` 6.0.211 (Vercel AI SDK) + `@ai-sdk/xai` 3.0.98 - structured `generateText` calls against xAI's `grok-4.3` responses model with the native `x_search` tool (`lib/connectors/grok.ts`)
- `exa-js` 2.15.0 - Exa web-search API client (`lib/connectors/exa.ts`)
- `pdf-lib` 1.17.1 - PDF generation (weekly digest reports, `lib/reports/digest.ts`)
- `pdf-parse` 2.4.5 - PDF text extraction from uploaded investor decks; marked `serverExternalPackages` in `next.config.mjs` because it's CJS with dynamic requires
- `ws` 8.21.0 + `@types/ws` - WebSocket polyfill (Node-side Supabase realtime dependency; see project memory on supabase/ssr version gotchas)
- `server-only` 0.0.1 - marks server-exclusive modules (connectors, email, Supabase admin client) so they can't be bundled into client code
- `zod` 3.24.1 - runtime schema validation for all connector responses (Grok JSON, ingestion payloads)
## Configuration
- `.env.local` (gitignored, present locally) / `.env.local.example` (committed template) define all runtime secrets
- Required/optional vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `XAI_API_KEY`, `SEC_USER_AGENT`, `EXA_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `CRON_SECRET` (see INTEGRATIONS.md for full table)
- Every external connector/service degrades gracefully (returns null/empty/logs) when its key is absent, rather than throwing — see `lib/connectors/registry.ts` gating pattern
- `next.config.mjs` - `images.remotePatterns` wide-open (`https://**`) for arbitrary logo/asset hosts (e.g. Clearbit); `serverExternalPackages: ["pdf-parse"]`; `experimental.serverActions.bodySizeLimit: "15mb"` (raised from the 1MB Server Action default to support PDF deck uploads — actual large uploads bypass this via signed Storage URLs, see `supabase/migrations/0010_documents_storage.sql`)
- `tsconfig.json` - `strict: true`, `target: ES2017`, `moduleResolution: "bundler"`, path alias `@/*` -> repo root
- `tailwind.config.ts` - design tokens (see project memory: design-system)
- `vercel.json` - defines all 6 cron schedules (see INTEGRATIONS.md)
## Platform Requirements
- Node 20.x
- Supabase project (cloud-hosted; local `supabase/migrations/` applied via Supabase CLI or dashboard SQL editor)
- `.env.local` populated per `.env.local.example`
- Vercel (implied by `vercel.json` cron config, `NEXT_PUBLIC_SITE_URL`/Vercel env conventions referenced in project memory, and `maxDuration = 300` route segment configs sized for Vercel's serverless function timeout)
- Supabase (Postgres + Auth + Storage) as the sole persistent datastore
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Naming Patterns
- kebab-case for all `.ts`/`.tsx` files: `collapsible-section.tsx`, `add-company-dialog.tsx`, `global-sync-button.tsx`, `sanitize-sources.ts`, `timeline-validation.ts`.
- Server Actions files are named `actions.ts` co-located with the route segment: `app/(app)/companies/actions.ts`, `app/(app)/dashboard/actions.ts`, `app/(app)/reports/actions.ts`, `app/(auth)/actions.ts`. A route with a distinct action group uses a descriptive suffix instead, e.g. `app/(app)/companies/document-actions.ts`.
- API routes always live at `route.ts` under `app/api/**` (Next.js convention), e.g. `app/api/cron/market-sync/route.ts`.
- Test files are co-located as `<module>.test.ts` next to the module they cover (never in a separate `__tests__/` tree): `lib/canonical.ts` → `lib/canonical.test.ts`.
- camelCase, verb-first for actions: `formatCurrency`, `buildCanonicalRecord`, `runMarketSync`, `enrichCompanyProfile`, `mapConnectorResults`.
- Small private helpers in Server Action files use terse one-word names scoped to the file: `num()`, `str()`, `list()` in `app/(app)/companies/actions.ts` (form-field coercion helpers, not exported).
- Predicate/lookup helpers read like the question they answer: `isTrustedSource`, `isPublisherDomain`, `isSecFiling`, `provider()`.
- camelCase for local/JS-side values (`asOf`, `postMoney`, `amountRaised`).
- snake_case is preserved for anything that mirrors a Supabase column, both in DB-facing objects and in the destructured/local scope near a query: `post_money`, `valuation_date`, `founded_year`, `realized_proceeds`. Do not camelCase these — it would create a mismatch with `lib/types.ts` and the SQL schema.
- PascalCase interfaces/types, `*Row` / `*Insert` suffix pairs for every table mirrored from Supabase: `CompanyRow` / `CompanyInsert`, `ValuationRow` / `ValuationInsert` (see `lib/types.ts`).
- Domain union types are short PascalCase string-literal unions: `Confidence = "low" | "medium" | "high"`, `CompanyStatus = "active" | "exited"`, `Sentiment = "positive" | "neutral" | "negative"`.
- Result/record shapes end in a purpose-revealing suffix, not a generic one: `CanonicalRecord`, `CanonicalField`, `EnrichedProfile`, `ActionResult`.
## Code Style
- No Prettier config file present — formatting is implicit (2-space indent, double quotes, trailing commas in multiline literals, semicolons). Match the surrounding file exactly; do not introduce a different quote style or indent width.
- Long import lists and object literals are broken one-per-line once they exceed ~80 chars.
- `eslint.config` is `.eslintrc.json` extending `next/core-web-vitals` only, with one override: `"@next/next/no-img-element": "off"` (the codebase intentionally uses `<img>` in places, e.g. for logos, instead of `next/image`).
- Run via `npm run lint` (`next lint`). No custom rule sets, no import-order plugin — ordering conventions below are by convention, not enforced.
## Import Organization
- Single alias `@/*` → project root, defined in both `tsconfig.json` (`"paths": { "@/*": ["./*"] }`) and `vitest.config.ts` (`resolve.alias["@"] = resolve(__dirname, ".")`). Always import via `@/lib/...` / `@/components/...`, never deep relative paths (`../../../lib/utils`).
## Error Handling
- Never throw to the client. Return a typed result object with an optional `error` string, e.g. `interface ActionResult { error?: string; id?: string; }` (`app/(app)/companies/actions.ts`).
- Guard auth first with a `requireUser()` helper that returns `{ supabase, user }`; every action does `if (!user) return { error: "Not authenticated." };` before touching data.
- Supabase calls are checked with `const { data, error } = await supabase...`; on `error`, return `{ error: error.message }` (or a friendlier fixed string) rather than throwing.
- Best-effort enrichment calls are wrapped in `try { ... } catch { return {}; }` so an external API failure (Exa, Grok) degrades gracefully instead of failing the whole action (see `enrichCompany` in `app/(app)/companies/actions.ts`).
- Auth via a shared-secret bearer check at the top of the handler: `if (!secret || request.headers.get("authorization") !== \`Bearer ${secret}\`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` (cron routes only — see `app/api/cron/market-sync/route.ts`).
- Business logic wrapped in `try { ... } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }`. Always return JSON with an `ok: boolean` discriminator.
- Long-running/DB-writing cron routes explicitly set `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`, and `export const maxDuration = 300` — copy this triad for any new long-running route.
- Prefer returning `null`/`undefined`/empty-array sentinels over throwing for "no data" cases (e.g. `formatCurrency` returns `"—"` for null/undefined/NaN rather than throwing).
- Parsers return partial/empty result objects (`{ valuation: undefined, amountRaised: undefined, round: undefined }`) instead of throwing when no match is found — see `extractDeal` in `lib/connectors/exa-parse.ts`.
## Logging
- No `console.log` conventions enforced; avoid adding ad hoc logging to `lib/` pure functions. If diagnostics are needed for a long job, persist to the DB (`ingestion_runs.detail`) rather than console-only logging, so failures are inspectable after a cron run.
## Comments
- Every non-trivial `lib/` function has a one-line or short JSDoc-style block explaining *why*, not *what* — especially when a design choice trades off a "more correct" alternative. Example, `lib/utils.ts`:
- Inline comments explain non-obvious business rules with concrete numbers, e.g. `lib/canonical.ts`: `const AGREE = 0.15; // within 15% → corroborates` and `const DIVERGE = 0.25; // beyond 25% → conflict`.
- File-level doc comments at the top of `lib/*.ts` modules describe the module's contract in 2-4 sentences (see `lib/canonical.ts`, `lib/types.ts`).
- Used liberally on exported functions and exported types/interfaces in `lib/`, sparingly in `components/`. Prop-level comments are used to flag cross-cutting constraints, e.g. in `components/dashboard/collapsible-section.tsx`:
## Function Design
## Module Design
## Design System — "Premium Minimal Flat"
- `--background` / `--foreground`: near-white / near-black ink (`0 0% 100%` / `224 24% 8%`) — this is the "ink-on-white" base.
- `--border`: `220 16% 92%` — a hairline, not a heavy divider. Use `border` (1px) not `border-2`.
- `--primary`: near-black ink action color (`224 24% 10%`), not a saturated brand blue — the brand accent (`--brand`, `221 83% 53%`) is used sparingly (focus rings, emphasis), never as the default button color.
- `--success` / `--destructive`: muted, not neon (`152 56% 36%` green, `0 72% 45%` red). Always apply at reduced opacity in UI (`bg-success/15 text-success`), matching the `Badge` `success`/`destructive` variants in `components/ui/badge.tsx`.
- Dark mode variants exist under `.dark` but the app is primarily used in light mode; when adding a new color, always add both light and dark HSL values.
- `.tabular-nums` — `font-variant-numeric: tabular-nums` + `font-feature-settings: "tnum"`. **Apply this to every financial figure** (currency, percent, multiples) so columns of numbers don't jitter when digits change width. Seen throughout: `text-2xl font-semibold tabular-nums` in `components/company/provenance.tsx`.
- `.label-eyebrow` — `text-[11px] font-medium uppercase tracking-wider text-muted-foreground`. Use for small section/column labels (see the `CollapsibleSection` trigger in `components/dashboard/collapsible-section.tsx`).
- `touch-action: manipulation` globally on interactive elements to drop the 300ms tap delay.
- `.pt-safe` / `.pb-safe` / `.pb-mobilenav` utilities reserve safe-area insets for notched iPhones and the fixed mobile tab bar — use these instead of hardcoded padding on any fixed top/bottom chrome.
## Fact/Estimate + Confidence Provenance Pattern
- `SourceObservation { source, value, date }` — one raw reported figure.
- `CanonicalField { value, asOf, observations, corroboration, conflict }` — the merged/canonical figure plus its lineage.
- `CanonicalRecord { valuation, revenue, multiple, sources }` — the full merged record for a company, built by `buildCanonicalRecord(company, inputs)`.
- Canonical value = most recent dated observation, **preferring trusted publishers** (`isTrustedSource`) over unverified/aggregator sources — an unverified figure must never win over a verified one even if it's newer. See the `trusted`/`pool` selection in `field()` in `lib/canonical.ts`.
- `provider(source)` normalizes a raw source string (e.g. `"grok:x:social"`, `"pdf:xyz"`, `"url:xyz"`) down to a stable provider key (`"grok"`, `"document"`, `"web"`, `"agdillon"`, `"sec-edgar"`, `"aggregate"`, `"unverified"`, or a bare publisher domain). Always route new source strings through this function rather than comparing raw strings.
- This layer is **observational only — no risk scoring** (explicit doc comment in `lib/canonical.ts`). Do not add subjective scoring logic here; keep it to corroboration counts and a boolean conflict flag.
- UI must always show: the canonical value, its `asOf` date, a corroboration/conflict badge, and the list of underlying `observations` with per-source badges (see `FieldCard` in `components/company/provenance.tsx`) — never show a number without its provenance trail in this part of the app.
- Separately, `ValuationRow`/`ValuationInsert` in `lib/types.ts` carries an explicit `confidence: Confidence` (`"low" | "medium" | "high"`) field — this is a simpler, single-source confidence tag distinct from the multi-source `CanonicalField` corroboration model. Use `confidence` when persisting a single valuation row's reliability; use `CanonicalField`/`corroboration` when reconciling multiple sources for display.
## Server vs. Client Component Boundaries
- Default to Server Components. Only add `"use client"` when the file needs hooks (`useState`, `useEffect`, `react-hook-form`), event handlers, or a Radix primitive that forwards refs.
- Server Actions (`"use server"` files under `app/**/actions.ts`) are the only place that calls `createClient()` from `@/lib/supabase/server` directly from route-level code; pages call these actions, they don't inline Supabase queries in Client Components.
- Icon props are a common boundary trap: `LucideIcon` values use `forwardRef`, which cannot cross the server→client boundary as a prop. Any shared component accepting an `icon` prop (e.g. `CollapsibleSection` in `components/dashboard/collapsible-section.tsx`) is itself `"use client"`, and its comment explicitly warns: "Consumers passing an icon must be client components."
- Admin/service-role Supabase access (`lib/supabase/admin.ts`) is guarded with the `server-only` package import (`import "server-only";`) at the top of the file — this makes any accidental client-side import a build-time error. Follow this pattern for any new trusted-only module.
## Typed Supabase Client Conventions
| File | Function | Key | Use case |
|---|---|---|---|
| `lib/supabase/server.ts` | `createClient()` (async) | anon key + cookies | Server Components / Server Actions, RLS-enforced via user session |
| `lib/supabase/client.ts` | `createClient()` | anon key | Client Components, RLS-enforced via user session |
| `lib/supabase/admin.ts` | `createAdminClient()` | service-role key | Trusted server-only contexts only (cron/sync jobs) — bypasses RLS, guarded by `import "server-only"` |
- All three are generic over `Database` from `@/lib/types`: `createServerClient<Database>(...)`, `createBrowserClient<Database>(...)`, `createClient<Database>(...)`. Never call an untyped Supabase client — always import `Database` and parametrize.
- `lib/types.ts` is **hand-maintained** to mirror `supabase/migrations`, not auto-generated in the normal workflow (there's a documented escape hatch: `supabase gen types typescript`, but the file header says it's hand-maintained). When adding/changing a column, update both the migration and `lib/types.ts` `*Row`/`*Insert` pair together.
- `lib/types.ts` types are standalone interfaces (no self-referential `Database[...]` lookups) specifically so TypeScript resolves the schema cleanly — don't refactor these into a nested `Database["public"]["Tables"][...]` shape.
- The server client's `setAll` cookie writer is wrapped in `try {} catch {}` with a comment: safe to ignore when called from a Server Component while middleware refreshes the session. Preserve this try/catch if touching `lib/supabase/server.ts`.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## System Overview
```text
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
- **Pipeline composition over inheritance.** Agents (`lib/agents/*`) compose smaller, independently-testable stages (ingest → competitors → financials → disambiguation → sanitize) rather than one monolithic function.
- **Best-effort, isolated failures.** Every multi-company or multi-connector loop treats each unit as independent — one company's or one connector's failure degrades the run status to `"partial"` but never aborts the batch (see `lib/ingestion/orchestrator.ts:40-65`, `lib/agents/global-sync.ts:75-104`).
- **Pure-function core, thin I/O shell.** Reconciliation (`lib/canonical.ts`), ranking (`lib/competitors/rank.ts`), metrics (`lib/metrics.ts`), and dedupe (`lib/ingestion/dedupe.ts`) are dependency-free pure functions unit-tested in isolation; all Supabase I/O is isolated to `apply.ts`, `orchestrator.ts`, `queries.ts`, and the agents.
- **Provenance-first data model.** Nearly every fact (valuation, revenue, competitor row) carries a `source`/`basis` string; the canonical layer explicitly tracks corroboration and conflict rather than silently overwriting.
- **Connector interface as an extension seam.** `lib/connectors/types.ts` defines `DataConnector`; new sources plug into `lib/connectors/registry.ts` gated on an env var, with zero changes to ingestion or UI code.
## Layers
- Purpose: route composition, layout, auth gating, tab assembly for the UI
- Location: `app/(app)/**`, `app/(auth)/**`, `app/api/**`
- Contains: React Server Components (pages), Server Actions (`actions.ts` files), Route Handlers (`route.ts`)
- Depends on: `lib/queries.ts` (reads), `lib/metrics.ts`, `lib/canonical.ts`, `lib/ingestion/*`, `lib/agents/*` (writes/triggers)
- Used by: end users (browser) and Vercel Cron (bearer-token requests)
- Purpose: all business logic — data acquisition, reconciliation, validation, reporting
- Location: `lib/*` subdirectories
- Contains: orchestration functions, pure transformation functions, connector clients
- Depends on: `lib/connectors/*` (external fetch), `lib/supabase/*` (DB access passed in as a typed client), `lib/types.ts`
- Used by: server actions, cron route handlers, other agents (e.g. `global-sync` calls `financials`, `competitors/refresh`, `disambiguation`)
- Purpose: isolate every external data source behind one interface
- Location: `lib/connectors/types.ts` (contract), `lib/connectors/{grok,exa,sec-edgar,stub}.ts` (implementations), `lib/connectors/registry.ts` (selection)
- Contains: HTTP calls to xAI Grok, Exa search API, SEC EDGAR Form D full-text search, and a keyless stub
- Depends on: env vars (`XAI_API_KEY`, `EXA_API_KEY`, `SEC_USER_AGENT`) to gate availability
- Used by: `lib/ingestion/orchestrator.ts`, `lib/enrichment/enrich.ts`, `lib/competitors/discover.ts`
- Purpose: turn raw multi-source rows into one trustworthy, UI-ready number
- Location: `lib/canonical.ts`, `lib/competitors/rank.ts`, `lib/metrics.ts`
- Contains: pure functions only, all unit-tested (`lib/canonical.test.ts`, `lib/competitors/rank.test.ts`)
- Depends on: `CompanyWithRelations` / `CompetitorRow` shapes from `lib/types.ts`
- Used by: `app/(app)/companies/[id]/page.tsx`, `app/(app)/dashboard/page.tsx`, `app/(app)/fund/page.tsx`
- Purpose: single place for every Supabase read; three client constructors for the three trust contexts
- Location: `lib/queries.ts`, `lib/supabase/{server,admin,client,middleware}.ts`
- Contains: `createClient()` (cookie-bound, RLS-enforced, for server components/actions), `createAdminClient()` (service-role, for cron jobs), browser client (for client components), `updateSession()` (middleware auth gate)
- Depends on: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
- Used by: every page, server action, and cron route
## Data Flow
### Primary Request Path — company detail page
### Secondary Flow — on-demand sync ("Sync data" button)
### Background Flow — weekly global sync (cron)
- No client-side global store. All state is server-derived per request; client components (`"use client"`, e.g. `components/company/sync-button.tsx`) hold only local UI state (loading, dialog open/closed) and call server actions, then rely on `revalidatePath` to refresh server-rendered data.
- The only "cache" is the `market_valuations` table (`lib/market-cache/`), refreshed weekly by cron — a deliberate reference-data cache, not a request cache.
## Key Abstractions
- Purpose: uniform contract for any external data source — profile, funding rounds, news, optional competitors/valuation-metric/social-signals
- Examples: `lib/connectors/grok.ts` (xAI Grok X/Twitter search), `lib/connectors/exa.ts` (Exa web search), `lib/connectors/sec-edgar.ts` (SEC Form D filings), `lib/connectors/stub.ts` (keyless placeholder)
- Pattern: strategy pattern selected at runtime by `lib/connectors/registry.ts` based on which env keys are set; ingestion code never branches on connector identity
- Purpose: represent one reconciled fact (valuation or revenue) with full source lineage — every observation, a corroboration count, and a conflict flag
- Examples: built once per company detail page render (`buildCanonicalRecord`), consumed by `components/company/provenance.tsx` and the header stat cards
- Pattern: reduce-to-canonical with trust preference (`isTrustedSource` filters before picking most-recent) and a time-window check (`WINDOW_MS = 120 days`) so historical rounds are never mistaken for present-day disagreement
- Purpose: the DB-ready intermediate shape between raw connector output and `applyMappedIngest`
- Examples: `mapConnectorResults(batch)` produces `{ fundingRounds, valuations, news, profilePatch }`
- Pattern: pure aggregation + dedupe stage, isolated from all I/O so it is directly unit-testable (`lib/ingestion/map.ts` has no test file itself, but `dedupe.ts`/`orchestrator.ts` are tested around it)
- Purpose: an orchestrated, multi-stage job that composes lower-level pipeline functions and is safe to invoke from either a server action or a cron route
- Examples: `runDailyRefresh` (ingestion only), `runGlobalSync` (ingestion + competitors + financials + disambiguation + events + timeline validation + source sanitization), `runExaEventsSync`, `runSentimentAgent`
- Pattern: every agent takes a Supabase client as its first argument (`DB = SupabaseClient<Database>`) so the same function runs under RLS (button-triggered, current user only) or service-role (cron, all users)
- Purpose: turn newly-ingested facts into a deduped, preference-filtered activity feed entry
- Pattern: built once per ingest, deduped both against prior events (composite key `type|title|occurred_at`) and the table's unique index, so repeated daily/weekly runs are idempotent
## Entry Points
- Location: `app/(app)/companies/[id]/page.tsx`
- Triggers: navigation to `/companies/[id]`
- Responsibilities: fetch company + competitors + market valuation + documents; run all pure derivations (metrics, canonical, dedupe, ranking); render the 8-tab UI
- Location: `app/(app)/dashboard/page.tsx`
- Triggers: navigation to `/dashboard` (also the post-login/approval redirect target, see `lib/supabase/middleware.ts:80-84`)
- Responsibilities: portfolio-level aggregates via `lib/metrics.ts` (`portfolioSummary`, `sectorAllocation`, `topPerformers`, `latestValuationChanges`, `portfolioValueSeries`), activity feed, events calendar
- Triggers: form submissions and button clicks from client components (`"use server"` directive)
- Responsibilities: auth check (`requireUser`/`authed`), validate input, write via the cookie-bound Supabase client, best-effort trigger ingestion/enrichment, `revalidatePath` affected routes
- Triggers: Vercel Cron schedule (see `vercel.json`) sending `Authorization: Bearer ${CRON_SECRET}`; also manually triggerable with the same token
- Responsibilities: validate the bearer token, instantiate `createAdminClient()` (service role — bypasses RLS, covers all users), invoke exactly one agent, return a JSON summary
- Runtime config: every cron route pins `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 300`
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
### Casting Supabase joined rows with `as unknown as X`
## Error Handling
- Connector calls: wrapped per-connector in try/catch inside `Promise.all`, degrading the run to `status: "partial"` and collecting error strings rather than throwing (`lib/ingestion/orchestrator.ts:40-65`, `lib/agents/global-sync.ts:75-104`).
- Server actions: return an `ActionResult` object (`{ error?: string }`) rather than throwing, so client components can render inline errors without an error boundary (`app/(app)/companies/actions.ts:18-21`).
- Cron routes: catch-all try/catch returning `{ ok: false, error }` with HTTP 500, after an explicit 401 check for the bearer token (every file in `app/api/cron/*/route.ts`).
- Supabase read failures: logged via `console.error` and degrade to an empty array/null rather than throwing, so a transient DB error never crashes a page render (every function in `lib/queries.ts`).
- LLM calls (enrichment, document extraction): wrapped in try/catch with a heuristic or keyless fallback (`lib/enrichment/enrich.ts:164-171`, `lib/documents/extract.ts:144-155`).
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| supabase | "Use when doing ANY task involving Supabase. Triggers: Supabase products (Database, Auth, Edge Functions, Realtime, Storage, Vectors, Cron, Queues); client libraries and SSR integrations (supabase-js, @supabase/ssr) in Next.js, React, SvelteKit, Astro, Remix; auth issues (login, logout, sessions, JWT, cookies, getSession, getUser, getClaims, RLS); Supabase CLI or MCP server; schema changes, migrations, security audits, Postgres extensions (pg_graphql, pg_cron, pg_vector)." | `.agents/skills/supabase/SKILL.md` |
| supabase-postgres-best-practices | Postgres performance optimization and best practices from Supabase. Use this skill when writing, reviewing, or optimizing Postgres queries, schema designs, or database configurations. | `.agents/skills/supabase-postgres-best-practices/SKILL.md` |
| ui-ux-pro-max | "UI/UX design intelligence for web and mobile. Includes 50+ styles, 161 color palettes, 57 font pairings, 161 product types, 99 UX guidelines, and 25 chart types across 10 stacks (React, Next.js, Vue, Svelte, SwiftUI, React Native, Flutter, Tailwind, shadcn/ui, and HTML/CSS). Actions: plan, build, create, design, implement, review, fix, improve, optimize, enhance, refactor, and check UI/UX code. Projects: website, landing page, dashboard, admin panel, e-commerce, SaaS, portfolio, blog, and mobile app. Elements: button, modal, navbar, sidebar, card, table, form, and chart. Styles: glassmorphism, claymorphism, minimalism, brutalism, neumorphism, bento grid, dark mode, responsive, skeuomorphism, and flat design. Topics: color systems, accessibility, animation, layout, typography, font pairing, spacing, interaction states, shadow, and gradient. Integrations: shadcn/ui MCP for component search and examples." | `.agents/skills/ui-ux-pro-max/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
