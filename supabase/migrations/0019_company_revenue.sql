-- Durable revenue on the company's financial profile. (The is_self competitor
-- row is replaced on every competitor refresh, so revenue extracted from
-- documents / Exa needs a stable home that survives a re-sync.)
alter table public.companies
  add column if not exists revenue numeric,
  add column if not exists revenue_source text,
  add column if not exists revenue_date date;
