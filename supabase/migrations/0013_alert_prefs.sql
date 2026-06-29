-- Per-user alert preferences: which portfolio-event types are recorded, and the
-- minimum valuation move (%) worth flagging. Applied at event-creation time in
-- the ingestion pipeline so muted types / sub-threshold moves never hit the feed.
create table if not exists public.alert_prefs (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  funding_round boolean not null default true,
  valuation boolean not null default true,
  contract_win boolean not null default true,
  competitor boolean not null default true,
  valuation_min_pct numeric not null default 0, -- min |change %| to record a valuation event
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.alert_prefs enable row level security;
drop policy if exists alert_prefs_all_own on public.alert_prefs;
create policy alert_prefs_all_own on public.alert_prefs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
