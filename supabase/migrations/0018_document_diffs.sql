-- Data-room diffing: store the computed change-set of each document versus the
-- previous one for the same company (recurring board-deck tracking).
alter table public.documents
  add column if not exists diff jsonb,
  add column if not exists diff_vs uuid references public.documents (id) on delete set null;
