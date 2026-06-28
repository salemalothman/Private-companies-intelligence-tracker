-- Portfolio activity feed. Material changes detected by the ingestion pipeline
-- (new funding rounds, valuation moves, contract wins, new competitors) are
-- recorded here so the dashboard can surface a "what changed" feed + unseen
-- alerts, and the weekly digest can summarize notable activity.
create table if not exists public.portfolio_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null,                  -- funding_round | valuation | contract_win | competitor
  title text not null,
  detail text,
  source text,
  occurred_at date,                    -- the event's own date (e.g. round date)
  seen boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_events_user_idx
  on public.portfolio_events (user_id, created_at desc);
-- Idempotency guard: the ingestion pipeline re-runs daily, so skip duplicates.
create unique index if not exists portfolio_events_dedupe
  on public.portfolio_events (company_id, type, title, coalesce(occurred_at, '1970-01-01'));

alter table public.portfolio_events enable row level security;
drop policy if exists portfolio_events_all_own on public.portfolio_events;
create policy portfolio_events_all_own on public.portfolio_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
