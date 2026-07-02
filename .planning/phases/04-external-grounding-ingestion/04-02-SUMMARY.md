---
phase: 04-external-grounding-ingestion
plan: 02
subsystem: ingestion
tags: [off-vercel, cli-envelope, cik-disambiguation, execFile, vitest, service-role]
status: complete
requires:
  - "peer_financials / form_d_rounds / x_posts cache tables (Plan 01)"
  - "companies + competitors typed rows (lib/types.ts)"
provides:
  - "parseEnvelope: throw-free {meta,results} pp-cli envelope parser"
  - "resolveCik: CIK disambiguation (single | ambiguous+candidates)"
  - "runAgentCli: execFile array-arg agent runner (no shell)"
  - "hasBinary / requireEnv preflight helpers"
  - "IngestTarget / SourceSummary / SourceModule dispatch contract"
  - "scripts/ingest-grounding.ts off-Vercel entrypoint (enumeration + guarded dispatch)"
affects:
  - "Plans 03/04/05 source modules (implement the SourceModule dispatch contract)"
  - "package.json npm run ingest"
tech-stack:
  added: []
  patterns:
    - "market-sync.ts off-Vercel bootstrap: ws polyfill + loadEnvFile + inline service-role client"
    - "balanced-brace JSON extractor (adapted from deep-dive.ts extractJson)"
    - "execFile array args (never shell string) for untrusted DB-derived CLI args"
    - "guarded dynamic import for not-yet-implemented modules -> clean skip"
    - "pure functions kept free of server-only so Vitest runs them"
key-files:
  created:
    - lib/ingest/types.ts
    - lib/ingest/cli.ts
    - lib/ingest/cli.test.ts
    - scripts/ingest-grounding.ts
  modified:
    - package.json
decisions:
  - "Tasks 1 + 2 implementation share lib/ingest/cli.ts (pure + impure in one module) — committed together after RED test"
  - "runAgentCli env cast to NodeJS.ProcessEnv (project ProcessEnv requires NODE_ENV; a partial env map is still a valid execFile environment)"
  - "resolveCik treats not-ambiguous-but-no-cik as {ambiguous:true,candidates:[]} so callers never fabricate a CIK"
  - "x-twitter is opt-in: skipped with status 'skipped' when X_BEARER_TOKEN absent"
  - "modules loaded via dynamic import; missing/failing module logs a skip and the run continues"
metrics:
  duration: ~20m
  completed: 2026-07-02
  tasks_completed: 3
  tasks_total: 3
  files: 5
---

# Phase 4 Plan 02: Ingestion Skeleton + CLI-Envelope Layer Summary

Built the shared, unit-tested core of the off-Vercel grounding-ingestion pipeline:
a pure envelope/CIK layer (`lib/ingest/cli.ts` + `lib/ingest/types.ts`) that runs
each Printing Press CLI in `--agent` mode, parses the untrusted `{meta,results}`
JSON defensively (never throwing), and resolves CIK ambiguity before any amount is
trusted — plus the local/cron entrypoint (`scripts/ingest-grounding.ts`) that
wires an inline service-role admin client, enumerates companies + competitors into
`IngestTarget[]`, and dispatches to the three per-source modules (Plans 03/04/05)
with graceful per-source skip. `execFile` array args close the command-injection
boundary for DB-derived values, and secrets are read from env only.

## What Was Built

### Task 1 — Pure envelope parser + CIK disambiguation (TDD) (commits f4b3a08 RED, 32e0aad GREEN)
- `lib/ingest/types.ts`: `IngestTarget`, `SourceSummary`, `Envelope`,
  `CikResolution`, `SourceModule<Admin>` — runtime-agnostic (no `server-only`).
- `parseEnvelope(stdout)`: balanced-brace extractor (adapted from
  `deep-dive.ts extractJson`) + `JSON.parse` in try/catch + plain-object
  validation. Returns `{ok:false,error}` for empty / non-JSON / bare-array /
  bare-number / truncated input — never throws (threat T-04-05).
- `resolveCik(result)`: returns the single CIK (string-coerced) when
  unambiguous; `{ambiguous:true,candidates}` from `cik_summaries` when
  `is_ambiguous`; `{ambiguous:true,candidates:[]}` when no usable CIK — never
  fabricates (threat T-04-07).
- `AGENT_FLAGS`: the five `--agent` flags in order.
- `lib/ingest/cli.test.ts`: 17 Vitest cases (parseEnvelope + resolveCik +
  AGENT_FLAGS), inline fixtures, matching `parse.test.ts` style. RED confirmed
  before GREEN (module-not-found), then all 17 green.

### Task 2 — Agent runner + preflight (impure) (commit 32e0aad, same file)
- `runAgentCli(bin, args, opts)`: spawns via `node:child_process` `execFile`
  (NO shell — DB-derived args are discrete array elements, command injection is
  impossible; threat T-04-04), appends `AGENT_FLAGS`, passes `env` explicitly.
  ENOENT (binary absent) or non-zero exit -> `{ok:false}`, never throws; error
  text carries only the CLI identity + reason, never env/secret values.
- `hasBinary(bin)`: `bin --version` probe, any error -> false (clean skip).
- `requireEnv(name)`: env-only read, value never logged (threat T-04-06).

### Task 3 — Off-Vercel entrypoint (commit 0b55b8b)
- `scripts/ingest-grounding.ts`: market-sync.ts bootstrap verbatim (ws polyfill,
  `process.loadEnvFile(".env.local")` in try/catch, env guard exiting(1) on
  missing `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`, inline
  service-role `createClient`). File header documents the LOCAL/cron-only,
  not-in-Vercel constraint.
- `enumerateTargets`: selects companies (id,user_id,name,website) + competitors
  (filtering out `is_self`), maps to `IngestTarget` with `kind` + derived
  `domain` (hostname from website, strip scheme + `www.`), dedups by
  (companyId, subject).
- Dispatch: three sources loaded via guarded dynamic `import()`; a missing/
  non-exporting module records a `skipped` summary and the run continues; each
  dispatch is try/catch-guarded so one source failing never aborts the others.
  x-twitter is opt-in (skipped when `X_BEARER_TOKEN` absent). Prints a per-source
  summary table.
- `package.json`: added `"ingest": "node --conditions=react-server --import tsx
  scripts/ingest-grounding.ts"`.

## Verification

- `npx vitest run lib/ingest/cli.test.ts` — 17/17 green.
- `npx tsc --noEmit` — clean.
- `npx eslint lib/ingest/ scripts/ingest-grounding.ts` — clean.
- `npm run ingest` (against .env.local) — enumerated 74 targets, all three
  sources skipped cleanly ("module not yet implemented — skipped"), no throw.
- Not a Vercel route; `grep` confirms no runtime import of the script from
  `app/` or `lib/` (only doc-comment references).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] execFile env typing under project ProcessEnv**
- **Found during:** Task 2 (tsc check)
- **Issue:** `execFile`'s `env` option expects `NodeJS.ProcessEnv`, which the
  project augments to require `NODE_ENV`; a caller-supplied
  `Record<string,string|undefined>` failed all overloads. The callback params
  also inferred `any`.
- **Fix:** cast the resolved env to `NodeJS.ProcessEnv` (a partial env map is a
  valid execFile environment) and typed the callback params
  `(err: ExecFileException | null, stdout: string)`.
- **Files modified:** lib/ingest/cli.ts
- **Commit:** 32e0aad

### Structural note (not a deviation)
Tasks 1 and 2 both target `lib/ingest/cli.ts`. The RED test was committed
separately (f4b3a08); the pure GREEN implementation and the impure runner were
authored in the same file and committed together (32e0aad) rather than as two
commits, since splitting a single new file mid-content is not meaningfully atomic.

## Deferred Issues

The full `npx vitest run` shows 3 failures in
`.claude/worktrees/nostalgic-lederberg-31fae5/lib/agents/deep-dive.test.ts` — a
**separate parallel git worktree** whose stale copy is matched by the vitest
`**/*.test.ts` glob. These are unrelated to plan 04-02 and pre-exist this work
(reproduced with my changes stashed). Logged to
`.planning/phases/04-external-grounding-ingestion/deferred-items.md`. Every
main-tree suite passes. Not fixed here (out of scope).

## TDD Gate Compliance

Task 1 followed RED (f4b3a08 `test(04-02)`) -> GREEN (32e0aad `feat(04-02)`);
no REFACTOR commit needed. Gate sequence satisfied.

## Known Stubs

None that block the plan's goal. The three source-module imports resolve to
not-yet-created modules (Plans 03/04/05) by design — the dispatch is a documented
skip until those plans land, which is the explicit contract of this skeleton plan.

## Self-Check: PASSED

- Files: lib/ingest/types.ts, lib/ingest/cli.ts, lib/ingest/cli.test.ts,
  scripts/ingest-grounding.ts, 04-02-SUMMARY.md — all found.
- Commits: f4b3a08 (RED), 32e0aad (GREEN), 0b55b8b (entrypoint) — all found.
