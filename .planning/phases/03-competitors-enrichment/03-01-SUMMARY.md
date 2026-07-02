---
phase: 03-competitors-enrichment
plan: 01
subsystem: deep-dive-agent
tags: [agent, competitors, normalize, zod, prompt, vitest]
requires:
  - lib/competitors/rank.ts (RankedEntity / buildCompetitorRanking)
  - lib/agents/deep-dive-types.ts (LabelledField, Rating1to10, clampRating, OverviewSections)
provides:
  - CompetitorsSection / ThreatTier / CapabilityMatrix / CapabilityThreat types
  - OverviewSections.competitors key
  - normalizeSections(raw, allowedNames) competitors normalization
  - runDeepDive prompt + ANALYSIS_SHAPE competitors block
affects:
  - 03-02 (Competitors tab render — consumes the stored competitors block)
tech-stack:
  added: []
  patterns:
    - "Untrusted-model JSON normalized at the LLM->app trust boundary (extend the Phase-2 normalizeSections pattern)"
    - "Allow-list name filtering (case-insensitive) so the model cannot inject un-ranked competitors"
key-files:
  created: []
  modified:
    - lib/agents/deep-dive-types.ts
    - lib/agents/deep-dive.ts
    - lib/agents/deep-dive.test.ts
decisions:
  - "normalizeSections gains a second param allowedNames (default []); empty list means no name-filtering context so the 6 existing single-arg call sites/tests keep passing, but tiers are still enum-coerced and scores still clamped."
  - "Matrix scores reuse the existing clampRating (out-of-domain -> null, never fabricated to a legal value), consistent with the Phase-2 moat ratings."
  - "Name filtering is case-insensitive on trimmed names; the kept key preserves the model's original casing (join to ranking rows is done case-insensitively downstream in 03-02)."
metrics:
  duration: ~7 min
  completed: 2026-07-02
  tasks: 2
  files: 3
---

# Phase 3 Plan 01: Competitors Analysis Block (Agent Data Side) Summary

Extended the deep-dive agent with a typed, normalized `competitors` block —
threat_tiers (competitor name -> direct/indirect/emerging) plus a Capability
Matrix (target vs. top 3 threats scored 1-10) — that CLASSIFIES the
already-ranked competitors and cannot invent new names, mirroring the Phase-2
types + prompt + zod + normalizeSections pattern.

## What Was Built

- **Task 1 (`1680e2d`):** Added `ThreatTier`, `CapabilityThreat`,
  `CapabilityMatrix`, and `CompetitorsSection` types to `deep-dive-types.ts`, and
  an optional `competitors?: CompetitorsSection` key on `OverviewSections` (placed
  after `ic_conclusion`). Each new type carries a WHY JSDoc block: the tiers/matrix
  classify ALREADY-ranked competitors only, and the 1-10 scores are bounded
  qualitative judgement indicators (reusing `Rating1to10`), not fabricated
  financials. `AnalysisValuation` untouched.
- **Task 2 (`0869c85`):** In `deep-dive.ts`:
  - `normalizeSections(raw, allowedNames: string[] = [])` now builds a
    case-insensitive allow-list Set and, before `return out`, normalizes the
    `competitors` block: tiers enum-coerced (`THREAT_TIERS`) and name-filtered;
    matrix `target` string-coerced, each of the four scores through `clampRating`,
    threats dropped when the name is empty or not in the allow-list, then capped at
    the first 3; `narrative` via `toLabelled`. `competitors` is only assigned when
    at least one of the three sub-fields is non-empty.
  - `ANALYSIS_SHAPE` extended with the `competitors` key after `ic_conclusion`.
  - `buildPrompt` gained a `competitors` bullet instructing Grok to classify ONLY
    the grounding's "Competitor landscape" names into direct/indirect/emerging and
    build the capability_matrix of the target vs. its top 3 threats (prefer
    direct), with a HARD RULE forbidding invented names and clarifying 1-10 scores
    are judgement, not financials.
  - The `runDeepDive` call site passes `ranking.map((r) => r.name)` (target + all
    peers) as the allow-list.
  - Added a `describe("normalizeSections competitors", ...)` block: full-object
    preservation, unknown-tier drop, out-of-list tier/threat drop, cap-3,
    out-of-domain score -> null, empty/absent input -> no key, and empty-allow-list
    back-compat.

## Verification

- `npx vitest run lib/agents/deep-dive.test.ts` — 22 passed (14 pre-existing + 8
  new competitors cases; all pre-existing OVR-section + comps tests still green).
- `npx tsc --noEmit` — clean (exit 0).
- `npm run lint` — clean (no ESLint warnings or errors).
- `git diff` confirms the `AnalysisValuation` interface and the code-computed comps
  path (`computePeerMultiple` / `deriveBaseRevenue` / `percentile` / `EMPTY_GROWTH`
  / `base_revenue`) have no changed lines.

## Threat Model Coverage

| Threat ID | Mitigation delivered |
|-----------|----------------------|
| T-03-01 (Tampering) | Scores clamped via `clampRating`; tiers enum-coerced (unknown dropped); threats capped at 3; stray narrative keys stripped by `toLabelled`. |
| T-03-02 (Spoofing) | Prompt hard-rule + `normalizeSections` allow-list name-filter (from `buildCompetitorRanking` names) drop any tier/threat name not in the ranking. |
| T-03-SC | No new packages installed (zod, ai, @ai-sdk/xai already present). |

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None. This plan is the data side only; rendering (empty/populated states) lands in
plan 03-02.

## Self-Check: PASSED

- All modified files present on disk.
- Both task commits (`1680e2d`, `0869c85`) present in git history.
