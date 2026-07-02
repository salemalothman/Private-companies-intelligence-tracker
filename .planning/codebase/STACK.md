# Technology Stack

**Analysis Date:** 2026-07-02

## Languages

**Primary:**
- TypeScript 5.7.2 (strict mode) - entire app (`app/`, `lib/`, `components/`), config in `tsconfig.json`

**Secondary:**
- SQL - Supabase/Postgres migrations, `supabase/migrations/0001_init.sql` through `0019_company_revenue.sql`
- CSS (Tailwind utility classes) - `app/globals.css`, component files

## Runtime

**Environment:**
- Node.js v20.18.2 (no `.nvmrc` committed; `@types/node` pinned to `^20.17.11`)
- Next.js server runtime (`export const runtime = "nodejs"` explicitly set on all cron routes and the admin-approve route, since they use `fetch`-based external APIs and the Supabase service-role client, which don't run on Edge)

**Package Manager:**
- npm — `package-lock.json` present (353KB, committed)

## Frameworks

**Core:**
- Next.js 15.1.3 - App Router (`app/`), Server Components, Server Actions, Route Handlers
- React 19.2.7 / React DOM 19.2.7 - UI layer
- Tailwind CSS 3.4.17 - styling, config at `tailwind.config.ts`, `postcss.config.mjs`
- Radix UI primitives (`@radix-ui/react-accordion`, `-dialog`, `-dropdown-menu`, `-label`, `-select`, `-slot`, `-tabs`) - unstyled accessible components under `components/ui/`
- `class-variance-authority`, `clsx`, `tailwind-merge` - style-variant composition
- `lucide-react` 0.469.0 - icon set
- `recharts` 2.15.0 - valuation/fund charts
- `react-hook-form` 7.54.2 + `@hookform/resolvers` 3.9.1 + `zod` 3.24.1 - form state + schema validation

**Testing:**
- Vitest 2.1.8 - unit tests, config at `vitest.config.ts` (`environment: "node"`, includes `**/*.test.ts`, path alias `@` -> repo root)
- Run via `npm run test` (single run) or `npm run test:watch`

**Build/Dev:**
- ESLint 8.57.1 with `eslint-config-next` 15.1.3, config `.eslintrc.json` (extends `next/core-web-vitals`; `@next/next/no-img-element` disabled)
- `tsx` 4.19.2 - runs `scripts/seed.ts` (`npm run seed`) and other TS scripts directly
- `autoprefixer` 10.4.20 / `postcss` 8.4.49 - CSS pipeline

## Key Dependencies

**Critical:**
- `@supabase/supabase-js` 2.47.10 + `@supabase/ssr` 0.12.0 - database client, auth, storage, cookie-based SSR session handling (`lib/supabase/client.ts`, `server.ts`, `admin.ts`, `middleware.ts`)
- `ai` 6.0.211 (Vercel AI SDK) + `@ai-sdk/xai` 3.0.98 - structured `generateText` calls against xAI's `grok-4.3` responses model with the native `x_search` tool (`lib/connectors/grok.ts`)
- `exa-js` 2.15.0 - Exa web-search API client (`lib/connectors/exa.ts`)
- `pdf-lib` 1.17.1 - PDF generation (weekly digest reports, `lib/reports/digest.ts`)
- `pdf-parse` 2.4.5 - PDF text extraction from uploaded investor decks; marked `serverExternalPackages` in `next.config.mjs` because it's CJS with dynamic requires
- `ws` 8.21.0 + `@types/ws` - WebSocket polyfill (Node-side Supabase realtime dependency; see project memory on supabase/ssr version gotchas)

**Infrastructure:**
- `server-only` 0.0.1 - marks server-exclusive modules (connectors, email, Supabase admin client) so they can't be bundled into client code
- `zod` 3.24.1 - runtime schema validation for all connector responses (Grok JSON, ingestion payloads)

## Configuration

**Environment:**
- `.env.local` (gitignored, present locally) / `.env.local.example` (committed template) define all runtime secrets
- Required/optional vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `XAI_API_KEY`, `SEC_USER_AGENT`, `EXA_API_KEY`, `RESEND_API_KEY`, `EMAIL_FROM`, `ANTHROPIC_API_KEY`, `CRON_SECRET` (see INTEGRATIONS.md for full table)
- Every external connector/service degrades gracefully (returns null/empty/logs) when its key is absent, rather than throwing — see `lib/connectors/registry.ts` gating pattern

**Build:**
- `next.config.mjs` - `images.remotePatterns` wide-open (`https://**`) for arbitrary logo/asset hosts (e.g. Clearbit); `serverExternalPackages: ["pdf-parse"]`; `experimental.serverActions.bodySizeLimit: "15mb"` (raised from the 1MB Server Action default to support PDF deck uploads — actual large uploads bypass this via signed Storage URLs, see `supabase/migrations/0010_documents_storage.sql`)
- `tsconfig.json` - `strict: true`, `target: ES2017`, `moduleResolution: "bundler"`, path alias `@/*` -> repo root
- `tailwind.config.ts` - design tokens (see project memory: design-system)
- `vercel.json` - defines all 6 cron schedules (see INTEGRATIONS.md)

## Platform Requirements

**Development:**
- Node 20.x
- Supabase project (cloud-hosted; local `supabase/migrations/` applied via Supabase CLI or dashboard SQL editor)
- `.env.local` populated per `.env.local.example`

**Production:**
- Vercel (implied by `vercel.json` cron config, `NEXT_PUBLIC_SITE_URL`/Vercel env conventions referenced in project memory, and `maxDuration = 300` route segment configs sized for Vercel's serverless function timeout)
- Supabase (Postgres + Auth + Storage) as the sole persistent datastore

---

*Stack analysis: 2026-07-02*
