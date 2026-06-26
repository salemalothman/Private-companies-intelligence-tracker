-- Global market-intelligence cache. A weekly background job parses the trusted
-- private-market sources (AG Dillon archive, etc.) and upserts the latest
-- valuation / revenue figure per company here. Shared reference data — readable
-- by any authenticated user, written only by the service-role sync job.
create table if not exists public.market_valuations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  name_key text not null unique,        -- normalized name for matching
  valuation numeric,                    -- latest implied/round valuation (USD)
  valuation_date date,                  -- as-of for the valuation figure
  revenue numeric,                      -- latest revenue / ARR (USD)
  revenue_basis text,
  source text not null default 'agdillon',
  source_url text,
  as_of date,                           -- issue date the figure was published
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists market_valuations_name_idx
  on public.market_valuations (name_key);

alter table public.market_valuations enable row level security;

-- Read-only for authenticated users (competitor discovery queries it); writes
-- happen only through the service-role client in the scheduled job.
drop policy if exists market_valuations_read on public.market_valuations;
create policy market_valuations_read on public.market_valuations
  for select using (auth.role() = 'authenticated');

-- Observability for the weekly sync job.
create table if not exists public.market_sync_runs (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'agdillon',
  cached int not null default 0,        -- rows upserted into the cache
  updated int not null default 0,       -- existing companies whose records were updated
  status text not null default 'success',
  detail text,
  created_at timestamptz not null default now()
);

alter table public.market_sync_runs enable row level security;
drop policy if exists market_sync_runs_read on public.market_sync_runs;
create policy market_sync_runs_read on public.market_sync_runs
  for select using (auth.role() = 'authenticated');
