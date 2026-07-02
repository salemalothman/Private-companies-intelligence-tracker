-- External grounding cache — the storage substrate for Phase 4 ingestion. Three
-- source-tagged tables populated by a local/cron Node script via the service-role
-- admin client (which bypasses RLS by design); the Next.js app only READS them.
-- Every row records `source`, `fetched_at`, and its originating identifier so
-- re-runs overwrite by a natural key (idempotent upsert). No factual numeric
-- column is zero-defaulted — real facts stay nullable, nothing is fabricated.

-- peer_financials (ING-02): public-peer XBRL income facts from sec-edgar, keyed
-- by CIK + fiscal period. Shared reference data (public companies, public SEC
-- filings) — authenticated-read like market_valuations, no per-owner scoping and
-- no user_id; writes happen only through the service-role sync job.
create table if not exists public.peer_financials (
  id uuid primary key default gen_random_uuid(),
  cik text not null,                     -- SEC CIK of the public peer
  ticker text,
  entity_name text,
  fiscal_period text not null,           -- period label (e.g. FY2024 or fiscal-end date)
  revenue numeric,                       -- real XBRL income facts — nullable, never zeroed
  net_income numeric,
  gross_profit numeric,
  operating_income numeric,
  currency text,
  source text not null default 'sec-edgar',
  source_url text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (cik, fiscal_period)            -- natural key for idempotent upsert
);

create index if not exists peer_financials_cik_idx
  on public.peer_financials (cik);

alter table public.peer_financials enable row level security;

-- Read-only for authenticated users (comps queries read it); writes happen only
-- through the service-role client in the ingestion script.
drop policy if exists peer_financials_read on public.peer_financials;
create policy peer_financials_read on public.peer_financials
  for select using (auth.role() = 'authenticated');

-- form_d_rounds (ING-03): SEC Form D rounds + startup signals from company-goat,
-- per portfolio company / named competitor. Per-owner data — owner-scoped RLS
-- mirroring company_analysis; the RLS user client writes rows scoped to
-- auth.uid(), the service-role admin client bypasses RLS by design.
create table if not exists public.form_d_rounds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject text not null,                 -- resolved entity name the round belongs to
  cik text,
  accession text,                        -- EDGAR accession number
  offering_amount numeric,               -- real Form D figures — nullable, never zeroed
  amount_sold numeric,
  filing_date date,
  exemption text,
  related_persons jsonb not null default '[]'::jsonb,  -- named persons on the filing
  signals jsonb not null default '{}'::jsonb,          -- github/HN/legitimacy signals
  source text not null default 'company-goat',
  source_url text,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, subject, accession)  -- natural key for idempotent upsert
);

create index if not exists form_d_rounds_company_idx
  on public.form_d_rounds (company_id);

alter table public.form_d_rounds enable row level security;

drop policy if exists form_d_rounds_all_own on public.form_d_rounds;
create policy form_d_rounds_all_own on public.form_d_rounds
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- x_posts (ING-04): X/Twitter posts from x-twitter, per company / competitor.
-- Per-owner data — owner-scoped RLS identical to form_d_rounds. The tweet id
-- (post_id) is the idempotency anchor.
create table if not exists public.x_posts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject text not null,                 -- company / competitor name the handle maps to
  handle text,
  post_id text not null,                 -- tweet id — the idempotency anchor
  text text,
  author text,
  posted_at timestamptz,
  url text,
  metrics jsonb not null default '{}'::jsonb,  -- likes/reposts/replies etc.
  source text not null default 'x-twitter',
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, post_id)           -- natural key for idempotent upsert
);

create index if not exists x_posts_company_idx
  on public.x_posts (company_id);

alter table public.x_posts enable row level security;

drop policy if exists x_posts_all_own on public.x_posts;
create policy x_posts_all_own on public.x_posts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
