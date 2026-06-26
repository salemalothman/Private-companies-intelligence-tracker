-- Fees are now configured per company (companies.carry_pct / mgmt_fee_pct).
-- The global per-user default fee table is no longer used.
drop table if exists public.fund_settings;
