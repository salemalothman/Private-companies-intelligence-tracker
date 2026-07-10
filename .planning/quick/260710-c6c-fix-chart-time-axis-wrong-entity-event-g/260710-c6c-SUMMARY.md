---
phase: quick-260710-c6c
plan: 01
subsystem: dashboard-charts + exa-events ingestion + deploy-config
tags: [recharts, time-axis, disambiguation, entity-guard, exa-events, wrangler]
requires: []
provides:
  - "Time-scale hero Portfolio value x-axis (no duplicate YYYY-MM ticks)"
  - "screenCompanyEvent / isGenericMultiCompanyReport pure guards"
  - "Wrong-entity + generic-report screening at exa-events insert time"
  - "Cloudflare account_id in wrangler.jsonc"
affects:
  - components/dashboard/portfolio-charts.tsx
  - lib/enrichment/disambiguation.ts
  - lib/agents/exa-events.ts
  - wrangler.jsonc
tech-stack:
  added: []
  patterns:
    - "recharts numeric time scale (type=number scale=time on epoch-ms dataKey)"
    - "pure observational regex heuristics mirroring lib/enrichment/disambiguation.ts"
key-files:
  created:
    - wrangler.jsonc
  modified:
    - components/dashboard/portfolio-charts.tsx
    - lib/enrichment/disambiguation.ts
    - lib/enrichment/disambiguation.test.ts
    - lib/agents/exa-events.ts
decisions:
  - "Wrong-entity screening extends STOCK_SIGNAL with sibling EXCHANGE_SYMBOL + FINANCE_DOMAIN regexes rather than duplicating logic"
  - "Generic multi-company valuation reports are dropped entirely (figure-less-for-this-company value is noise), not stored with a stripped value"
  - "Profile contradiction is conservative: only fires when company.country is set and the exchange prefix maps to one unambiguous country"
metrics:
  duration: ~12m
  completed: 2026-07-10
---

# Quick 260710-c6c: Fix chart time-axis, wrong-entity event guard, wrangler account_id Summary

Three independent live-diagnosed fixes: the dashboard hero "Portfolio value" x-axis now uses a numeric recharts time scale (killing duplicate/irregular YYYY-MM ticks); the Exa events pipeline now rejects wrong-entity hits (foreign exchange tickers, finance-aggregator domains, HQ-country contradictions) and generic multi-company sector reports at ingestion time via a new pure guard; and `wrangler.jsonc` carries the Cloudflare `account_id`.

## What Was Built

### Task 1 — Time-scale hero x-axis (`components/dashboard/portfolio-charts.tsx`)
- `mergeSeries` now emits an epoch-ms `ms` field alongside `date/value/invested` (return type updated); `lib/metrics.ts` `PortfolioValuePoint` shape untouched so metrics tests stay green.
- Hero `<XAxis>` switched to `type="number" scale="time" dataKey="ms" domain={['dataMin','dataMax']}` with a `monthLabel` (`YYYY-MM`) tickFormatter. Added a Tooltip `labelFormatter` so the label renders `YYYY-MM` instead of raw epoch ms.

### Task 2 — Wrong-entity + generic-report event guard (TDD)
- New exported pure functions in `lib/enrichment/disambiguation.ts`:
  - `screenCompanyEvent(company, event) -> { drop, value, reason? }`
  - `isGenericMultiCompanyReport(name, title, detail?)`
- Extended the public-equity gate with sibling regexes `EXCHANGE_SYMBOL` (NYSE:/NASDAQ:/TSE:/TYO: … symbol titles) and `FINANCE_DOMAIN` (tradingview.com, finance.yahoo., marketscreener.com, …), plus an `EXCHANGE_COUNTRY` map for HQ-contradiction detection. `wrongEntitySignal` keeps its private-only gating and now tests all three.
- Co-located tests cover both exact live cases (Accrete `TSE:4395` TradingView earnings → drop; windsordrake "AI Valuations: Q2 2026" $852B report → drop/no value) plus foreign-symbol drop, country contradiction, facts-absent screening, and a positive pass-through with value intact.
- Wired into `runExaEventsSync` (`lib/agents/exa-events.ts`): now selects `country, founded_year`, screens every event before insert (`isPrivate: true` for tracked portfolio companies), skips dropped events, and uses the guard's returned `value`. Existing dedupe pre-filter and best-effort error handling preserved.

### Task 3 — Cloudflare account_id (`wrangler.jsonc`)
- Added `"account_id": "c218602ac58f5563ef94424e84ff5b75"` near `name`. The file did not exist in this worktree's base commit, so it was created mirroring the main-branch config with the account_id added.

## Deviations from Plan

**[Rule 3 - Blocking] `wrangler.jsonc` absent from worktree base.** The plan assumed an existing `wrangler.jsonc` to edit, but the worktree base commit predates its addition (it is tracked on main). Created the file with the canonical main-branch content plus the `account_id` key rather than editing in place. No behavioral difference; the orchestrator's merge reconciles it.

## Threat Model Mitigations Applied
- **T-c6c-01 (Spoofing):** `screenCompanyEvent` drops foreign exchange-listed ticker content masquerading as the private tracked company.
- **T-c6c-02 (Tampering):** generic multi-company sector reports are dropped so a foreign figure (e.g. $852B) is never stored as a per-company valuation.

## Verification
- `npx tsc --noEmit` — clean (repo-wide).
- `npx eslint` — clean on all modified files.
- `npx vitest run` — 283 passed (29 files), including new `disambiguation.test.ts` cases and unchanged `lib/metrics.test.ts`.
- Manual/live spot-check (out of automated scope): hero x-axis month ticks non-duplicated; Accrete AI no longer carries the TSE:4395 earnings event or the windsordrake sector-report valuation.

## Commits
- `1582f10` fix: time-scale hero Portfolio value x-axis
- `9b04a24` test: add failing tests for screenCompanyEvent guard (RED)
- `ea0f94a` feat: screen wrong-entity + generic-report exa events (GREEN)
- `99346da` chore: add Cloudflare account_id to wrangler.jsonc

## Self-Check: PASSED
- Created file exists: `wrangler.jsonc` — FOUND
- Commits exist: 1582f10, 9b04a24, ea0f94a, 99346da — all FOUND
