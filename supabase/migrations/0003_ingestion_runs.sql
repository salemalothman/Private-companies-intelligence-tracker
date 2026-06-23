-- Ingestion pipeline run log — observability for the automated data engine.
create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  source text not null,
  status text not null default 'success', -- success | partial | error
  items_found int not null default 0,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists ingestion_runs_company_idx
  on public.ingestion_runs (company_id, created_at desc);

alter table public.ingestion_runs enable row level security;

drop policy if exists ingestion_runs_all_own on public.ingestion_runs;
create policy ingestion_runs_all_own on public.ingestion_runs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
