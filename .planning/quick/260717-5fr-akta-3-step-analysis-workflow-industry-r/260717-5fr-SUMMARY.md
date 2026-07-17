---
phase: quick-260717-5fr
plan: 01
subsystem: connectors / competitors / deep-dive-agent
tags: [akta, competitors, deep-dive, grounding, provenance]
requires:
  - AktaConnector (existing firmographic/news/financial-estimate connector)
  - applyMappedIngest (idempotent news writer)
  - canonical akta tie-break (lib/canonical.ts, unchanged)
provides:
  - AktaConnector.fetchCompetitors (industry-resolved, mention-ranked)
  - aktaDeepSearch (topic news, <=2 calls, title-deduped)
  - resolveIndustryCodes / extractIndustryMentions / normalizeDeepSearchArticles (pure)
  - discoverCompetitors multi-source additive merge (akta-wins) + all-connector valuation gather
  - runDeepDive akta deep-search grounding block + news persistence
affects:
  - lib/competitors/refresh.ts (consumes discoverCompetitors — shape unchanged)
  - deep-dive prompt grounding (additive; byte-identical when AKTA_API_KEY absent)
tech-stack:
  added: []
  patterns: [lenient-passthrough-zod, never-throw-connector, best-effort-isolated-failures, untrusted-grounding-sanitizer]
key-files:
  created:
    - lib/competitors/discover.test.ts
  modified:
    - lib/connectors/akta.ts
    - lib/connectors/akta.test.ts
    - lib/competitors/discover.ts
    - lib/agents/deep-dive.ts
decisions:
  - "self is a single-slot record; among all connectors' valuation-metric observations the akta one is PREFERRED (matches canonical tie-break), else first non-null"
  - "empty-set retry limited to the primary (Grok) source and never akta (credits cost guard)"
  - "deep-search block omitted entirely (no empty header) and applyMappedIngest skipped when aktaDeepSearch returns [] — keeps grounding byte-identical without a key"
metrics:
  duration: ~14 min
  completed: 2026-07-17
---

# Quick 260717-5fr: akta 3-Step Analysis Workflow (Industry Competitors + Deep Search) Summary

Integrated akta.pro's remaining two workflow steps — industry-resolved competitor
discovery into SYNC and topic-based deep search into DEEP-DIVE generation — grounding
two more surfaces in same-domain, entity-resolved akta data and closing the valuation-
metric gap where only the first connector's `fetchValuationMetric` reached canonical inputs.

## What Was Built

**Task 1 — AktaConnector step 2/3 primitives (commit 8490119)**
- Three exported pure functions: `resolveIndustryCodes(hits, {floor=0.45, cap=3})`,
  `extractIndustryMentions(articles, targetName)` (lenient passthrough zod over
  `companies` / `company_mentions` / `mentions` shapes, target-excluded, frequency-ranked),
  `normalizeDeepSearchArticles` (delegates to the existing news mapper).
- `AktaConnector.fetchCompetitors`: resolveCompany (free) → `/v1/industry/search` (free)
  → `resolveIndustryCodes` → exactly ONE `/v1/news?industry=…` call → ranked mentions.
- Exported `aktaDeepSearch(companyQuery, topics)`: ≤2 topic-scoped `/v1/news` calls,
  merge + title-dedupe + normalize. Company resolution refactored to a module-level
  `resolveAktaCompany` so the standalone entry point reuses it.

**Task 2 — discoverCompetitors rework (commit 7bbfdbf)**
- Queries EVERY `fetchCompetitors` connector (not just the first); per-source try/catch → [].
- Additive merge keyed on normalized name; an akta-sourced row WINS a same-name collision.
- Gathers `fetchValuationMetric` from ALL implementers; `pickSelfMetric` prefers the akta
  observation for the self row. Cache-hit-wins-over-live and SEC fallback preserved.
- Empty-set retry kept only for the primary (Grok) source; akta never retried.

**Task 3 — runDeepDive deep-search wiring (commit d21603a)**
- Derives 1-2 topics in code (`"<name> product reviews market position"` + a sector topic),
  calls `aktaDeepSearch` before the Grok pass.
- `summarizeDeepSearchNews` folds articles into a source-tagged grounding block, every
  free-text field sanitized via the existing `groundingText()` (prompt-injection guard).
- Persists articles via `applyMappedIngest` (title-deduped, akta sentiment + publisher
  source) — no direct table mutation. Both paths best-effort (try/catch).

## Deviations from Plan

None — plan executed exactly as written. `discover.test.ts` did not previously exist,
so it was created (plan anticipated "update/extend co-located discover.test.ts").

## Threat Model Adherence

- T-5fr-01 (tampering): lenient passthrough zod in the pure extractors; malformed → [], never throws.
- T-5fr-02 (prompt injection): deep-search free text folded inside the existing UNTRUSTED
  `<<<GROUNDING>>>` markers and run through `groundingText()` (strips control chars / U+2028-9,
  collapses whitespace, truncates).
- T-5fr-03 (cost/credits): `fetchCompetitors` makes exactly 1 news call; `aktaDeepSearch`
  caps at 2; no unbounded loops; no akta retry.
- T-5fr-SC: no new dependencies.

## Verification

- `npx tsc --noEmit` — clean
- `npm run lint` — clean (no ESLint warnings or errors)
- `npm run test` — 351 passed (34 files), up from 336 (18 akta + 5 discover cases)
- AKTA_API_KEY-absent path: aktaDeepSearch → [], deep-search block omitted, grounding
  byte-identical; discover gathers no akta metric — all no-op without throwing.
- No schema / lib/types.ts changes.

## Self-Check: PASSED

- Files: all 5 present (4 modified, 1 created).
- Commits: 8490119, 7bbfdbf, d21603a all in git log.
- Working tree clean after task commits.
