---
phase: 01-foundation
plan: 04
subsystem: deep-dive-trigger
tags: [server-action, rls, client-component, useTransition, staged-progress, empty-state, staleness, revalidatePath]

requires:
  - runDeepDive(supabase, company) generation agent (lib/agents/deep-dive.ts, 01-02)
  - getCompanyAnalysis(companyId) reader (lib/queries.ts, 01-01)
  - getCompany(id) RLS-scoped reader (lib/queries.ts)
  - DeepDiveEmpty empty-state primitive with action slot (components/company/confidence-chip.tsx, 01-03)
  - isStale(generatedAt, latestDataChange) helper (lib/analysis/staleness.ts, 01-03)
  - SyncButton staged-progress pattern (components/company/sync-button.tsx)
  - ActionResult + requireUser() server-action conventions (app/(app)/companies/actions.ts)
provides:
  - runDeepDiveAction(companyId) — on-demand deep-dive server action under the RLS user client
  - DeepDiveButton — "use client" Run deep-dive trigger with staged progress, separate from Sync
  - Company page empty-state CTA before first run + generated_at / "may be stale" hint after
affects: [overview-enrichment, competitors-enrichment, valuation-targets]

tech-stack:
  added: []
  patterns:
    - "Button-triggered generation runs under the cookie-bound RLS user client (getCompany + requireUser's supabase), never the service-role admin client — RLS is the authz boundary"
    - "Staged progress mirrors SyncButton: useTransition + a setTimeout-advanced label ('Gathering context…' → 'Analysing…') so one long Grok pass reads as staged, not frozen"
    - "role=progressbar + aria-live=polite + aria-busy on the status text for assistive tech"
    - "Server Component derives latestDataChange from already-loaded valuations (created_at) + competitors (updated_at ?? created_at) and feeds isStale — no extra query"
    - "DeepDiveEmpty consumes DeepDiveButton via its action slot (empty-state CTA), proving the Plan 03 extension point"

key-files:
  created:
    - components/company/deep-dive-button.tsx
  modified:
    - app/(app)/companies/actions.ts
    - app/(app)/companies/[id]/page.tsx

key-decisions:
  - "Action loads the company via getCompany (its own RLS user client) for ownership enforcement, then calls runDeepDive with requireUser()'s RLS supabase — a non-owner gets null (Company not found), never another user's row (T-01-10 mitigation)"
  - "Re-run overwrites: no explicit delete/version logic needed — runDeepDive upserts on company_id, so a second click replaces the row with a fresh generated_at"
  - "Staleness compares generated_at against the max of valuations.created_at and competitors.updated_at/created_at already on the page; ValuationRow has no updated_at so created_at is used there"
  - "Empty/stale UI placed as an additive block between the header and the Key stats card; existing tabs untouched (behavior-preserving) — full narrative rendering is Phase 2"
  - "lucide icons (Sparkles/Check) render only inside the client DeepDiveButton and the client-safe page RSC usage; none crosses the server→client boundary as a prop"

requirements-completed: [FND-04, FND-06]

metrics:
  duration: ~15min
  completed: 2026-07-02
  tasks: 2
  files: 3
---

# Phase 1 Plan 4: Run Deep-Dive Trigger + Empty/Stale Wiring Summary

The final vertical-slice task: a `runDeepDiveAction` server action that runs `runDeepDive` under the RLS user client and revalidates the company page, a `"use client"` "Run deep-dive" header button with staged progress (separate from Sync, re-run overwrites), and the company page's empty-state CTA + "may be stale" hint — a user can now click a button and generate a stored analysis.

## What Was Built

### Task 1 — `runDeepDiveAction` server action (`app/(app)/companies/actions.ts`)
- Exported `runDeepDiveAction(companyId): Promise<ActionResult>`.
- Guards auth via `requireUser()` (`if (!user) return { error: "Not authenticated." }`).
- Loads the company with relations through `getCompany(companyId)` — the RLS user client enforces ownership, so a non-owner reads `null` (returns `{ error: "Company not found." }`) rather than another user's row.
- Calls `runDeepDive(supabase, company)` with `requireUser()`'s cookie-bound RLS client inside try/catch, returning `{ error }` on failure instead of throwing (degrade-gracefully convention). Never imports/uses `createAdminClient`.
- On success `revalidatePath(\`/companies/${companyId}\`)` and returns `{ id: companyId }`.
- Re-run overwrites the stored row via the agent's `company_id` upsert with a fresh `generated_at` (FND-04).

### Task 2 — `DeepDiveButton` + header/empty-state/stale wiring
- `components/company/deep-dive-button.tsx` (`"use client"`): `DeepDiveButton({ companyId })` mirroring `SyncButton` — `useTransition`, local `done`/`error` state, `router.refresh()` on success, `Button` `size="sm" variant="outline"` so it reads as a distinct control separate from Sync.
- Staged progress: a `setTimeout`-advanced label steps `"Gathering context…" → "Analysing…"` while pending; the status `<span>` carries `role="progressbar"`, `aria-live="polite"`, `aria-busy`. Lucide `Sparkles`/`Check` icons render inside this client component only.
- `app/(app)/companies/[id]/page.tsx`: imports and renders `<DeepDiveButton companyId={company.id} />` beside `<SyncButton />` in the header actions; reads the stored analysis via `getCompanyAnalysis(id)` (added to the existing `Promise.all`).
- When analysis is `null`, renders `<DeepDiveEmpty action={<DeepDiveButton … />} />` (empty-state CTA — FND-06). When it exists, shows `generated_at` (via `formatDate`) plus a `Badge` "May be stale" hint computed by `isStale(analysis.generated_at, latestDataChange)`, where `latestDataChange` is the most recent `created_at`/`updated_at` among the company's valuations and competitors already loaded on the page.
- Behavior-preserving: existing tabs' content/rendering untouched — the status block is additive between the header and Key stats card.

## Verification

- `npx tsc --noEmit`: clean.
- `npm run test`: full suite green — 22 files / 156 tests pass (unchanged; this plan adds UI wiring, no new unit tests required by the plan).
- `npm run build`: compiles successfully — all routes including `/companies/[id]` render; type-checking passes. The build's final lint step is blocked ONLY by the pre-existing `lib/agents/refresh.ts` undefined-eslint-rule error (guardrail: do not touch). A build with that pre-existing lint bypassed completes all routes cleanly, confirming this plan's files are build- and type-clean.
- `npm run lint` on own files: clean (deep-dive-button.tsx, actions.ts, page.tsx produce no lint errors).
- Grep gates: `runDeepDiveAction` == 1 export; action calls `runDeepDive(` + `revalidatePath`, guards `if (!user)`, no `createAdminClient`; button file starts `"use client"`, exports `DeepDiveButton` (==1), uses `useTransition` + `runDeepDiveAction`; page imports `DeepDiveButton`/`getCompanyAnalysis`/`isStale`/`DeepDiveEmpty` and still renders `SyncButton`.

## Deviations from Plan

None affecting behavior. The plan executed as written.

Note on `latestDataChange`: `ValuationRow` exposes `created_at` (no `updated_at`), while `CompetitorRow` exposes both — so the derivation uses `updated_at ?? created_at` for competitors and `created_at` for valuations. This matches the plan's "most recent `updated_at`/`created_at`" intent given the available columns; not a deviation, just the concrete field selection.

## Known Stubs

None. The button is fully wired to `runDeepDiveAction`; the empty-state CTA and stale hint are driven by real reads (`getCompanyAnalysis`, page-loaded valuations/competitors). The narrative sections themselves render into tabs in Phase 2 — this plan intentionally surfaces only the trigger + empty/stale states per the phase boundary.

## Deferred / Pre-existing (not in scope)

- `lib/agents/refresh.ts:34` undefined-eslint-rule error — pre-existing (commit `88415bb`), already logged in `deferred-items.md`. Left untouched per guardrail; blocks only the build's lint step, not compilation/type-checking.
- `supabase/.temp/` (Supabase CLI scratch) is untracked and not gitignored — newly logged to `deferred-items.md`; left unstaged, not committed.

## Self-Check: PASSED

- FOUND: components/company/deep-dive-button.tsx
- FOUND: app/(app)/companies/actions.ts (runDeepDiveAction)
- FOUND: app/(app)/companies/[id]/page.tsx (DeepDiveButton + empty/stale wiring)
- FOUND commit: 426b696 (runDeepDiveAction server action)
- FOUND commit: a47dcb8 (DeepDiveButton + page wiring)
