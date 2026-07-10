---
phase: quick-260710-8rp
plan: 01
subsystem: deploy/infra
tags: [cloudflare, opennext, workers, deployment, next.js]
requires: []
provides:
  - "Cloudflare Workers deploy path via @opennextjs/cloudflare (wrangler.jsonc + open-next.config.ts + preview:cf/deploy:cf scripts)"
affects:
  - next.config.mjs
  - package.json
tech-stack:
  added:
    - "@opennextjs/cloudflare@1.14.1 (devDependency, pinned)"
  patterns:
    - "Dual deploy targets: Vercel (primary) + Cloudflare Workers (secondary) from one Next.js source"
key-files:
  created:
    - wrangler.jsonc
    - open-next.config.ts
    - .dev.vars.example
  modified:
    - next.config.mjs
    - package.json
    - package-lock.json
    - .gitignore
decisions:
  - "Pinned @opennextjs/cloudflare to 1.14.1 (newest release with no strict next peer constraint) because the latest 1.20.1 requires next >=15.5.18 and the project pins next@15.1.3"
  - "Omitted incrementalCache / R2 / WORKER_SELF_REFERENCE / IMAGES bindings — plain SSR + Supabase app needs none; build passed with the minimal wrangler.jsonc"
metrics:
  duration: "~35 min (dominated by npm install into shared node_modules + OpenNext build)"
  completed: 2026-07-10
  tasks: 3
  files: 7
requirements: [CF-DEPLOY-01]
---

# Phase quick-260710-8rp Plan 01: Cloudflare Workers Deploy via OpenNext Summary

Added a second, self-hostable deploy target (Cloudflare Workers) to the Next.js 15.1.3
app via `@opennextjs/cloudflare`, leaving the existing Vercel path completely untouched.
Both targets build from the same Next.js source; the acceptance gate — a clean
`opennextjs-cloudflare build` emitting `.open-next/worker.js` + `.open-next/assets` — passes.

## What was built

- **`wrangler.jsonc`** — Cloudflare Worker config: `main: ".open-next/worker.js"`,
  `compatibility_date: "2025-05-05"`, `compatibility_flags: ["nodejs_compat",
  "global_fetch_strictly_public"]`, `assets: { directory: ".open-next/assets",
  binding: "ASSETS" }`. No ISR/cache/image bindings (not needed for this SSR app).
- **`open-next.config.ts`** — `defineCloudflareConfig({})` (built-in dummy incremental
  cache; no R2 wired).
- **`next.config.mjs`** — additive only: `import { initOpenNextCloudflareForDev }` at top,
  `initOpenNextCloudflareForDev()` called after `export default nextConfig`. All prior
  config (`serverExternalPackages`, `images.remotePatterns`, `serverActions.bodySizeLimit`)
  left intact.
- **`package.json`** — `@opennextjs/cloudflare@1.14.1` devDependency + `preview:cf`,
  `deploy:cf`, `cf-typegen` scripts (existing scripts untouched).
- **`.dev.vars.example`** — placeholder-only workerd/preview runtime secret template
  mirroring `.env.local.example`.
- **`.gitignore`** — ignores `.dev.vars`, `.open-next/`, `.wrangler/`, `cloudflare-env.d.ts`
  (`.dev.vars.example` stays tracked).

## Tasks

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Install adapter + create wrangler.jsonc/open-next.config.ts, additive next.config.mjs | 7e0b7ad |
| 2 | CF scripts + .dev.vars.example + gitignore entries | b5506f6 |
| 3 | Verify clean OpenNext build + tsc/lint/test green (verification only) | 5484dcc (gitignore .wrangler cleanup) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Pinned adapter to a next@15.1.3-compatible version**
- **Found during:** Task 1
- **Issue:** `npm install --save-dev @opennextjs/cloudflare` (latest = 1.20.1) failed with
  ERESOLVE — its `next` peer range is `>=15.5.18 <16 || >=16.2.6`, but the project pins
  next@15.1.3. No published version's peer range formally includes 15.1.3 (the 15.1 line
  starts at 15.1.9), so this is a genuine version-compatibility block, not a missing/
  hallucinated package (package legitimacy already established in the plan's threat model).
- **Fix:** Installed the SAME confirmed-legitimate package at `@opennextjs/cloudflare@1.14.1`
  — the newest release that declares **no strict `next` peer constraint** (its wrangler peer
  `^4.49.1` is satisfied by the project's `^4.86.0`), from the era targeting the Next 15.1.x
  line. Pinned exactly (`--save-exact`) so a future `npm install` cannot silently jump to a
  15.5-only release. The subsequent `opennextjs-cloudflare build` completed cleanly against
  next@15.1.3, confirming runtime compatibility.
- **Files modified:** package.json, package-lock.json
- **Commit:** 7e0b7ad

**2. [Rule 3 - Blocking] Gitignore `.wrangler/` build cache**
- **Found during:** Task 3
- **Issue:** `opennextjs-cloudflare build` emits an untracked `.wrangler/` local cache dir;
  the plan's gitignore list (Task 2) covered `.open-next/` but not `.wrangler/`.
- **Fix:** Added `.wrangler/` to the cloudflare/opennext gitignore section so no generated
  build output is left untracked.
- **Files modified:** .gitignore
- **Commit:** 5484dcc

## Notes / Out of Scope

- **package-lock.json churn:** Installing into the worktree's symlinked (shared) node_modules
  reconciled the lockfile to the versions actually present in the shared store. Core pins are
  intact and unchanged (next@15.1.3, react@19.2.7, wrangler@4.86.0); a few transitive/dev deps
  recorded newer patch versions that still satisfy their `package.json` semver ranges. The new
  `@opennextjs/cloudflare` tree adds its expected transitive deps (aws-sdk for R2, @ast-grep/napi
  for code patching, miniflare/workerd for local runtime).
- **ESLint plugin-conflict warning:** `npm run lint` prints a `@next/next` plugin conflict
  between this worktree's `.eslintrc.json` and the main repo's `.eslintrc.json` up the tree.
  This is a worktree-nesting environment artifact (the worktree lives inside the main repo),
  not caused by this change; `next lint` still exits 0.
- **Two harmless esbuild `-0 === ` warnings** during OpenNext bundling originate inside bundled
  vendor/Next.js chunks (`chunks/555.js`, `chunks/920.js`), not project source — informational,
  not errors.

## Verification Results

- `opennextjs-cloudflare build`: exit 0 — `.open-next/worker.js` (2646 B) + `.open-next/assets/` emitted.
- `npx tsc --noEmit`: exit 0 (clean).
- `npm run lint`: exit 0 (clean; pre-existing worktree plugin-conflict warning only).
- `npm run test`: 29 files / 274 tests passed.
- `git status`: vercel.json unmodified; next.config.mjs change confirmed additive-only.
- `git check-ignore`: `.dev.vars`, `.open-next/`, `.wrangler/` ignored; `.dev.vars.example` NOT ignored.

## Threat Flags

None — no new network endpoints, auth paths, or trust-boundary surface introduced.
All threat-register mitigations (T-8rp-SC devDependency-only install, T-8rp-01 `.dev.vars`
gitignored, T-8rp-02 additive next.config / untouched vercel.json) satisfied.

## Self-Check: PASSED

- All created/modified files present on disk (wrangler.jsonc, open-next.config.ts,
  .dev.vars.example, next.config.mjs, package.json, .gitignore, SUMMARY.md).
- All task commits exist in git history (7e0b7ad, b5506f6, 5484dcc).
- Build output `.open-next/worker.js` present (gitignored, not committed).
