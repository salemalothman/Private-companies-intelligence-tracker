# Phase 4: External Grounding Ingestion - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Source:** Approved design spec + Printing Press tool evaluation (decision: "Both" / all 3 sources in v1)

<domain>
## Phase Boundary

Stand up an ingestion pipeline that syncs **real external grounding** into Supabase
so `runDeepDive` (Phase 1) and downstream tabs are backed by verifiable sources
rather than the LLM alone. Three sources, all via the installed Printing Press CLIs:
- **company-goat** — SEC Form D rounds + startup signals (private targets + competitors)
- **sec-edgar** — public-peer XBRL income facts (real peer revenue/margins for comps)
- **x-twitter** — company + competitor news/posts (news + sentiment)

**Architecture constraint (hard):** these are LOCAL CLIs that write local SQLite —
the Vercel serverless runtime CANNOT run them. The ingestion is therefore a
**local/cron Node script** (in `scripts/`, run manually or on a scheduled machine)
that shells out to each CLI in `--agent` JSON mode, parses stdout, and **upserts
source-tagged rows into Supabase via the service-role admin client**. The Next.js
app only ever READS the cached Supabase rows. This mirrors the market-cache pattern
but runs off-Vercel.

**Out of this phase:** rendering the ingested data into new UI (Overview §2/§6 and
the Valuation Targets tab consume it in Phases 2/3/5); auto-scheduling/backfill
beyond a runnable script; the comps tab itself (Phase 5).
</domain>

<decisions>
## Implementation Decisions

### Pipeline shape (ING-01, ING-06)
- One local Node script, e.g. `scripts/ingest-grounding.ts`, invoked manually or by
  an external cron (documented, NOT a Vercel cron). Uses the service-role admin
  client (`lib/supabase/admin.ts`).
- Each source runs its CLI with `--agent` (= `--json --compact --no-input --no-color --yes`),
  parses the `{meta, results}` envelope, and upserts.
- Idempotent + source-tagged: every cached row records `source`, `fetched_at`, and
  the originating identifier (CIK / handle / domain). Re-runs overwrite by natural key.
- Guardrail preserved: cached facts are stored with their real source; nothing is
  fabricated. Secrets via env only (`X_BEARER_TOKEN`, `COMPANY_PP_CONTACT_EMAIL`,
  optional `GITHUB_TOKEN`) — never committed.

### sec-edgar — public-peer XBRL (ING-02)
- Resolve public peers to CIK: `sec-edgar-pp-cli companies lookup <TICKER> --json`.
- Cache income-statement XBRL facts: `sec-edgar-pp-cli facts statement --cik <CIK> --kind income --periods last4 --json`
  → real revenue/margins for the peer.
- Optionally `cross-section --tag us-gaap:Revenues --ticker A,B,… --periods last8`
  for peer-revenue pivots feeding comps multiples.
- Only PUBLIC peers have XBRL — private portfolio targets will have none; that's
  expected. Store into a `peer_financials` (or similar) cache keyed by CIK+period.

### company-goat — Form D + startup signals (ING-03)
- Per portfolio company + competitor (by domain): `company-goat-pp-cli funding --domain <d> --json`
  and/or `snapshot --domain <d> --json`.
- **CIK disambiguation is mandatory**: EDGAR full-text matches name fragments
  (Replit returned small ambiguous amounts). When `is_ambiguous`/`cik_summaries`
  appears, re-call `funding --cik <id>` with the correct entity before caching.
- Cache Form D rounds (offering amount, filing date, exemption, related persons) +
  key signals (GitHub activity, HN mentions, legitimacy) keyed by company.

### x-twitter — news/sentiment (ING-04)
- Auth: app-only bearer token for public reads — `x-twitter-pp-cli auth set-bearer-token <t>`
  or `X_BEARER_TOKEN` env. Preflight with `doctor --json` (check `auth_lanes.app_only_api`).
- Sync company + competitor posts: `x-twitter-pp-cli sync --resources tweets --since <window>`
  (or recent-search), scoped by company/competitor handles + keywords.
- Cache into a posts/news table; feed the existing News tab + sentiment agent.
- Read-only — never post/reply/quote.

### runDeepDive integration (ING-05)
- Extend `runDeepDive`'s grounding gather (Phase 1, `lib/agents/deep-dive.ts`) to
  ALSO read the cached ingested rows (Form D rounds, peer XBRL, recent X news) and
  include them in the Grok prompt context, with source attribution. Generated
  fields cite real Form D / XBRL / X sources; guardrail unchanged (comps in code).

### Storage
- New Supabase migration adding the cache tables (peer_financials, form_d_rounds,
  x_posts or similar — exact schema is Claude's discretion), with the same
  owner-scoping/service-role pattern as existing per-company tables. Register in
  the hand-maintained `lib/types.ts`. A `[BLOCKING]` `supabase db push` checkpoint
  applies the migration to the live DB (same as Phase 1).

### Claude's Discretion
- Exact cache table schemas + names, natural keys, and migration filename.
- Script structure, per-source module layout, and how companies/competitors are
  enumerated (from the companies + competitors tables).
- Exact CLI invocation flags/windows and error/rate-limit handling per source.
- Whether x-twitter uses `sync` vs recent-search; the sentiment wiring reuse.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & tool knowledge (authoritative)
- `docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md` — feature design.
- `.planning/PROJECT.md` — guardrails, constraints.
- `.planning/REQUIREMENTS.md` — ING-01..06 detail.
- Printing Press tool commands + auth + the local-CLI→cron→Supabase constraint are
  documented in the project memory `printing-press-cli-tools.md` and the library docs:
  printingpress.dev/library/{developer-tools/sec-edgar, developer-tools/company-goat,
  social-and-messaging/x-twitter}.

### Existing patterns to follow (from codebase map)
- `.planning/codebase/ARCHITECTURE.md`, `CONVENTIONS.md`, `INTEGRATIONS.md`.
- `lib/market-cache/` + `app/api/cron/market-sync/route.ts` — the cache/sync pattern
  (note: this ingestion runs OFF-Vercel because it shells to local CLIs).
- `lib/supabase/admin.ts` — service-role client for the script.
- `lib/agents/deep-dive.ts` — `runDeepDive` grounding gather to extend (ING-05).
- `lib/connectors/sec-edgar.ts` — existing SEC connector (complements pp-sec-edgar).
- `lib/agents/sentiment.ts`, `lib/news/` — news + sentiment wiring for x-twitter.
- `lib/types.ts` — register new cache tables.
- `supabase/migrations/0020_company_analysis.sql` — RLS/migration pattern to mirror;
  next migration is `0021_...`.
- `scripts/seed.ts` — existing standalone script pattern.
</canonical_refs>

<specifics>
## Specific Ideas
- Preflight each CLI with `--version` / `doctor` before a run; skip a source cleanly
  if its auth/binary is missing (x-twitter without a token → skip, don't fail the run).
- company-goat/sec-edgar are FREE (User-Agent email only); x-twitter needs the paid
  bearer token — make x-twitter opt-in via presence of `X_BEARER_TOKEN`.
- Always disambiguate CIK before trusting Form D amounts.
</specifics>

<deferred>
## Deferred Ideas
- Rendering ingested data into UI (Overview/Competitors/Valuation — Phases 2/3/5).
- Auto-scheduling/backfill, insider-cluster / 13F / industry-bench signals (v2).
- AUTO-01/02 (auto-regen, version history).
</deferred>

---

*Phase: 04-external-grounding-ingestion*
*Context gathered: 2026-07-02*
