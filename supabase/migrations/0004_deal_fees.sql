-- Deal-specific fee overrides. NULL means "use the fund default" from fund_settings.
alter table public.companies
  add column if not exists carry_pct numeric(6, 2),
  add column if not exists mgmt_fee_pct numeric(6, 2);
