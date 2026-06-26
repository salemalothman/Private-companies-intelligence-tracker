-- Extend competitor intelligence with revenue / ARR so the Competitors tab can
-- compute a Valuation-to-Revenue multiple per entity. `is_self` marks the row
-- carrying the target company's own revenue (its valuation stays authoritative
-- in the valuations table); that row is merged into the target's table row.
alter table public.competitors
  add column if not exists revenue numeric,
  add column if not exists revenue_basis text,
  add column if not exists is_self boolean not null default false;
