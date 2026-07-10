---
phase: 260710-eoe
plan: 01
subsystem: deployment/auth
tags: [cloudflare-workers, cron, opennext, auth, password-reset]
requires: []
provides:
  - "worker/index.ts scheduled() cron dispatcher (in-process, bearer-authenticated)"
  - "wrangler triggers.crons mirroring vercel.json"
  - "lib/request-origin.ts requestOrigin() pure helper"
  - "host-following password-reset redirectTo"
affects:
  - worker/index.ts
  - wrangler.jsonc
  - tsconfig.json
  - lib/request-origin.ts
  - app/(auth)/actions.ts
tech-stack:
  added: []
  patterns:
    - "Custom Workers entrypoint wrapping the OpenNext-generated fetch handler + scheduled()"
    - "In-process synthetic-Request cron dispatch (no network self-fetch under global_fetch_strictly_public)"
    - "Serving-host-following auth link derivation, siteUrl() fallback"
key-files:
  created:
    - worker/index.ts
    - lib/request-origin.ts
    - lib/request-origin.test.ts
  modified:
    - wrangler.jsonc
    - tsconfig.json
    - app/(auth)/actions.ts
decisions:
  - "worker/ excluded from tsc (imports gitignored .open-next/worker.js); typechecked-by-bundling via opennextjs-cloudflare build"
  - "requestOrigin kept plain (no server-only import) for vitest node-env testability; holds no secrets"
metrics:
  duration: "~15m"
  completed: "2026-07-10"
requirements: [CF-CRON-01, CF-AUTH-HOST-01]
---

# Phase 260710-eoe Plan 01: Cloudflare Cron Triggers + Host-Following Auth Links Summary

Added a custom Cloudflare Workers entrypoint that wraps the OpenNext-generated `fetch`
handler with a `scheduled()` cron dispatcher (six schedules mirrored from vercel.json,
dispatched in-process with a bearer-authenticated synthetic request), and made
password-reset links follow the serving host via a new pure `requestOrigin()` helper —
all without disturbing Vercel behavior.

## What Was Built

### Task 1 — Custom worker entrypoint + wrangler cron triggers (commit 6034dc7)
- `worker/index.ts`: imports the generated OpenNext worker (`../.open-next/worker.js`,
  `@ts-expect-error` for the build-resolved gitignored artifact), re-exports its
  Durable Object classes, and exports a `default` with:
  - a `fetch(request, env, ctx)` wrapper delegating to the generated handler, and
  - an `async scheduled(controller, env, ctx)` that maps `controller.cron` -> route
    path via a `CRON_ROUTES` record, `console.error`s + no-ops on an unknown
    expression, and otherwise dispatches `ctx.waitUntil(defaultExport.fetch(req, ...))`
    with `Request("https://cron.internal<path>", { headers: { authorization: "Bearer <CRON_SECRET>" } })`.
  - Minimal inline `ScheduledController` / `Ctx` / `Env` types (no `@cloudflare/workers-types`).
- `wrangler.jsonc`: `main` -> `worker/index.ts`; added `triggers.crons` with the six
  vercel.json schedules. `name`, `account_id`, `compatibility_date`,
  `compatibility_flags`, `assets` left untouched.
- `tsconfig.json`: added `"worker"` to `exclude`.

### Task 2 — Password-reset redirectTo follows serving host (TDD; commits 5c3cec6 RED, 1811211 GREEN)
- `lib/request-origin.ts`: pure `requestOrigin(h)` — `x-forwarded-host ?? host`, `null`
  when absent, `proto` defaults to `http`; mirrors `lib/site-url.ts`'s request-origin
  branch exactly. No `server-only` import.
- `lib/request-origin.test.ts`: four cases (forwarded precedence, host fallback,
  x-forwarded-host over host, null case).
- `app/(auth)/actions.ts`: `requestPasswordReset` now derives
  `const origin = requestOrigin(await headers()) ?? (await siteUrl())` and builds
  `redirectTo = ${origin}/auth/confirm`. `siteUrl()` and all other actions unchanged;
  JSDoc refreshed to note host-following behavior.

## Deviations from Plan

None — plan executed exactly as written.

## Acceptance Gates

- `npx tsc --noEmit` — clean (worker/ excluded).
- `npx next lint` — "No ESLint warnings or errors".
- `npm run test` (vitest) — 287 passed (30 files), including the new 4-case suite.
- `npx opennextjs-cloudflare build` — exit 0; `Worker saved in .open-next/worker.js`,
  proving `main: worker/index.ts` resolves and bundles the generated artifact. (The two
  `equals-negative-zero` esbuild warnings are pre-existing in generated Next.js vendor
  chunks — out of scope, not introduced by this plan.)
- `vercel.json` and `lib/site-url.ts` — unmodified (verified via `git diff` vs. base).

## Notes / Follow-ups (deploy-time, out of scope)

- `CRON_SECRET` must be set on the Cloudflare Workers project (Settings -> Variables &
  Secrets) matching the value the cron routes verify.
- Add the workers.dev host, the Vercel host, and localhost to Supabase Auth Redirect URLs
  allowlist so the host-following `redirectTo` values are honored.
- Deploy itself is handled by the orchestrator after merge; this plan only proves the
  build resolves, not the live schedule.

## Self-Check: PASSED

- worker/index.ts — FOUND
- lib/request-origin.ts — FOUND
- lib/request-origin.test.ts — FOUND
- Commits 6034dc7, 5c3cec6, 1811211 — FOUND
