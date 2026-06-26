-- Tag news items by kind so the feed can highlight material business deals /
-- contract wins. NULL = general update; 'contract' = a deal / contract win,
-- set automatically at ingestion by the deal classifier.
alter table public.news
  add column if not exists category text;
