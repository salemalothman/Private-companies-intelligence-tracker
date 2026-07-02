# Testing Patterns

**Analysis Date:** 2026-07-02

## Test Framework

**Runner:**
- Vitest `^2.1.8`
- Config: `vitest.config.ts`
  ```ts
  export default defineConfig({
    test: {
      environment: "node",
      include: ["**/*.test.ts"],
    },
    resolve: {
      alias: { "@": resolve(__dirname, ".") },
    },
  });
  ```
- `environment: "node"` — there is no DOM/jsdom environment configured. Only pure TypeScript logic is tested; no component/DOM rendering tests exist or are supported out of the box.
- `include: ["**/*.test.ts"]` — note the extension is `.test.ts` only, not `.test.tsx`. This is a hard constraint: component tests (which would need `.test.tsx` + a DOM environment + a rendering library like Testing Library) are not part of this setup at all currently.

**Assertion Library:**
- Vitest's built-in `expect` (Chai-compatible), imported directly from `"vitest"` alongside `describe`/`it`.

**Run Commands:**
```bash
npm run test        # vitest run  (single pass, CI-style)
npm run test:watch  # vitest      (watch mode)
```
No separate coverage script is defined in `package.json` — coverage is not configured or enforced (no `@vitest/coverage-v8` / `coverage` block in `vitest.config.ts`).

## Test File Organization

**Location:**
- Strictly co-located: every test lives beside the module it covers, inside `lib/`, never in a parallel `__tests__/` or `tests/` directory.
- Testing is scoped entirely to `lib/` (and its subdirectories). There are **no tests** under `app/` or `components/` — Server Actions, API routes, and React components/pages are untested by this suite.

**Naming:**
- `<module-name>.test.ts`, exact 1:1 with the module under test: `lib/utils.ts` → `lib/utils.test.ts`, `lib/canonical.ts` → `lib/canonical.test.ts`, `lib/connectors/exa-parse.ts` → `lib/connectors/exa.test.ts` (note: test file name doesn't always match the source file name exactly when the source is a narrow internal module — `exa.test.ts` tests `extractDeal` from `exa-parse.ts`).

**Current inventory (19 test files, ~1550 lines total):**
```
lib/
├── utils.test.ts                              (33 lines)
├── canonical.test.ts                          (78 lines)
├── events.test.ts                             (84 lines)
├── metrics.test.ts                             (464 lines — largest)
├── calendar.test.ts                            (33 lines)
├── business-model.test.ts                      (45 lines)
├── connectors/
│   ├── exa.test.ts                             (40 lines)
│   └── exa-events-parse.test.ts                (49 lines)
├── ingestion/
│   ├── orchestrator.test.ts                    (133 lines)
│   └── dedupe.test.ts                          (58 lines)
├── news/
│   └── classify.test.ts                        (52 lines)
├── market-cache/
│   └── parse.test.ts                           (69 lines)
├── enrichment/
│   ├── disambiguation.test.ts                  (24 lines)
│   ├── sanitize-sources.test.ts                (44 lines)
│   └── timeline-validation.test.ts             (90 lines)
├── documents/
│   ├── diff.test.ts                            (45 lines)
│   ├── heuristic.test.ts                       (79 lines)
│   └── clean.test.ts                           (53 lines)
└── competitors/
    └── rank.test.ts                            (80 lines)
```

## Test Structure

**Suite organization** — flat `describe` blocks per function/behavior, `it` per scenario, real inputs/outputs (no snapshot testing anywhere in the suite):

```ts
// lib/utils.test.ts
import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate } from "@/lib/utils";

describe("formatCurrency (deterministic, no Intl compact)", () => {
  it("renders compact USD with a stable 2-decimal format", () => {
    expect(formatCurrency(360_000)).toBe("$360.00K");
    ...
  });

  it("handles negatives and nullish input", () => {
    expect(formatCurrency(-400_000)).toBe("-$400.00K");
    expect(formatCurrency(null)).toBe("—");
  });
});
```

**Patterns:**
- No `beforeEach`/`afterEach` setup/teardown anywhere in the suite — every test builds its own literal fixture data inline or via a tiny local factory function at the top of the `describe` block.
- `describe` titles often carry a parenthetical annotation explaining *why* the test exists, matching the "why not what" commenting convention in `lib/`: `describe("formatCurrency (deterministic, no Intl compact)", ...)`, `describe("formatDate (UTC, locale-stable)", ...)`.
- Assertions favor `toEqual`/`toMatchObject` for structured outputs (dedupe results, parsed deal objects) and `toBe` for primitives/strings.
- Multi-scenario coverage within one `describe`/`it` block for parser-style functions — e.g. `lib/connectors/exa.test.ts` runs 5 phrasing variants ("raises $X at $Y valuation", "valuation-only headline", "valued at" phrasing, no-financial-figure case) against a single `extractDeal()` function to lock down regex/parsing edge cases.

## Mocking

**Framework:** None used. No `vi.mock`, `vi.fn`, or `vi.spyOn` calls exist anywhere in the test suite (confirmed via full-repo search).

**Why:** The test suite exclusively targets **pure, deterministic functions** in `lib/` — formatters, parsers, dedupers, mappers, and canonicalization logic. These take plain data in and return plain data out with no I/O, no Supabase calls, no network calls, no dates/randomness beyond what's passed in as an argument. There is nothing to mock because there are no side effects to isolate.

**What to test this way (do this for new `lib/` code):**
- Any new pure function extracted from a Server Action, API route, or ingestion connector should be tested exactly like `lib/canonical.ts`, `lib/utils.ts`, `lib/connectors/exa-parse.ts` — construct literal input objects, call the function, assert on the literal output. No mocking framework needed.

**What is NOT covered by this pattern (and has no test coverage at all currently):**
- Anything that calls `createClient()` / `createAdminClient()` (Supabase reads/writes) — Server Actions in `app/**/actions.ts`, API routes in `app/api/**/route.ts`.
- Anything that calls an external SDK directly (Exa, Grok/xAI via `@ai-sdk/xai`, Resend email) — only the pure parsing helpers pulled out of those connectors (e.g. `extractDeal` from `lib/connectors/exa-parse.ts`) are tested, not the fetch/SDK-calling wrapper itself.
- React components (`components/**`) and pages (`app/**/page.tsx`) — zero component-level or rendering tests exist; there is no Testing Library / jsdom dependency installed.

## Fixtures and Factories

**Test data:** Inline literals or small local factory functions defined at the top of the test file, not shared across files (no `lib/__fixtures__/` or similar directory exists). Example factory pattern from `lib/canonical.test.ts`:
```ts
const company = (valuations: { post_money: number; date: string; source: string }[]) => ({
  // ... builds a minimal CompanyWithRelations-shaped object for the test
});
```

**Location:** Fixtures live only inside their own `.test.ts` file — there is no shared fixtures module. When writing a new test, define fixtures locally rather than introducing a shared fixtures directory (matches existing convention).

## Coverage

**Requirements:** None enforced. No coverage tool is configured, no CI gate references coverage, and no coverage threshold exists in `vitest.config.ts` or `package.json`.

**View Coverage:** Not currently possible without first adding `@vitest/coverage-v8` (or similar) as a dev dependency and a `coverage` block to `vitest.config.ts` — this is not set up today.

## Test Types

**Unit Tests:**
- 100% of the current suite. Every test file in `lib/**/*.test.ts` is a pure-function unit test as described above.

**Integration Tests:**
- None. No test exercises a real or mocked Supabase call, a real API route handler, or a Server Action end-to-end.

**E2E Tests:**
- Not used. No Playwright/Cypress dependency, config, or test directory exists.

## Quality Gates (manual, no CI)

There is no `.github/workflows/` directory, no CI config, and no git hooks (`.husky/` does not exist) in this repo. Quality gates are run manually / by the developer before pushing:

```bash
npm run test    # vitest run — must pass with 0 failures
npm run lint    # next lint — next/core-web-vitals rules
npx tsc --noEmit   # not a package.json script, but `tsconfig.json` has "noEmit": true,
                   # confirming type-checking is intended as a standalone gate separate from build
```

- `tsconfig.json` has `"strict": true` — all new code must satisfy strict mode (no implicit `any`, strict null checks, etc.). This is the primary correctness gate for Supabase row typing (`lib/types.ts`) and is what catches most schema-mismatch bugs given there's no integration-level DB test coverage.
- `next build` (`npm run build`) also performs a full TypeScript typecheck as part of the Next.js build pipeline, so a broken type will fail the build even without running `tsc` separately.
- Because there is no CI pipeline, these three commands (`test`, `lint`, and either `tsc --noEmit` or `build`) should be treated as the required pre-commit/pre-push checklist for any change touching `lib/`, `app/`, or `components/`.

## Common Patterns

**Async Testing:**
```ts
// No async test examples currently exist in the suite — every current test
// targets a synchronous pure function. If adding a test for an async lib
// function, follow standard Vitest async/await style:
it("does the async thing", async () => {
  const result = await someAsyncPureFn(input);
  expect(result).toEqual(expected);
});
```

**Error Testing:**
- No `expect(() => fn()).toThrow()` patterns appear in the suite — consistent with the "return a sentinel instead of throwing" convention documented in `CONVENTIONS.md`. Functions like `formatCurrency`/`formatDate` are tested for their null-handling *return value* (`"—"`), not for throwing behavior.

**Multi-source reconciliation testing (domain-specific pattern):**
- `lib/canonical.test.ts` is the reference example for testing the fact/estimate + confidence provenance pattern: build a company fixture with multiple `valuations` rows from different sources/dates, call `buildCanonicalRecord`, and assert on `corroboration`, `conflict`, and `value`/`asOf` of the resulting `CanonicalField`. Follow this shape for any new corroboration-related logic.

---

*Testing analysis: 2026-07-02*
