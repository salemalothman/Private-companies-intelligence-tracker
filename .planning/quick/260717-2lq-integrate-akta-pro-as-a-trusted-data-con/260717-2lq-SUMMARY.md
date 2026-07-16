---
phase: quick-260717-2lq
plan: 01
subsystem: connectors
tags: [connector, akta, ingestion, canonical, dedupe, trust]
requires:
  - DataConnector interface (lib/connectors/types.ts)
  - provider()/field() canonical reconciliation (lib/canonical.ts)
  - dedupeBy generic merge (lib/ingestion/dedupe.ts)
  - isTrustedSource (lib/enrichment/timeline-validation.ts)
provides:
  - AktaConnector (id "akta") + exported pure mappers
  - AKTA_API_KEY registry gating
  - akta-wins duplicate preference in canonical field() and ingestion dedupe
  - "akta" provider normalization
affects:
  - lib/connectors/registry.ts
  - lib/canonical.ts
  - lib/ingestion/dedupe.ts
tech-stack:
  added: []
  patterns:
    - "Connector strategy pattern gated on env key (AKTA_API_KEY)"
    - "Pure exported mappers unit-tested without HTTP"
    - "Optional prefer() score in dedupeBy for source-preference tie-break"
key-files:
  created:
    - lib/connectors/akta.ts
    - lib/connectors/akta.test.ts
  modified:
    - lib/connectors/registry.ts
    - lib/canonical.ts
    - lib/canonical.test.ts
    - lib/ingestion/dedupe.ts
    - lib/ingestion/dedupe.test.ts
    - lib/enrichment/timeline-validation.test.ts
    - .env.local.example
    - .planning/codebase/INTEGRATIONS.md
decisions:
  - "akta financial figures always carry an explicit \"akta.pro financial estimate\" basis — never presented as fact (data-integrity constraint D)"
  - "akta funding rounds deferred to Grok/Exa/SEC (funding_detail is Enterprise-only)"
  - "akta wins the duplicate tie-break as primary regardless of round-name explicitness, via a prefer() score applied before explicitness/date"
  - "Deploy secret target is Cloudflare Workers (wrangler), NOT Vercel"
metrics:
  duration: ~11 min
  tasks: 3
  files: 10
  completed: 2026-07-17
requirements: [AKTA-CONNECTOR, AKTA-TRUST-DEDUPE, AKTA-CONFIG-DOCS]
---

# Quick Task 260717-2lq: Integrate akta.pro as a Trusted Data Connector Summary

Integrated akta.pro as a trusted `DataConnector` (id `"akta"`) — structured firmographic profiles, entity-resolved news with native AI summary + sentiment, and honestly-labelled financial estimates — and made akta the preferred source when observations duplicate across connectors, across both canonical `field()` selection and ingestion `dedupeBy`.

## What Was Built

### Task 1 — AktaConnector + pure mappers + registry gating
- `lib/connectors/akta.ts`: `AktaConnector implements DataConnector`, modeled on `exa.ts`. `server-only` guard; REST base `https://api.akta.pro/api` with an `x-api-key` header. Private `aktaGet()` zod-validates the `{ data, credits_consumed }` envelope and returns `null` on ANY failure (no key / network / non-2xx / malformed) — never throws. Private `resolveCompany()` hits the free `/v1/company/search` and reuses the returned uuid/website. `fetchCompanyProfile`/`fetchNews`/`fetchValuationMetric` map firmographic / news / financial_estimate sections; `fetchFundingRounds` returns `[]` (Enterprise-only, deferred to Grok/Exa/SEC).
- Exported pure mappers `mapAktaProfile`, `mapAktaNews`, `mapAktaFinancial` (snake_case read only inside the mappers). Financial mapper stamps an explicit `"akta.pro financial estimate"` basis on both `basis` and `revenueBasis`.
- `lib/connectors/registry.ts`: imports `AktaConnector` and pushes it after the Exa block only when `AKTA_API_KEY` is set.
- `lib/connectors/akta.test.ts`: 8 pure-mapper tests (profile mapping + sector fallback + empty founders + nameless null; news summary/sentiment + publisher-domain source + akta.pro fallback + untitled drop; financial estimate basis; empty sentinels).

### Task 2 — Trust + akta-wins duplication preference
- `lib/canonical.ts` `provider()`: added `if (s.includes("akta")) return "akta";` before the `isPublisherDomain` fallthrough so `akta.pro` / `akta.pro:news` normalize to the stable key `"akta"`.
- `lib/canonical.ts` `field()`: extended the date-desc sort comparator with a secondary key preferring provider `"akta"` on a date tie.
- `lib/ingestion/dedupe.ts`: added an optional `prefer?: (t: T) => number` accessor to `Accessors<T>`, applied as the FIRST sort key (descending) in the primary-selection sort. `dedupeConnectorRounds`, `dedupeFundingRows`, and `dedupeValuationRows` pass `prefer: (r) => /akta/i.test(r.source ?? "") ? 1 : 0`.
- Tests added to `canonical.test.ts` (provider normalization + same-date trusted tie → akta value), `dedupe.test.ts` (akta row kept as primary + figure retained on collision), and `timeline-validation.test.ts` (`isTrustedSource("akta.pro") === true`).

### Task 3 — Config + docs
- `.env.local.example`: `AKTA_API_KEY=` with graceful-degradation + Cloudflare Workers deploy note.
- `.planning/codebase/INTEGRATIONS.md`: added an akta.pro service block and an env-var row (source, degradation, Cloudflare-not-Vercel deploy target).

## Deviations from Plan

**1. [Rule 3 - Blocking] INTEGRATIONS.md path**
- **Found during:** Task 3
- **Issue:** The plan referenced `INTEGRATIONS.md` at the repo root, but the file does not exist there; the tracked copy lives at `.planning/codebase/INTEGRATIONS.md` (the same file CLAUDE.md points to for the "full table").
- **Fix:** Updated `.planning/codebase/INTEGRATIONS.md` instead. No new root file created.
- **Commit:** 3e06a88

Otherwise the plan executed exactly as written. All LOCKED design decisions honored (estimate basis strings, no funding rounds from akta, no MCP server, no wrangler deploy step, Cloudflare-not-Vercel note).

## Threat Model Compliance

- **T-akta-01 (Tampering):** `aktaGet` zod-validates the envelope; malformed/failed responses return `null`/`[]`, never throw. ✓
- **T-akta-02 (Info Disclosure):** `import "server-only"` at the top of `akta.ts`; key read only via `process.env.AKTA_API_KEY` server-side; `.env.local` gitignored. ✓
- **T-akta-03 (Spoofing):** accepted per plan — akta publisher domain trusted, `akta.pro` fallback is a tier-1 trusted source, honestly labelled. ✓
- **T-akta-04 (Integrity):** financial `basis`/`revenueBasis` literally say `"akta.pro financial estimate"`. ✓

## Verification

- `npx tsc --noEmit` — clean (exit 0)
- `npm run lint` — clean (No ESLint warnings or errors)
- `npm run test` — 336/336 passed across 33 files
- Registry gates on `AKTA_API_KEY`; `akta.ts` first line is `import "server-only";`

## Commits

- `10a6adc` test(quick-260717-2lq): add failing tests for akta pure mappers
- `d3035be` feat(quick-260717-2lq): add AktaConnector + registry gating
- `b181dfa` test(quick-260717-2lq): add failing tests for akta trust + dedupe preference
- `20131ba` feat(quick-260717-2lq): make akta win the duplicate tie-break
- `3e06a88` docs(quick-260717-2lq): document AKTA_API_KEY config + integration

## Known Stubs

None — every code path is wired; akta contributes real data when `AKTA_API_KEY` is set and degrades gracefully otherwise.

## Self-Check: PASSED

- Created files verified on disk: `lib/connectors/akta.ts`, `lib/connectors/akta.test.ts`.
- All 5 task commits verified in git log: 10a6adc, d3035be, b181dfa, 20131ba, 3e06a88.
