# Automated Investment Intelligence — System Architecture (P4–P7)

This document architects the automated intelligence layer on top of the existing
portfolio tracker (P0–P3): the **ingestion engine**, **PDF intelligence pipeline**,
**AI agents**, and **scheduled automation**. It states what is **live today** (keyless),
what is **scaffolded**, and what requires **external keys / budget** to activate.

## Principles

- **One seam per concern.** External sources hide behind `DataConnector`; the UI and
  orchestrator never know which source produced a row. Same for agents (LLM provider
  hidden behind an agent interface) and email (provider hidden behind a notifier).
- **Degrade gracefully.** No connector, agent, or job may break the core app. Missing
  keys → that source is simply skipped; a connector error → `partial` run, logged.
- **Idempotent writes.** Every pipeline dedupes against existing rows so re-runs and
  daily syncs never create duplicates.
- **RLS everywhere.** All writes go through the user's session client; per-user policies
  already enforce tenant isolation. Background jobs use a scoped service path (below).
- **Provenance + observability.** Every ingested row carries a `source`; every pipeline
  run is logged to `ingestion_runs`.

## System context

```
                         ┌─────────────────────────────────────────────┐
   Add company  ───────► │  Ingestion Orchestrator  (lib/ingestion)     │
   (server action)       │   getConnectors() → fan-out → map → dedupe   │
   Manual "Sync data"    └───────┬───────────────┬───────────────┬──────┘
   Daily cron                    │               │               │
                          ┌──────▼─────┐  ┌───────▼──────┐ ┌──────▼──────┐
                          │ Crunchbase │  │  SEC EDGAR   │ │ News / X    │   DataConnector
                          │ connector  │  │  connector   │ │ connectors  │   implementations
                          └──────┬─────┘  └───────┬──────┘ └──────┬──────┘
                                 └───────────────┬┴───────────────┘
                                                 ▼
   PDF upload ──► OCR ──► LLM extract ──►  ┌─────────────┐   AI agents (P6)
   (P5 pipeline)                           │  Postgres   │◄─ valuation / sentiment / risk
                                           │  (Supabase) │      write back: risk_score,
   Weekly cron ──► report builder ──► email│  + RLS      │      valuations, news.sentiment
                                           └──────┬──────┘
                                                  ▼
                                     Dashboard · Fund Analysis · Company detail
```

---

## A. Automated Ingestion Engine (P4)

**Trigger.** On `createCompany` the server action calls `ingestCompany()` synchronously
(stub is instant). A manual **Sync data** button and the daily cron call the same
function. For slow live connectors this becomes a background job (see *Queue*).

**Connector interface** (`lib/connectors/types.ts`) — already built:
```ts
interface DataConnector {
  id: string;
  fetchCompanyProfile(query): Promise<ConnectorCompanyProfile | null>;
  fetchFundingRounds(query): Promise<ConnectorFundingRound[]>;
  fetchNews(query): Promise<ConnectorNewsItem[]>;
}
```

**Registry** (`lib/connectors/registry.ts`) returns enabled connectors, key-gated:

| Connector | Source | Auth | Fetches | Notes |
|-----------|--------|------|---------|-------|
| `stub` ✅ live | mock | none | profile, rounds, news | always on; powers the keyless demo |
| `crunchbase` | Crunchbase API | `CRUNCHBASE_API_KEY` (paid) | funding rounds, investors, profile, industry | rate-limited; cache by entity id |
| `sec-edgar` | SEC EDGAR | keyless, requires `SEC_USER_AGENT` | Form D filings, offering amounts | free; parse `data.sec.gov` submissions JSON |
| `news` | Google News / NewsAPI / RSS | `NEWS_API_KEY` or RSS (keyless) | funding/M&A/leadership headlines | feeds → titles + summaries |
| `twitter` | Twitter/X API v2 | `TWITTER_BEARER` (paid) | company/founder/investor posts | filtered stream or recent-search |

**Orchestrator** (`lib/ingestion/orchestrator.ts`) — already built:
1. Fan out to every enabled connector (`Promise.all` per connector; per-connector try/catch).
2. `mapConnectorResults()` (pure, unit-tested): dedupe rounds by name, **synthesize a
   valuation point** from each round with date+valuation (this is what populates the
   timeline + MOIC), dedupe news by title, merge profile fields.
3. Dedupe against existing DB rows, insert only new `funding_rounds` / `valuations` /
   `news`, backfill **empty** company profile fields (never overwrite user input).
4. Log a row to `ingestion_runs` (`source`, `status`, `items_found`, `detail`).

**Queue (for live connectors).** Synchronous fan-out is fine for the stub. For paid APIs
with latency/rate limits, move to a job queue so `createCompany` returns instantly:
- **Option A (recommended): Supabase Edge Function + `pg_cron`/`pg_net`** — enqueue a row
  in a `jobs` table; a worker edge function drains it.
- **Option B: Vercel Queue / Inngest / Trigger.dev** — managed durable workflows with
  retries and backoff. Best when fan-out grows (per-source jobs, partial retries).
Either way the orchestrator body is unchanged — only the *invocation* moves off-request.

---

## B. PDF Intelligence Pipeline (P5)

Turns uploaded investor reports / decks / statements into structured rows.

```
Upload (Supabase Storage)  ──►  OCR (text + tables)  ──►  LLM structured extract
   documents.status='pending'        if scanned PDF          (schema-constrained)
        │                                                          │
        └────────────► documents.extracted_data (jsonb) ◄──────────┘
                                     │  human review (low-confidence fields)
                                     ▼
                 commit → valuations / funding_rounds / company fields
```

- **Upload & storage.** `documents` table already exists (`file_path`, `type`,
  `extracted_data jsonb`, `status`). Files go to a private Supabase Storage bucket;
  RLS + signed URLs gate access.
- **OCR.** Native-text PDFs: parse directly (`pdf-parse` / LlamaParse). Scanned PDFs:
  OCR via **LlamaParse** (tables-aware) or AWS Textract / Google Document AI.
- **LLM extraction.** Anthropic `claude-opus-4-8` (or a cheaper tier per doc size) with a
  **constrained JSON schema** (tool/`response_format`) extracting: valuation (pre/post),
  revenue, ARR, customers, growth, round, amount, investors, date — each with a
  `confidence`. RAG over long docs via **pgvector** chunk retrieval.
- **Commit with review.** High-confidence fields auto-commit; low-confidence ones surface
  in a review UI before writing. Provenance: `source = 'pdf:<doc id>'`.
- **Endpoint shape.** `POST /api/documents/:id/extract` (route handler) runs OCR→LLM→write;
  invoked on upload and re-runnable. Long docs → background job (same queue as P4).

**Needs:** `ANTHROPIC_API_KEY` (+ optional `LLAMAPARSE_API_KEY`), a Storage bucket, and
`pgvector` (Supabase extension) for RAG.

---

## C. AI Agents (P6)

Three agents, each an interface with a deterministic fallback (works keyless) and an
LLM-backed implementation. They **write back** into the same tables the UI already reads,
so no UI change is required.

| Agent | Reads | Produces | Writes to |
|-------|-------|----------|-----------|
| **Valuation** | funding history, sector comps, revenue multiples, growth | low / expected / high range | `valuations` (source `agent:valuation`, low confidence) |
| **News Sentiment** | `news.title/summary` | `positive` / `neutral` / `negative` + reason | `news.sentiment` |
| **Risk** | runway, down-rounds, founder changes, staleness, competition | score 0–100 + factors | `companies.risk_score` |

- **Interface.** `interface Agent<I,O> { run(input: I): Promise<O> }`. The Risk agent's
  *heuristic* already exists in `lib/metrics.ts#riskScore` — it becomes the keyless
  fallback; the LLM version augments it with qualitative signals.
- **LLM layer.** Anthropic Messages API with tool-use for structured output; prompts
  versioned; outputs validated (zod) before write. An **eval harness** (golden set of
  companies → expected ranges/labels) guards regressions — this is where `/gsd:ai-integration-phase`
  and `eval-review` fit.
- **Determinism & cost.** Cache agent outputs keyed by input hash; re-run only when inputs
  change (new round/news). Sentiment batches multiple headlines per call.

**Needs:** `ANTHROPIC_API_KEY` + a small eval dataset.

---

## D. Scheduled Automation (P7)

**Daily sync** and **weekly report** via cron.

- **Scheduler.**
  - *Vercel Cron* → hits `GET /api/cron/daily` and `/api/cron/weekly` (protected by a
    `CRON_SECRET` header), or
  - *Supabase `pg_cron` + `pg_net`* calling an Edge Function (keeps it inside Supabase).
- **Daily** (`/api/cron/daily`): for every company, run `ingestCompany()` (refresh rounds/
  news/valuations), then the sentiment + risk agents; detect valuation changes. Iterate
  per user so RLS context is correct, **or** run as service-role with explicit
  `user_id`/`company_id` scoping (never a blanket service-role write without scoping).
- **Weekly** (`/api/cron/weekly`): build a per-user **intelligence report** (portfolio
  value Δ, top movers, new rounds, risk flags, sentiment shifts) → render HTML → send via
  email.
- **Email.** Provider behind a `Notifier` interface; **Resend** (`RESEND_API_KEY`) +
  React Email templates recommended. Store sends in a `report_runs` table for idempotency
  (don't double-send on retry).

**Background auth pattern.** Cron has no user session. Use the **service-role** client but
always filter by `company_id` / `user_id` and write provenance — i.e., treat it as a
trusted job that *acts on behalf of* a user, never bypassing scoping logic. The seed script
(`scripts/seed.ts`) already demonstrates the service-role + explicit-scoping pattern.

**Needs:** `CRON_SECRET`, `RESEND_API_KEY` (or SMTP), and the deploy target's scheduler.

---

## Cross-cutting

### Data model deltas
- ✅ **Live now:** `ingestion_runs` (run log, RLS-scoped). `news`/`documents` tables and
  `news.sentiment` / `companies.risk_score` columns already exist from P1.
- **P5/P6:** enable `pgvector`; add `document_chunks(embedding vector)` for RAG; add
  `agent_runs` (cache + audit) mirroring `ingestion_runs`.
- **P7:** `report_runs(user_id, period, sent_at, status)` for idempotent emails.

### Security & secrets
- All new tables RLS-scoped to `auth.uid()`. Background jobs scope by id explicitly.
- Secrets server-only (`ANTHROPIC_API_KEY`, `CRUNCHBASE_API_KEY`, `TWITTER_BEARER`,
  `RESEND_API_KEY`, `CRON_SECRET`) — never `NEXT_PUBLIC_*`. Cron routes verify `CRON_SECRET`.
- Treat all external + LLM-extracted text as untrusted; validate (zod) before persisting;
  never execute instructions returned by a connector or document (prompt-injection guard).

### Cost (order-of-magnitude, live)
- Crunchbase: paid plan. Twitter/X API: paid tier. SEC EDGAR + RSS: free.
- LLM: dominant variable cost — PDF extraction (per doc) + agents (per company/day).
  Mitigate with caching, batching, cheaper tiers for small inputs, and input-hash skip.
- Email: Resend free tier covers low volume.

### Failure handling
- Per-connector try/catch → `partial` run; surfaced in `ingestion_runs.detail`.
- Queue/cron: retries with exponential backoff; idempotent writes make retries safe.
- LLM: schema-validate; on invalid output, retry once then fall back to heuristic/skip.

---

## Build status & phased plan

| Phase | Capability | Status | To activate |
|-------|-----------|--------|-------------|
| **P4** | Ingestion trigger on add + orchestrator + dedupe + run log + Sync button | ✅ **Live (keyless, stub source)** | add real connectors to the registry + their keys |
| P4+ | Live Crunchbase / SEC / News / Twitter connectors | scaffolded (registry seam) | API keys; implement `DataConnector` per source |
| P4+ | Off-request job queue | designed | Inngest/Trigger.dev or Supabase Edge + pg_cron |
| **P5** | PDF upload → OCR → LLM → review → commit | designed | `ANTHROPIC_API_KEY`, Storage bucket, pgvector |
| **P6** | Valuation / sentiment / risk agents (risk heuristic already live) | designed (interfaces) | `ANTHROPIC_API_KEY` + eval set |
| **P7** | Daily cron sync + weekly email report | designed | `CRON_SECRET`, `RESEND_API_KEY`, scheduler |

Each phase is an independent spec → plan → execute cycle (GSD). Recommended order:
**P4 live connectors → P6 agents → P5 PDF → P7 automation** (agents add the most
"intelligence" per unit effort and reuse data P4 already collects).

## Required environment (when activating)
```
# P4 live connectors
CRUNCHBASE_API_KEY=        # paid
SEC_USER_AGENT=            # "you@firm.com Sample App" (keyless, required by SEC)
NEWS_API_KEY=              # or RSS feeds (keyless)
TWITTER_BEARER=            # paid
# P5 / P6 AI
ANTHROPIC_API_KEY=
LLAMAPARSE_API_KEY=        # optional, scanned-PDF OCR
# P7 automation
CRON_SECRET=
RESEND_API_KEY=
```
