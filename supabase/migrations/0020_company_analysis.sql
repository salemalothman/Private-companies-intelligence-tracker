-- Deep-dive analyst layer — one JSONB row per tracked company holding the
-- synthesized business/technology/competitive analysis (`sections`) and the
-- comps-model inputs (`valuation`) produced by a single structured Grok pass.
-- Generation upserts on `company_id` (one row per company). RLS via company
-- ownership, mirroring the per-company `competitors` table: the RLS user client
-- writes rows scoped to auth.uid(); the service-role admin client used by the
-- agent bypasses RLS by design.
create table if not exists public.company_analysis (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  generated_at timestamptz not null default now(),  -- drives the staleness hint
  model text,                                        -- e.g. the Grok model id
  sections jsonb not null default '{}'::jsonb,       -- narrative object (see spec §3)
  valuation jsonb not null default '{}'::jsonb,      -- comps inputs (see spec §4)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id)                                -- one row per company; drives upsert
);

create index if not exists company_analysis_company_idx
  on public.company_analysis (company_id);

alter table public.company_analysis enable row level security;

drop policy if exists company_analysis_all_own on public.company_analysis;
create policy company_analysis_all_own on public.company_analysis
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
