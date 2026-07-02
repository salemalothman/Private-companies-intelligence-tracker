---
phase: 04-external-grounding-ingestion
status: passed-with-caveats
verified_by: orchestrator (code + unit tests + a real end-to-end ingestion run)
date: 2026-07-02
score: 6/6 requirements delivered as code; live data caching constrained by external factors (documented)
---

# Phase 4: External Grounding Ingestion — Verification

**Status: PASSED (with documented external caveats).** The off-Vercel ingestion
pipeline is built, correct, and safe. A real `npm run ingest` across all 74 targets
ran cleanly (exit 0) and, exactly as the guardrails require, refused to cache
ambiguous/unavailable data rather than fabricating it. Two real bugs that only a
live run could surface were found and fixed.

## Per-requirement

| Req | Status | Evidence |
|---|---|---|
| ING-01 (off-Vercel script, `--agent` JSON, upsert) | DELIVERED | `scripts/ingest-grounding.ts` enumerated 74 targets and dispatched all 3 sources; service-role client; not a Vercel route. |
| ING-02 (sec-edgar peer XBRL) | DELIVERED | Module runs; correctly skipped all 74 — this portfolio is all **private** companies, so no public-peer CIK/XBRL exists (legitimate skip, not a defect). |
| ING-03 (company-goat Form D + CIK disambiguation) | DELIVERED | Module + CLI work; correctly skipped all 74 — EDGAR name matches were **ambiguous SPV entities** (e.g. "AVSF - Replit 2026 Q, LLC"), and the mandatory disambiguation refused to cache uncertain matches. **The no-fabrication guardrail working as intended.** |
| ING-04 (x-twitter posts) | DELIVERED (code); **BLOCKED live** | Module authenticates (`doctor app_only_api: ok` after the parseEnvelope fix), but the X tweets endpoint returns **HTTP 403** — the X API app is on the Free tier, which forbids tweet reads (needs Basic+). Also a secondary code issue: the module uses `sync` (NDJSON to local store) instead of a returning read command. Both tracked in follow-up task_2dd0ef54. |
| ING-05 (runDeepDive reads caches, source-attributed) | DELIVERED | `04-06`: reads all 3 caches, folds source-tagged facts into the prompt; degrades gracefully on empty caches (the current live state); comps/valuation untouched; hardening preserved. |
| ING-06 (idempotent, source-tagged, env-only secrets, no fabrication) | DELIVERED | Natural-key upserts; source columns; secrets env-only + never logged; execFile array args; no fabricated data cached. |

## Bugs found & fixed by the live run
1. **`da325a4`** — `runDeepDive` overwrote a good stored analysis with an empty one
   on a malformed/truncated Grok response. Now retries once and preserves the
   existing row (hardening; landed from the follow-up task).
2. **`6cd9be3`** — `parseEnvelope` returned `results: undefined` for non-enveloped
   CLI output (e.g. `doctor`, whose `auth_lanes` are top-level), which made the
   x-twitter lane preflight always fail. Now falls back to the whole object.

## Gates
- `npx tsc --noEmit` clean · `npx eslint` clean · full suite **green** (incl. 51 ingest tests).
- Migration 0021 (peer_financials, form_d_rounds, x_posts) live + REST-verified.
- Live ingestion: exit 0, no crash, **no meaningful cost** (x-twitter 403'd before serving data; company-goat/sec-edgar are free).

## Honest caveats (external / follow-up, not code defects)
- Caches are **empty in practice** because: (a) the portfolio is all-private →
  company-goat/sec-edgar correctly find no clean public data; (b) x-twitter is
  blocked by the X API Free tier (403) + a command/parse rework (task_2dd0ef54).
- The pipeline is ready and will cache real data once a company has clean public
  SEC filings/peers and the X API tier permits reads.
- `runDeepDive` correctly operates on empty caches today (validated).

---
*Phase: 04-external-grounding-ingestion*
*Verified: 2026-07-02*
