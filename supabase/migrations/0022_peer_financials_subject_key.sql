-- Fix: the deep-dive agent matched ranked peers to peer_financials by
-- `entity_name`, but the read side passes colloquial competitor names
-- ("Palantir") while sec-edgar stores the SEC registrant title
-- ("PALANTIR TECHNOLOGIES INC."), so `.in("entity_name", peerNames)` never
-- matched and the ING-05 peer-XBRL grounding was silently inert.
--
-- Both sides actually originate from the SAME string — `competitors.name`
-- (scripts/ingest-grounding.ts builds each competitor IngestTarget with
-- `subject: k.name`; runDeepDive reads `peers.map(p => p.name)`). So we add a
-- normalized `subject_key` (nameKey(subject) = lowercased, alnum-only) that the
-- ingest writes and the agent queries by — an exact, index-backed match that
-- sidesteps the colloquial-vs-legal-title gap entirely.
--
-- Existing rows keep subject_key NULL (a re-ingest populates it correctly);
-- back-filling from entity_name would be wrong — the registrant title never
-- normalizes to the colloquial key.

alter table public.peer_financials
  add column if not exists subject_key text;   -- nameKey(competitor name); match anchor

-- The agent now filters by subject_key, so index that; the old cik index was
-- redundant with the unique (cik, fiscal_period) constraint (cik is its leading
-- column) and nothing reads by cik alone.
create index if not exists peer_financials_subject_key_idx
  on public.peer_financials (subject_key);

drop index if exists public.peer_financials_cik_idx;
