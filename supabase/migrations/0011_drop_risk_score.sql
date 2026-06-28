-- Remove the deprecated rule-based risk score. The risk assessment feature
-- (score, matrix, UI widgets) has been excised from the application.
alter table public.companies drop column if exists risk_score;
