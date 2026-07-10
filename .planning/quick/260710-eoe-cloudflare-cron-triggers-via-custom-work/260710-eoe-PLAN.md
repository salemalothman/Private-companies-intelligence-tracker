---
phase: 260710-eoe
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - worker/index.ts
  - wrangler.jsonc
  - tsconfig.json
  - lib/request-origin.ts
  - lib/request-origin.test.ts
  - app/(auth)/actions.ts
autonomous: true
requirements: [CF-CRON-01, CF-AUTH-HOST-01]
user_setup:
  - service: cloudflare-workers
    why: "Scheduled dispatch and host-following reset links only take effect after deploy (deploy is out of scope for this plan)."
    env_vars:
      - name: CRON_SECRET
        source: "Cloudflare dashboard -> Workers -> private-companies-tracker -> Settings -> Variables & Secrets (must match the value the cron routes verify)"
    dashboard_config:
      - task: "Add the Cloudflare Workers host, the Vercel host, and localhost to the Supabase Auth Redirect URLs allowlist (Auth -> URL Configuration) so password-reset redirectTo values are accepted"
        location: "Supabase Dashboard -> Authentication -> URL Configuration -> Redirect URLs"

must_haves:
  truths:
    - "Cloudflare Workers scheduled events fire the six cron routes in-process using the bearer token, mirroring vercel.json schedules"
    - "An unknown/unmapped cron expression logs and no-ops without dispatching or throwing"
    - "opennextjs-cloudflare build resolves the custom main (worker/index.ts) and completes cleanly"
    - "Password-reset links from the Cloudflare deployment point at the serving host (workers.dev); Vercel keeps its host; localhost keeps localhost"
    - "Digest/approval email link precedence (NEXT_PUBLIC_SITE_URL-first via siteUrl()) is unchanged"
  artifacts:
    - path: "worker/index.ts"
      provides: "Custom worker entrypoint: delegates fetch to generated OpenNext worker + adds scheduled() cron dispatcher"
      contains: "scheduled"
    - path: "wrangler.jsonc"
      provides: "main -> worker/index.ts and triggers.crons with the six schedules"
      contains: "triggers"
    - path: "lib/request-origin.ts"
      provides: "Pure helper deriving proto://host origin from forwarded headers, null when no host"
      exports: ["requestOrigin"]
    - path: "lib/request-origin.test.ts"
      provides: "Unit coverage for requestOrigin (x-forwarded-* precedence, host fallback, null case)"
  key_links:
    - from: "worker/index.ts scheduled()"
      to: "generated OpenNext fetch handler"
      via: "in-process worker.fetch(syntheticRequest, env, ctx) inside ctx.waitUntil"
      pattern: "waitUntil"
    - from: "app/(auth)/actions.ts requestPasswordReset"
      to: "lib/request-origin.ts requestOrigin"
      via: "requestOrigin(headers()) ?? siteUrl()"
      pattern: "requestOrigin"
---

<objective>
Ship two Cloudflare-deployment features without disturbing the Vercel deployment:

1. **Cron Triggers on Workers** — Add a custom worker entrypoint that re-exports the OpenNext-generated `fetch` handler and adds a `scheduled()` handler. Wire `triggers.crons` in wrangler.jsonc for the six schedules mirrored from vercel.json. The scheduled handler maps `controller.cron` -> route path and dispatches IN-PROCESS through the OpenNext fetch handler with a synthetic bearer-authenticated request (never a network self-fetch, since `global_fetch_strictly_public` makes that unreliable).

2. **Auth links follow the serving host** — In `requestPasswordReset`, derive the recovery `redirectTo` from the inbound request origin FIRST (x-forwarded-host/proto, then host), falling back to `siteUrl()` only when no host header exists. `siteUrl()`'s global precedence stays untouched so digest/approval emails keep their canonical NEXT_PUBLIC_SITE_URL-first order.

Purpose: The Cloudflare Workers deployment currently runs no crons and mails reset links to the wrong (Vercel-canonical) host. This closes both gaps while leaving Vercel behavior identical.
Output: `worker/index.ts`, updated `wrangler.jsonc` + `tsconfig.json`, new `lib/request-origin.ts` (+ test), patched `app/(auth)/actions.ts`.
Note: Deploy is OUT of scope — the orchestrator deploys after merge. The acceptance gate proves the build resolves, not the live schedule.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

<interfaces>
<!-- Extracted from the codebase. Use directly — no exploration needed. -->

Generated OpenNext worker artifact (.open-next/worker.js — GITIGNORED build artifact, path from worker/ is ../.open-next/worker.js):
```
// default export:
export default {
  fetch(request, env, ctx): Promise<Response>
}
// named exports (present in the artifact; harmless to re-export, only bound if wrangler declares durable_objects — it does not today):
export { DOQueueHandler, DOShardedTagCache, BucketCachePurge }
```

Cron route contract (all six routes follow this shape — app/api/cron/*/route.ts):
```
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ...runs agent, returns JSON
}
```
A synthetic GET Request with header `authorization: Bearer <CRON_SECRET>` satisfies this. Method defaults to GET.

vercel.json schedules (source of truth — DO NOT MODIFY vercel.json):
```
/api/cron/market-sync     "0 13 * * 1"
/api/cron/daily-refresh   "0 6 * * *"
/api/cron/news-sentiment  "30 6 * * *"
/api/cron/exa-events      "0 14 * * 1"
/api/cron/global-sync     "0 4 * * 1"
/api/cron/weekly-digest   "0 8 * * 1"
```
All six cron expressions are unique -> a string-keyed map is unambiguous.

lib/site-url.ts (existing — precedence must stay: explicit NEXT_PUBLIC_SITE_URL -> VERCEL_URL -> request origin):
```
export async function siteUrl(): Promise<string>  // has `import "server-only"` at top
```

app/(auth)/actions.ts requestPasswordReset (current redirectTo line to change):
```
const redirectTo = `${await siteUrl()}/auth/confirm`;
```
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Custom worker entrypoint + wrangler cron triggers</name>
  <files>worker/index.ts, wrangler.jsonc, tsconfig.json</files>
  <action>
Create `worker/index.ts` as a MINIMAL routing entrypoint — no business logic. It must:
- Import the generated worker default export from `../.open-next/worker.js`. Because `.open-next/` is a gitignored build artifact absent at tsc time, prefix the import with `// @ts-expect-error: resolved by opennextjs-cloudflare build`. Mirror the generated worker's own convention (it uses the same directive for build-resolved imports).
- Also re-export the artifact's named Durable Object classes with a matching `// @ts-expect-error` line: `export { DOQueueHandler, DOShardedTagCache, BucketCachePurge } from "../.open-next/worker.js";` — harmless today (no durable_objects binding) and forward-compatible if OpenNext caching DOs are enabled later.
- Define a `CRON_ROUTES` record mapping EACH of the six exact cron expression strings to its route path (copy the six pairs verbatim from the vercel.json interface block above — market-sync "0 13 * * 1", daily-refresh "0 6 * * *", news-sentiment "30 6 * * *", exa-events "0 14 * * 1", global-sync "0 4 * * 1", weekly-digest "0 8 * * 1").
- Because `@cloudflare/workers-types` is NOT installed, declare local minimal types inline: a `ScheduledController` interface with `cron: string`, an `Ctx` interface with `waitUntil(p: Promise<unknown>): void`, and an `Env` interface with `CRON_SECRET: string`. Keep them tiny; they exist only so the file reads clearly.
- Export `default` with two members: (a) a `fetch(request, env, ctx)` method that delegates to the generated worker's fetch (`return generated.fetch(request, env, ctx)` — use a wrapper method, do NOT copy `generated.fetch` by reference, to avoid any `this`-binding surprise), and (b) an `async scheduled(controller, env, ctx)` handler that: looks up `CRON_ROUTES[controller.cron]`; if unmapped, `console.error("worker: unmapped cron expression:", controller.cron)` and RETURN (no throw, no dispatch); otherwise builds `const req = new Request(\`https://cron.internal${path}\`, { headers: { authorization: \`Bearer ${env.CRON_SECRET}\` } })` and dispatches IN-PROCESS via `ctx.waitUntil(this.fetch(req, env, ctx))` (or `defaultExport.fetch(...)` if `this` is awkward). The host in the URL is arbitrary and never network-fetched.

Update `wrangler.jsonc`:
- Change `"main"` from `".open-next/worker.js"` to `"worker/index.ts"`.
- Add a top-level `"triggers": { "crons": [ ... ] }` array containing the six cron expression strings exactly as in vercel.json (order does not matter; the map keys on the string).
- Leave `name`, `account_id`, `compatibility_date`, `compatibility_flags`, and `assets` untouched.

Update `tsconfig.json`:
- Add `"worker"` to the `exclude` array (so the main `tsc --noEmit` gate does not try to resolve the absent `.open-next/worker.js`). The worker entry is typechecked-by-bundling via the opennextjs-cloudflare build gate instead.

DO NOT touch vercel.json (Vercel crons keep working unchanged).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx opennextjs-cloudflare build</automated>
  </verify>
  <done>worker/index.ts routes all six cron expressions to their route paths and no-ops on unknown strings; wrangler.jsonc main points at the custom entry with six triggers.crons; tsc is clean (worker excluded) and `opennextjs-cloudflare build` completes, proving the custom main resolves `.open-next/worker.js`.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Password-reset redirectTo follows the serving host</name>
  <files>lib/request-origin.ts, lib/request-origin.test.ts, app/(auth)/actions.ts</files>
  <behavior>
    requestOrigin(headers) — pure, no side effects, no server-only import:
    - Test 1: x-forwarded-host + x-forwarded-proto present -> returns `${proto}://${host}` (e.g. `https://private-companies-tracker.salem-alothman.workers.dev`).
    - Test 2: only `host` present (no forwarded headers) -> returns `http://${host}` (proto defaults to "http", matching lib/site-url.ts).
    - Test 3: x-forwarded-host takes precedence over host when both present.
    - Test 4: no host and no x-forwarded-host -> returns null (signals caller to fall back to siteUrl()).
  </behavior>
  <action>
Create `lib/request-origin.ts` with a single pure exported function `requestOrigin(h: { get(name: string): string | null }): string | null`. Logic mirrors lib/site-url.ts's request-origin branch EXACTLY: `const host = h.get("x-forwarded-host") ?? h.get("host"); if (!host) return null; const proto = h.get("x-forwarded-proto") ?? "http"; return \`${proto}://${host}\`;`. Add a short JSDoc explaining WHY it lives separately from siteUrl(): it is used only for password-reset links so they follow the serving host, and it deliberately does NOT alter siteUrl()'s canonical-first precedence used by digest/approval emails. Do NOT add `import "server-only"` here — keeping it plain makes it unit-testable under vitest's node environment and imposes no client-bundle constraint (it holds no secrets).

Create `lib/request-origin.test.ts` co-located, covering the four behaviors above. Use a tiny fake header object: `const h = (m: Record<string,string>) => ({ get: (k: string) => m[k] ?? null });`. Import via `@/lib/request-origin`. Follow existing vitest style (describe/it/expect, node env).

Patch `app/(auth)/actions.ts` `requestPasswordReset` ONLY:
- Add imports: `import { headers } from "next/headers";` and `import { requestOrigin } from "@/lib/request-origin";`.
- Replace the redirectTo line inside the existing try block: derive `const h = await headers();` then `const origin = requestOrigin(h) ?? (await siteUrl());` then `const redirectTo = \`${origin}/auth/confirm\`;`.
- Keep the surrounding try/catch, the neutral `{ sent: true }` return, and the existing JSDoc intact (optionally refresh the JSDoc note about redirectTo to say it now follows the serving host but is still server-derived, never user input). Do NOT modify signup/login/updatePassword or the `siteUrl()` import usage elsewhere.
  </action>
  <verify>
    <automated>npx vitest run lib/request-origin.test.ts && npx tsc --noEmit && npx next lint</automated>
  </verify>
  <done>requestOrigin is unit-tested green for all four cases; requestPasswordReset builds redirectTo from the inbound origin first and falls back to siteUrl() only when no host header exists; siteUrl() and email precedence are unchanged; tsc and lint clean.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Cloudflare cron scheduler -> worker.scheduled() | Platform-triggered event; must authenticate before hitting cron business logic |
| worker.scheduled() -> cron route handler | In-process dispatch must carry the same bearer the route verifies |
| Inbound request Host/x-forwarded-host -> password-reset redirectTo | Client-controlled header influences an emailed link target |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-eoe-01 | Spoofing/Elevation | worker.scheduled dispatch | mitigate | Synthetic request carries `Authorization: Bearer ${env.CRON_SECRET}`; cron routes 401 without the exact match. No new unauthenticated surface introduced. |
| T-eoe-02 | Tampering/DoS | cron-expression map | mitigate | Unknown `controller.cron` logs and no-ops — never dispatches or throws, so a stray schedule cannot trigger an arbitrary route. |
| T-eoe-03 | Information disclosure / open redirect | requestPasswordReset redirectTo | mitigate | x-forwarded-host is client-spoofable, but Supabase Auth only honors redirectTo values on its Redirect URLs allowlist; host-injected values are rejected. Deploy-time: add workers.dev + Vercel + localhost to the allowlist (user_setup). redirectTo remains server-derived, never request body input. |
| T-eoe-SC | Tampering | npm/pip/cargo installs | n/a | No new dependencies installed (@opennextjs/cloudflare 1.14.1 already present). |
</threat_model>

<verification>
- `npx tsc --noEmit` clean (worker/ excluded; rest of app typechecks including patched actions.ts).
- `npx next lint` clean.
- `npm run test` (vitest run) green, including the new lib/request-origin.test.ts.
- `npx opennextjs-cloudflare build` completes cleanly — proves `main: worker/index.ts` resolves and bundles the generated `.open-next/worker.js`.
- vercel.json is unmodified (Vercel crons intact).
</verification>

<success_criteria>
- wrangler.jsonc `main` is `worker/index.ts` with `triggers.crons` covering all six vercel.json schedules.
- worker/index.ts delegates fetch to the generated worker and dispatches each cron in-process (ctx.waitUntil) with a bearer-authenticated synthetic request; unknown crons no-op.
- Password-reset links follow the serving host on Cloudflare (workers.dev), Vercel, and localhost; email/siteUrl precedence unchanged.
- All four acceptance gates pass (tsc, lint, test, opennextjs-cloudflare build).
</success_criteria>

<output>
Create `.planning/quick/260710-eoe-cloudflare-cron-triggers-via-custom-work/260710-eoe-SUMMARY.md` when done.
</output>
