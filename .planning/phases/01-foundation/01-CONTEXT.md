# Phase 1: Foundation - Context

**Gathered:** 2026-07-02
**Status:** Ready for planning
**Source:** Approved design spec (`docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md`)

<domain>
## Phase Boundary

Phase 1 lays the shared substrate that Phases 2–4 all consume. It delivers:
- A `company_analysis` storage table (one JSONB row per company).
- A single Grok deep-dive agent (`runDeepDive`) that generates the structured
  analysis from existing in-app grounding context.
- An on-demand "Run deep-dive" trigger (header button, staged progress, separate
  from Sync).
- A shared Fact/Estimate + Low/Med/High confidence chip primitive.

**Out of this phase:** rendering the narrative into tabs (Phase 2), Competitors
enrichment (Phase 3), Valuation Targets tab + factual financials (Phase 4). Phase 1
must produce and store the data shapes those phases read, but does NOT surface the
full analysis UI beyond the trigger + empty/stale states + the chip primitive.
</domain>

<decisions>
## Implementation Decisions

### Storage (FND-01)
- New Supabase table `company_analysis`: `id uuid pk`, `company_id uuid` (unique,
  FK → companies, RLS anchor), `generated_at timestamptz`, `model text`,
  `sections jsonb`, `valuation jsonb`.
- One row per company; generation upserts on `company_id`.
- RLS: readable/writable only by the owner of the referenced company — mirror the
  existing per-company table RLS pattern (user client) and allow the service-role
  admin client used by agents.
- Add the table to the hand-maintained `lib/types.ts` Database interface (typed
  client convention — do not rely on generated types alone).

### Generation agent (FND-02, FND-03)
- New `lib/agents/deep-dive.ts` exporting `runDeepDive(supabase, company)`.
- Gather grounding context already in-app: canonical record (`buildCanonicalRecord`),
  competitor ranking + multiples (`buildCompetitorRanking`), funding/valuation
  history, news, document summaries.
- One Grok call (reuse `lib/connectors/grok.ts`) → a structured `sections` object.
  Competitor discovery REUSES existing competitor sync data — do NOT re-run Phase-0
  discovery here.
- **Comps inputs computed in code, not by the LLM:** peer-multiple percentiles
  (median/p25/p75 across SEC-verified peers) and base revenue are deterministic.
  The LLM supplies ONLY the growth proposal (base rate + rationale + confidence)
  inside `valuation.growth`.
- Upsert the result into `company_analysis`.
- The `sections`/`valuation` JSONB shapes follow the spec exactly (see Canonical
  References). Every forward-looking field carries
  `{ basis: "fact"|"estimate", confidence: "low"|"med"|"high", source? }`.

### Trigger + UX (FND-04, FND-06)
- A "Run deep-dive" header button on the company detail page
  (`app/(app)/companies/[id]/page.tsx` header actions), SEPARATE from `SyncButton`.
- Client component with staged progress mirroring the existing `SyncButton`
  pattern (`useTransition` + staged status, `role=progressbar`/`aria-live`).
- Re-run overwrites the stored row with a fresh `generated_at`.
- A server action (in `app/(app)/companies/actions.ts`) invokes `runDeepDive` and
  `revalidatePath`s the company page.
- Empty state before first run: compact "Run deep-dive" CTA in enriched areas.
- "May be stale" hint when underlying data (valuations/competitors) changed after
  `generated_at`.

### Confidence chip primitive (FND-05)
- One small shared component (e.g. `components/company/confidence-chip.tsx`):
  a Fact/Estimate badge + Low/Med/High confidence indicator, built on the existing
  `components/ui/badge.tsx`.
- Reused wherever generated content appears (Phases 2–4 depend on it).
- Follows the design system: premium minimal flat, hairline, tabular-nums.

### Guardrails (apply to every task)
- No fabricated financial data; no predictive risk metrics / invented probabilities.
- Quantitative valuation ONLY via transparent peer-multiple comps.
- Behavior-preserving for existing tabs; tsc + eslint + Vitest green.
- `.env.local` gitignored; never commit secrets; service-role/cron secrets stay in
  Vercel env.

### Claude's Discretion
- Exact SQL migration file name/location under `supabase/migrations/`.
- Internal structure of the Grok prompt and the TypeScript types for `sections`/
  `valuation` (must match the spec's documented JSONB shapes).
- Exact staged-progress copy and button placement among header actions.
- Whether the chip is one component with variants or a small pair.
</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Design & scope (authoritative)
- `docs/superpowers/specs/2026-07-02-company-deep-dive-analysis-design.md` — full
  feature design; §3 (data model + generation), §4 (`valuation` JSONB shape).
- `.planning/PROJECT.md` — guardrails, constraints, key decisions.
- `.planning/REQUIREMENTS.md` — FND-01..06 acceptance detail.

### Existing patterns to follow (from codebase map)
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONVENTIONS.md`,
  `.planning/codebase/STRUCTURE.md` — layers, naming, patterns.
- `lib/types.ts` — hand-maintained Database interface (add `company_analysis`).
- `lib/supabase/{server,client,admin}.ts` — RLS user client vs service-role admin.
- `lib/canonical.ts` (`buildCanonicalRecord`) + `lib/competitors/rank.ts`
  (`buildCompetitorRanking`) — grounding inputs + peer multiples.
- `lib/connectors/grok.ts` — Grok connector for the structured call.
- `lib/queries.ts` — per-company data access; add a `getCompanyAnalysis` reader.
- `components/company/sync-button.tsx` — staged-progress trigger pattern to mirror.
- `app/(app)/companies/actions.ts` — server-action pattern (`revalidatePath`).
- `components/ui/badge.tsx` + `components/company/provenance.tsx` — existing
  fact/estimate + confidence rendering to build the chip on.
- `components/dashboard/collapsible-section.tsx` — shared section primitive (used
  heavily in Phase 2; note client-boundary rule: lucide icons render client-side).
</canonical_refs>

<specifics>
## Specific Ideas

- Mirror `SyncButton`'s staged `useTransition` progress for "Run deep-dive".
- Compute peer-multiple percentiles from SEC-verified peers only (the Competitors
  tab already flags `secVerified`).
- Keep the LLM's numeric footprint tiny: it proposes a growth rate + rationale +
  confidence; everything else quantitative is code-computed.
</specifics>

<deferred>
## Deferred Ideas

- Rendering the thesis narrative into Overview (Phase 2).
- Threat tiers + Capability Matrix (Phase 3).
- Valuation Targets tab + factual financial detail (Phase 4).
- Auto-regeneration on data change; analysis version history (v2: AUTO-01/02).
</deferred>

---

*Phase: 01-foundation*
*Context gathered: 2026-07-02 from approved design spec*
