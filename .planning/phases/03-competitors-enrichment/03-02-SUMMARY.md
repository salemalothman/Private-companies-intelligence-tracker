---
phase: 03-competitors-enrichment
plan: 02
subsystem: ui
tags: [react, server-component, tailwind, competitors, deep-dive]

requires:
  - phase: 03-competitors-enrichment (03-01)
    provides: typed competitors block (threat_tiers + capability_matrix) + normalizeSections allow-list
  - phase: 01-foundation
    provides: getCompanyAnalysis, DeepDiveEmpty
  - phase: 02-overview-enrichment
    provides: RatingIndicator (reused for matrix cells)
provides:
  - CompetitorsAnalysis server component (tier-grouped ranking + Capability Matrix)
  - Competitors tab wired to the stored analysis
affects: [05-valuation-targets]

tech-stack:
  added: []
  patterns:
    - "Threat-tier grouping joins agent tiers to existing ranking rows by name (case-insensitive)"
    - "Capability Matrix = target + top-3 threats grid of RatingIndicators"

key-files:
  created:
    - components/company/competitors-analysis.tsx
  modified:
    - app/(app)/companies/[id]/page.tsx
    - scripts/regen-deep-dive.ts

key-decisions:
  - "Tier order Direct → Indirect/asymmetric → Emerging/stealth → Unclassified; empty groups omitted; target row lands in Unclassified with self-scores em-dashed"
  - "Existing ranking columns/behavior reproduced verbatim inside the tier grouping"

patterns-established:
  - "Reuse RatingIndicator for the 1–10 matrix cells so it matches Overview moat ratings"
  - "No re-discovery — the agent only classifies already-ranked competitor names"

requirements-completed: [CMP-01, CMP-02]

duration: ~10min
completed: 2026-07-02
---

# Phase 3 · Plan 03-02: Competitors Rendering Summary

**The Competitors tab now groups the existing ranking by threat tier (Direct / Indirect / Emerging / Unclassified) and renders a Capability Matrix scoring the company vs its top 3 threats across IP Depth, GTM Velocity, Capital Efficiency, and Workflow Retention — reusing the RatingIndicator, with no re-discovery of competitors.**

## Performance
- **Duration:** ~10 min (code) + orchestrator regen/live-verify checkpoint
- **Completed:** 2026-07-02
- **Tasks:** 3 (2 code, 1 human-verify checkpoint)
- **Files modified:** 3

## Accomplishments
- `CompetitorsAnalysis` server component: tier-grouped ranking rows (all original columns preserved — rank #, valuation, revenue, V/R multiple, as-of, source link, basis, SEC-verified badge, target highlight) + a Capability Matrix grid of `RatingIndicator` cells.
- Wired into the Competitors tab; `DeepDiveEmpty` CTA before first run; the raw ranking still renders.
- Extended `scripts/regen-deep-dive.ts` to print the competitors block counts.

## Task Commits
1. **Task 1: CompetitorsAnalysis component** - `df34e75` (feat)
2. **Task 2: Wire into Competitors tab + regen print** - `14b5da4` (feat)
3. **Task 3: Human-verify checkpoint** - regen + live render verified by orchestrator (below)

## Files Created/Modified
- `components/company/competitors-analysis.tsx` - tier grouping + capability matrix
- `app/(app)/companies/[id]/page.tsx` - Competitors tab wiring
- `scripts/regen-deep-dive.ts` - print competitors block counts

## Verification (checkpoint)
Orchestrator ran `scripts/regen-deep-dive.ts "Replit"` (one transient malformed-JSON failure, succeeded on retry) → competitors.threat_tiers count 14, capability_matrix threats 3. Live browser check (demo account, Replit → Competitors tab): rows grouped Direct (Cursor/Cognition/Lovable) → Indirect (Codeium/CodeSandbox/GitHub Codespaces/Gitpod/Glitch/StackBlitz) → Emerging (Rork/Rosebud/Windsurf) → Unclassified (highlighted Replit target). Capability Matrix: Replit (em-dash) + Cursor 8/9/7/8, Cognition 7/6/6/7, Lovable 6/7/8/6 as RatingIndicator bars, with a confidence-chipped narrative. Existing columns preserved; **zero console errors**. tsc clean, eslint clean, build succeeds, Vitest 173/173 green.

## Deviations from Plan
None - plan executed as written. (Two environment gremlins during verification: a transient Grok malformed-JSON regen failure — retried successfully, and a follow-up task filed to harden runDeepDive against clobbering good analyses; and a stale `.next` cache requiring a clean rebuild.)

## Next Phase Readiness
- Competitive analysis renders end-to-end. Phase 4 (ingestion) will make competitor grounding real; Phase 5 (Valuation Targets) can proceed.

---
*Phase: 03-competitors-enrichment*
*Completed: 2026-07-02*
