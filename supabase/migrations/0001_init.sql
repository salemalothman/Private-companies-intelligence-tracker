-- Private Portfolio Intelligence Tracker — initial schema
-- All portfolio data is scoped to the owning user and protected by RLS.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type company_status as enum ('active', 'exited');
exception when duplicate_object then null; end $$;

do $$ begin
  create type confidence_level as enum ('low', 'medium', 'high');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sentiment_label as enum ('positive', 'neutral', 'negative');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  created_at timestamptz not null default now()
);

-- Auto-create a profile row when a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- companies
-- ---------------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null,
  website text,
  logo_url text,
  sector text,
  country text,
  founded_year int,
  founders text[],
  description text,
  status company_status not null default 'active',
  risk_score int check (risk_score between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists companies_user_id_idx on public.companies (user_id);

-- ---------------------------------------------------------------------------
-- investments
-- ---------------------------------------------------------------------------
create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  investment_date date not null,
  amount numeric(20, 2) not null default 0,
  share_price numeric(20, 4),
  shares numeric(20, 2),
  ownership_pct numeric(9, 4),
  investor_name text,
  round text,
  terms text,
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists investments_company_id_idx on public.investments (company_id);

-- ---------------------------------------------------------------------------
-- valuations
-- ---------------------------------------------------------------------------
create table if not exists public.valuations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  date date not null,
  round text,
  pre_money numeric(20, 2),
  post_money numeric(20, 2),
  share_price numeric(20, 4),
  source text,
  confidence confidence_level not null default 'medium',
  created_at timestamptz not null default now()
);
create index if not exists valuations_company_date_idx
  on public.valuations (company_id, date desc);

-- ---------------------------------------------------------------------------
-- funding_rounds
-- ---------------------------------------------------------------------------
create table if not exists public.funding_rounds (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  round text not null,
  date date,
  amount_raised numeric(20, 2),
  valuation numeric(20, 2),
  investors text[],
  lead_investor text,
  share_price numeric(20, 4),
  source text,
  created_at timestamptz not null default now()
);
create index if not exists funding_rounds_company_date_idx
  on public.funding_rounds (company_id, date desc);

-- ---------------------------------------------------------------------------
-- news (populated by ingestion engine / AI agents in later phases)
-- ---------------------------------------------------------------------------
create table if not exists public.news (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  title text not null,
  source text,
  url text,
  date date,
  sentiment sentiment_label,
  summary text,
  created_at timestamptz not null default now()
);
create index if not exists news_company_date_idx
  on public.news (company_id, date desc);

-- ---------------------------------------------------------------------------
-- documents (PDF intelligence pipeline, later phase)
-- ---------------------------------------------------------------------------
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  file_path text not null,
  type text,
  extracted_data jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);
create index if not exists documents_company_id_idx on public.documents (company_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists companies_touch_updated_at on public.companies;
create trigger companies_touch_updated_at
  before update on public.companies
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles       enable row level security;
alter table public.companies      enable row level security;
alter table public.investments    enable row level security;
alter table public.valuations     enable row level security;
alter table public.funding_rounds enable row level security;
alter table public.news           enable row level security;
alter table public.documents      enable row level security;

-- profiles: a user can read/update only their own profile.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select using (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update using (auth.uid() = id);

-- companies: full CRUD limited to the owner.
drop policy if exists companies_all_own on public.companies;
create policy companies_all_own on public.companies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- investments: owner via user_id.
drop policy if exists investments_all_own on public.investments;
create policy investments_all_own on public.investments
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Child tables without their own user_id are scoped through the parent company.
drop policy if exists valuations_all_own on public.valuations;
create policy valuations_all_own on public.valuations
  for all using (
    exists (
      select 1 from public.companies c
      where c.id = valuations.company_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.companies c
      where c.id = valuations.company_id and c.user_id = auth.uid()
    )
  );

drop policy if exists funding_rounds_all_own on public.funding_rounds;
create policy funding_rounds_all_own on public.funding_rounds
  for all using (
    exists (
      select 1 from public.companies c
      where c.id = funding_rounds.company_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.companies c
      where c.id = funding_rounds.company_id and c.user_id = auth.uid()
    )
  );

drop policy if exists news_all_own on public.news;
create policy news_all_own on public.news
  for all using (
    exists (
      select 1 from public.companies c
      where c.id = news.company_id and c.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.companies c
      where c.id = news.company_id and c.user_id = auth.uid()
    )
  );

drop policy if exists documents_all_own on public.documents;
create policy documents_all_own on public.documents
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
