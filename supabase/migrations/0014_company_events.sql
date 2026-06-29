-- Calendar of company events fetched from the web (Exa): scheduled corporate
-- events (future-dated), fresh valuation mentions, and secondary-market share
-- prices. The dashboard splits these into Upcoming (event_date >= today) and a
-- historical timeline (event_date < today).
create table if not exists public.company_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  type text not null default 'corporate', -- corporate | valuation | secondary
  title text not null,
  detail text,
  event_date date,
  value numeric,            -- valuation (USD) or secondary share price, when known
  source text,
  url text,
  created_at timestamptz not null default now()
);

create index if not exists company_events_user_date_idx
  on public.company_events (user_id, event_date);
create unique index if not exists company_events_dedupe
  on public.company_events (company_id, type, title, coalesce(event_date, '1970-01-01'));

alter table public.company_events enable row level security;
drop policy if exists company_events_all_own on public.company_events;
create policy company_events_all_own on public.company_events
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
