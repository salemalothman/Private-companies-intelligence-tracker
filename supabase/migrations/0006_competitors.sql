-- Competitor intelligence — for each tracked company, the primary competitors
-- discovered via the Grok (X-search) connector, with their latest confirmed
-- valuation. Cross-referenced against SEC filings (sec_verified). Rendered in
-- the company detail "Competitors" tab alongside the target company itself.
create table if not exists public.competitors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  valuation numeric,                 -- latest confirmed post-money valuation (USD)
  valuation_date date,               -- as-of date for that valuation
  source text,                       -- provenance, e.g. 'grok:x'
  basis text,                        -- short note, e.g. 'Series C per @AaronGDillon'
  sec_verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create index if not exists competitors_company_idx
  on public.competitors (company_id, valuation desc nulls last);

alter table public.competitors enable row level security;

drop policy if exists competitors_all_own on public.competitors;
create policy competitors_all_own on public.competitors
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
