-- Fund analytics: realized proceeds per company + per-user fee assumptions.

alter table public.companies
  add column if not exists realized_proceeds numeric(20, 2) not null default 0;

create table if not exists public.fund_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  carry_pct numeric(6, 2) not null default 20,
  mgmt_fee_pct numeric(6, 2) not null default 7,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fund_settings enable row level security;

drop policy if exists fund_settings_all_own on public.fund_settings;
create policy fund_settings_all_own on public.fund_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists fund_settings_touch_updated_at on public.fund_settings;
create trigger fund_settings_touch_updated_at
  before update on public.fund_settings
  for each row execute function public.touch_updated_at();
