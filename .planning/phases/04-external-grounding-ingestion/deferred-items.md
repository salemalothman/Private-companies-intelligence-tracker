# Phase 04 — Deferred / Out-of-Scope Items

Discovered during execution but outside the current plan's scope. Not fixed here.

## Pre-existing test failures in a parallel worktree (04-02)

`npx vitest run` (full suite) reports 3 failures in
`.claude/worktrees/nostalgic-lederberg-31fae5/lib/agents/deep-dive.test.ts`
(the "runDeepDive persistence guard" cases). These originate from a **separate
git worktree** (`claude/nostalgic-lederberg-31fae5`, a parallel agent's tree)
whose stale copy is matched by vitest's `**/*.test.ts` glob. They are unrelated
to plan 04-02 (lib/ingest/, scripts/ingest-grounding.ts) — the main-tree
`lib/agents/deep-dive.test.ts` and every other suite pass.

- Scope: not caused by 04-02 changes; do not fix in this plan.
- Suggested follow-up: prune the stray worktree
  (`git worktree remove .claude/worktrees/nostalgic-lederberg-31fae5`) or scope
  the vitest `include` to exclude `.claude/worktrees/**` so the parallel tree's
  tests are not collected.
