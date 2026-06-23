# Private Portfolio Intelligence Tracker

A private-market portfolio tracker for investors (angels, VCs, family offices, PE,
corporates) to track **private** companies — companies with no public market data.
Record investments, monitor valuation changes and funding rounds, and estimate
portfolio performance. Answers: *"What is my private portfolio worth today, and why
did it change?"*

Target feel: a private-market Bloomberg / Carta / PitchBook.

## Status — Slice 1 (MVP foundation) ✅

This repo currently implements the **core portfolio loop** (phases P0–P3):

- **Auth** — Supabase email/password with per-user Row Level Security isolation
- **Dashboard** — summary cards (portfolio value, invested, unrealized gain, return %),
  latest valuation changes, charts (valuation growth, sector allocation, top performers,
  risk matrix), and the full portfolio company table
- **Company detail** — tabbed: overview, investment history, valuation timeline chart,
  funding-round tracker, news, all with manual entry dialogs
- **Fund Analysis** — deal-by-deal analytics table (entry date, holding yrs, entry
  valuation, implied/latest price, shares, current/total value, gain/loss, MOIC, gross
  IRR, % of cost, initial ownership), a TOTAL/FUND row, and editable fee assumptions
  (carry % + management fee %) with a net-of-fees "Net to LPs" summary
- **Metrics** — pure, unit-tested portfolio + fund math (`lib/metrics.ts`)
- **Connector seam** — `lib/connectors` interface + stub, ready for live data in P4

### Roadmap (later phases — each gets its own spec → plan → build)

| Phase | Scope | External deps |
|-------|-------|---------------|
| P4 | Ingestion engine: Crunchbase / SEC EDGAR / news / Twitter connectors | paid API keys |
| P5 | PDF intelligence: upload → OCR → LLM extract → review → DB | LLM + OCR |
| P6 | AI agents: Valuation / News-sentiment / Risk (replaces heuristic risk score) | LLM |
| P7 | Scheduled automation: daily fetch, weekly intelligence report | cron |

## Tech stack

- Next.js 15 (App Router, TypeScript, Server Actions) · React 19
- Tailwind CSS + shadcn-style UI components · Recharts
- Supabase: Postgres, Auth, Storage (reserved P5), pgvector (reserved P6)
- Vitest for unit tests

## Getting started

```bash
npm install

# Configure Supabase — copy and fill in keys from your Supabase project:
cp .env.local.example .env.local

# Apply the schema (already applied to the configured project). To re-apply
# elsewhere, run supabase/migrations/0001_init.sql against your database.

# Seed a demo portfolio (creates demo@portfolio.app / demo123456):
npm run seed

npm run dev      # http://localhost:3000
npm run build    # production build + typecheck
npm run test     # unit tests
```

### Demo login

After `npm run seed`:

- **Email:** `demo@portfolio.app`
- **Password:** `demo123456`

(5 sample companies: OpenAI, Anthropic, Stripe, Databricks, Ramp.)

> **Auth note:** Supabase email confirmation is ON by default, so interactive signup
> requires email confirmation before sign-in. For a frictionless demo, either use the
> seeded demo user or disable "Confirm email" in Supabase → Authentication → Providers.

## Project structure

```
app/(auth)/          login + signup pages and auth server actions
app/(app)/           authenticated shell: dashboard, companies, company detail
app/(app)/companies/actions.ts   CRUD server actions (RLS-enforced)
components/ui/        shadcn-style primitives
components/dashboard/ summary cards, charts, company table
components/company/   detail dialogs, valuation timeline, overview editor
lib/metrics.ts        pure portfolio calculations (unit-tested)
lib/supabase/         browser/server/middleware clients
lib/connectors/       external-source interface + stub (live in P4)
supabase/migrations/  database schema + RLS policies
scripts/seed.ts       demo data seeder
```

## Security

- Every table has RLS enabled; all rows are scoped to `auth.uid()`. Verified: a second
  tenant sees 0 of another user's companies and is blocked (403) from writing to them.
- The service-role key is used only by `scripts/seed.ts` (server-side) and is never
  exposed to the client.
