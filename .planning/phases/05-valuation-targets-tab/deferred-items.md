# Deferred Items — Phase 05

Out-of-scope discoveries logged during execution. Not fixed in the plan that found them.

| Discovered In | Item | Reason Deferred |
|---------------|------|-----------------|
| 05-02 (Task 3) | `scripts/regen-deep-dive.ts:49` — `eslint-disable-next-line @typescript-eslint/no-explicit-any` references a rule not loaded in the project's eslint config, so `npx eslint scripts/regen-deep-dive.ts` reports "Definition for rule not found". Pre-existing (present in HEAD before 05-02; on the unrelated `runDeepDive(sb as any, ...)` line). | Out of scope: not caused by 05-02's additive print change. Fix would be either configuring `@typescript-eslint` or removing the stale disable directive — a repo-tooling change, not part of VAL-01. |
