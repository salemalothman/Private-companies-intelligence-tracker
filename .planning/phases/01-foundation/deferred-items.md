# Deferred Items — Phase 01 Foundation

Out-of-scope discoveries logged during execution. NOT fixed by the plan that found them.

## Pre-existing lint error in lib/agents/refresh.ts (found during 01-02)

- **File:** `lib/agents/refresh.ts:34`
- **Error:** `Definition for rule '@typescript-eslint/no-explicit-any' was not found. @typescript-eslint/no-explicit-any`
- **Root cause:** `refresh.ts` carries an `// eslint-disable ... @typescript-eslint/no-explicit-any` directive, but the project's ESLint config (`.eslintrc.json`, `extends: next/core-web-vitals`) does not load the `@typescript-eslint` plugin, so the referenced rule is undefined and `next lint` errors.
- **Introduced by:** commit `88415bb` (background automation) — predates this plan; `refresh.ts` is not in 01-02's file set.
- **Why deferred:** Out of scope for 01-02 (Rule: only auto-fix issues directly caused by the current task's changes). The deep-dive plan's own files (`lib/agents/deep-dive.ts`, `deep-dive.test.ts`, `deep-dive-types.ts`) lint clean in isolation.
- **Suggested fix (future):** either add the `@typescript-eslint` ESLint plugin to the config, or replace the `any` in `refresh.ts` and drop the stale disable directive.
