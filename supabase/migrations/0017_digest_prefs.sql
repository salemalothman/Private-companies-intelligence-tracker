-- Per-user (per-fund) digest configuration: whether the weekly reporting engine
-- generates a PDF for this user, how often, which sections to include, and an
-- optional delivery recipient.
create table if not exists public.digest_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  enabled boolean not null default true,
  frequency text not null default 'weekly' check (frequency in ('weekly', 'monthly')),
  include_holdings boolean not null default true,
  include_activity boolean not null default true,
  recipient_email text,
  updated_at timestamptz not null default now()
);

alter table public.digest_prefs enable row level security;
drop policy if exists digest_prefs_all_own on public.digest_prefs;
create policy digest_prefs_all_own on public.digest_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
