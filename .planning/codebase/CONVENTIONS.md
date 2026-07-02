# Coding Conventions

**Analysis Date:** 2026-07-02

## Naming Patterns

**Files:**
- kebab-case for all `.ts`/`.tsx` files: `collapsible-section.tsx`, `add-company-dialog.tsx`, `global-sync-button.tsx`, `sanitize-sources.ts`, `timeline-validation.ts`.
- Server Actions files are named `actions.ts` co-located with the route segment: `app/(app)/companies/actions.ts`, `app/(app)/dashboard/actions.ts`, `app/(app)/reports/actions.ts`, `app/(auth)/actions.ts`. A route with a distinct action group uses a descriptive suffix instead, e.g. `app/(app)/companies/document-actions.ts`.
- API routes always live at `route.ts` under `app/api/**` (Next.js convention), e.g. `app/api/cron/market-sync/route.ts`.
- Test files are co-located as `<module>.test.ts` next to the module they cover (never in a separate `__tests__/` tree): `lib/canonical.ts` → `lib/canonical.test.ts`.

**Functions:**
- camelCase, verb-first for actions: `formatCurrency`, `buildCanonicalRecord`, `runMarketSync`, `enrichCompanyProfile`, `mapConnectorResults`.
- Small private helpers in Server Action files use terse one-word names scoped to the file: `num()`, `str()`, `list()` in `app/(app)/companies/actions.ts` (form-field coercion helpers, not exported).
- Predicate/lookup helpers read like the question they answer: `isTrustedSource`, `isPublisherDomain`, `isSecFiling`, `provider()`.

**Variables:**
- camelCase for local/JS-side values (`asOf`, `postMoney`, `amountRaised`).
- snake_case is preserved for anything that mirrors a Supabase column, both in DB-facing objects and in the destructured/local scope near a query: `post_money`, `valuation_date`, `founded_year`, `realized_proceeds`. Do not camelCase these — it would create a mismatch with `lib/types.ts` and the SQL schema.

**Types:**
- PascalCase interfaces/types, `*Row` / `*Insert` suffix pairs for every table mirrored from Supabase: `CompanyRow` / `CompanyInsert`, `ValuationRow` / `ValuationInsert` (see `lib/types.ts`).
- Domain union types are short PascalCase string-literal unions: `Confidence = "low" | "medium" | "high"`, `CompanyStatus = "active" | "exited"`, `Sentiment = "positive" | "neutral" | "negative"`.
- Result/record shapes end in a purpose-revealing suffix, not a generic one: `CanonicalRecord`, `CanonicalField`, `EnrichedProfile`, `ActionResult`.

## Code Style

**Formatting:**
- No Prettier config file present — formatting is implicit (2-space indent, double quotes, trailing commas in multiline literals, semicolons). Match the surrounding file exactly; do not introduce a different quote style or indent width.
- Long import lists and object literals are broken one-per-line once they exceed ~80 chars.

**Linting:**
- `eslint.config` is `.eslintrc.json` extending `next/core-web-vitals` only, with one override: `"@next/next/no-img-element": "off"` (the codebase intentionally uses `<img>` in places, e.g. for logos, instead of `next/image`).
- Run via `npm run lint` (`next lint`). No custom rule sets, no import-order plugin — ordering conventions below are by convention, not enforced.

## Import Organization

**Order (by convention, observed consistently, not lint-enforced):**
1. External packages (`next/*`, `react`, third-party libs like `lucide-react`, `class-variance-authority`).
2. `@/lib/**` internal modules.
3. `@/components/**` internal modules.
4. Relative/type-only imports last if separated (usually just inlined with `import type { X } from "@/lib/types"`).

**Path Aliases:**
- Single alias `@/*` → project root, defined in both `tsconfig.json` (`"paths": { "@/*": ["./*"] }`) and `vitest.config.ts` (`resolve.alias["@"] = resolve(__dirname, ".")`). Always import via `@/lib/...` / `@/components/...`, never deep relative paths (`../../../lib/utils`).

## Error Handling

**Server Actions (`app/**/actions.ts`):**
- Never throw to the client. Return a typed result object with an optional `error` string, e.g. `interface ActionResult { error?: string; id?: string; }` (`app/(app)/companies/actions.ts`).
- Guard auth first with a `requireUser()` helper that returns `{ supabase, user }`; every action does `if (!user) return { error: "Not authenticated." };` before touching data.
- Supabase calls are checked with `const { data, error } = await supabase...`; on `error`, return `{ error: error.message }` (or a friendlier fixed string) rather than throwing.
- Best-effort enrichment calls are wrapped in `try { ... } catch { return {}; }` so an external API failure (Exa, Grok) degrades gracefully instead of failing the whole action (see `enrichCompany` in `app/(app)/companies/actions.ts`).

**API routes (`app/api/**/route.ts`):**
- Auth via a shared-secret bearer check at the top of the handler: `if (!secret || request.headers.get("authorization") !== \`Bearer ${secret}\`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });` (cron routes only — see `app/api/cron/market-sync/route.ts`).
- Business logic wrapped in `try { ... } catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 }); }`. Always return JSON with an `ok: boolean` discriminator.
- Long-running/DB-writing cron routes explicitly set `export const runtime = "nodejs"`, `export const dynamic = "force-dynamic"`, and `export const maxDuration = 300` — copy this triad for any new long-running route.

**Pure `lib/` functions:**
- Prefer returning `null`/`undefined`/empty-array sentinels over throwing for "no data" cases (e.g. `formatCurrency` returns `"—"` for null/undefined/NaN rather than throwing).
- Parsers return partial/empty result objects (`{ valuation: undefined, amountRaised: undefined, round: undefined }`) instead of throwing when no match is found — see `extractDeal` in `lib/connectors/exa-parse.ts`.

## Logging

**Framework:** None (no Sentry/Pino/Winston). Errors surface via returned JSON (`{ ok: false, error }`) from API routes, or via the `ingestion_runs` table (`detail` column) for background job history.

**Patterns:**
- No `console.log` conventions enforced; avoid adding ad hoc logging to `lib/` pure functions. If diagnostics are needed for a long job, persist to the DB (`ingestion_runs.detail`) rather than console-only logging, so failures are inspectable after a cron run.

## Comments

**When to Comment:**
- Every non-trivial `lib/` function has a one-line or short JSDoc-style block explaining *why*, not *what* — especially when a design choice trades off a "more correct" alternative. Example, `lib/utils.ts`:
  ```ts
  /**
   * Format a number as compact USD, e.g. 1_200_000 -> "$1.20M".
   *
   * Implemented manually rather than via Intl `notation: "compact"`, whose output
   * differs between Node's ICU and the browser's ("$9.00B" vs "$9B") and so caused
   * SSR/client hydration mismatches in client components.
   */
  ```
- Inline comments explain non-obvious business rules with concrete numbers, e.g. `lib/canonical.ts`: `const AGREE = 0.15; // within 15% → corroborates` and `const DIVERGE = 0.25; // beyond 25% → conflict`.
- File-level doc comments at the top of `lib/*.ts` modules describe the module's contract in 2-4 sentences (see `lib/canonical.ts`, `lib/types.ts`).

**JSDoc/TSDoc:**
- Used liberally on exported functions and exported types/interfaces in `lib/`, sparingly in `components/`. Prop-level comments are used to flag cross-cutting constraints, e.g. in `components/dashboard/collapsible-section.tsx`:
  ```ts
  /** Consumers passing an icon must be client components (a lucide `forwardRef`
   * can't cross the server→client boundary). */
  icon?: LucideIcon;
  ```

## Function Design

**Size:** Small, single-purpose. Parsing/mapping functions in `lib/` are typically under ~60 lines; larger orchestration logic is broken into helper functions in the same file (e.g. `field()` as a private helper under the exported `buildCanonicalRecord()` in `lib/canonical.ts`).

**Parameters:** Prefer a single options object for optional config (`formatCurrency(value, opts: { compact?: boolean } = {})`, `formatPercent(fraction, opts: { signed?: boolean } = {})`) rather than positional booleans.

**Return Values:** Deterministic, total functions — always return a value for every input branch, using `"—"` / `null` / empty arrays as the "no data" sentinel rather than throwing. Pure business logic (canonical merge, dedupe, classification) returns structured plain objects/arrays, never mutates inputs.

## Module Design

**Exports:** Named exports throughout; no default exports for `lib/` modules or shared components. React components in `components/ui/*.tsx` typically export both the component and its variant/prop helpers, e.g. `export { Badge, badgeVariants };`.

**Barrel Files:** Not used. Each consumer imports directly from the specific file (`@/components/ui/badge`, `@/lib/canonical`) rather than through an `index.ts` re-export.

**"use client" / "use server" placement:** Always the first line of the file, above imports. `"use server"` at the top of every `actions.ts` file; `"use client"` at the top of any component using hooks, event handlers, or Radix primitives that need `forwardRef` across the server/client boundary.

---

## Design System — "Premium Minimal Flat"

Defined in `app/globals.css` and driven entirely by CSS custom properties mapped into Tailwind's theme in `tailwind.config.ts`. Do not hardcode hex/HSL colors in components — always use the semantic Tailwind tokens (`bg-background`, `text-foreground`, `border-border`, `bg-muted`, `text-muted-foreground`, `bg-success/15 text-success`, etc.), which resolve to `hsl(var(--token))`.

**Core aesthetic (see `app/globals.css` header comment):** "premium minimal, data-dense flat dashboard. Near-monochrome ink on white, hairline borders, restrained accent, muted semantic green/red."

**Key tokens:**
- `--background` / `--foreground`: near-white / near-black ink (`0 0% 100%` / `224 24% 8%`) — this is the "ink-on-white" base.
- `--border`: `220 16% 92%` — a hairline, not a heavy divider. Use `border` (1px) not `border-2`.
- `--primary`: near-black ink action color (`224 24% 10%`), not a saturated brand blue — the brand accent (`--brand`, `221 83% 53%`) is used sparingly (focus rings, emphasis), never as the default button color.
- `--success` / `--destructive`: muted, not neon (`152 56% 36%` green, `0 72% 45%` red). Always apply at reduced opacity in UI (`bg-success/15 text-success`), matching the `Badge` `success`/`destructive` variants in `components/ui/badge.tsx`.
- Dark mode variants exist under `.dark` but the app is primarily used in light mode; when adding a new color, always add both light and dark HSL values.

**Typography/number utilities (`app/globals.css` `@layer utilities`):**
- `.tabular-nums` — `font-variant-numeric: tabular-nums` + `font-feature-settings: "tnum"`. **Apply this to every financial figure** (currency, percent, multiples) so columns of numbers don't jitter when digits change width. Seen throughout: `text-2xl font-semibold tabular-nums` in `components/company/provenance.tsx`.
- `.label-eyebrow` — `text-[11px] font-medium uppercase tracking-wider text-muted-foreground`. Use for small section/column labels (see the `CollapsibleSection` trigger in `components/dashboard/collapsible-section.tsx`).

**Radius/shadow:** `--radius: 0.625rem`; components use `rounded-lg`/`rounded-xl`, never sharp 0-radius corners or heavy drop shadows — flat design relies on hairline borders (`border border-border`) instead of shadows for separation.

**Mobile/touch details worth preserving when adding UI:**
- `touch-action: manipulation` globally on interactive elements to drop the 300ms tap delay.
- `.pt-safe` / `.pb-safe` / `.pb-mobilenav` utilities reserve safe-area insets for notched iPhones and the fixed mobile tab bar — use these instead of hardcoded padding on any fixed top/bottom chrome.

## Fact/Estimate + Confidence Provenance Pattern

The core domain pattern for any numeric fact (valuation, revenue) that can be reported by multiple sources. Canonicalization logic lives in `lib/canonical.ts`; UI rendering lives in `components/company/provenance.tsx`.

**Model:**
- `SourceObservation { source, value, date }` — one raw reported figure.
- `CanonicalField { value, asOf, observations, corroboration, conflict }` — the merged/canonical figure plus its lineage.
  - `corroboration`: count of distinct providers agreeing within 15% (`AGREE = 0.15`) and within a 120-day contemporaneity window (`WINDOW_MS`).
  - `conflict`: `true` if any contemporaneous observation diverges by more than 25% (`DIVERGE = 0.25`).
- `CanonicalRecord { valuation, revenue, multiple, sources }` — the full merged record for a company, built by `buildCanonicalRecord(company, inputs)`.

**Rules to follow when extending this pattern:**
- Canonical value = most recent dated observation, **preferring trusted publishers** (`isTrustedSource`) over unverified/aggregator sources — an unverified figure must never win over a verified one even if it's newer. See the `trusted`/`pool` selection in `field()` in `lib/canonical.ts`.
- `provider(source)` normalizes a raw source string (e.g. `"grok:x:social"`, `"pdf:xyz"`, `"url:xyz"`) down to a stable provider key (`"grok"`, `"document"`, `"web"`, `"agdillon"`, `"sec-edgar"`, `"aggregate"`, `"unverified"`, or a bare publisher domain). Always route new source strings through this function rather than comparing raw strings.
- This layer is **observational only — no risk scoring** (explicit doc comment in `lib/canonical.ts`). Do not add subjective scoring logic here; keep it to corroboration counts and a boolean conflict flag.
- UI must always show: the canonical value, its `asOf` date, a corroboration/conflict badge, and the list of underlying `observations` with per-source badges (see `FieldCard` in `components/company/provenance.tsx`) — never show a number without its provenance trail in this part of the app.
- Separately, `ValuationRow`/`ValuationInsert` in `lib/types.ts` carries an explicit `confidence: Confidence` (`"low" | "medium" | "high"`) field — this is a simpler, single-source confidence tag distinct from the multi-source `CanonicalField` corroboration model. Use `confidence` when persisting a single valuation row's reliability; use `CanonicalField`/`corroboration` when reconciling multiple sources for display.

## Server vs. Client Component Boundaries

- Default to Server Components. Only add `"use client"` when the file needs hooks (`useState`, `useEffect`, `react-hook-form`), event handlers, or a Radix primitive that forwards refs.
- Server Actions (`"use server"` files under `app/**/actions.ts`) are the only place that calls `createClient()` from `@/lib/supabase/server` directly from route-level code; pages call these actions, they don't inline Supabase queries in Client Components.
- Icon props are a common boundary trap: `LucideIcon` values use `forwardRef`, which cannot cross the server→client boundary as a prop. Any shared component accepting an `icon` prop (e.g. `CollapsibleSection` in `components/dashboard/collapsible-section.tsx`) is itself `"use client"`, and its comment explicitly warns: "Consumers passing an icon must be client components."
- Admin/service-role Supabase access (`lib/supabase/admin.ts`) is guarded with the `server-only` package import (`import "server-only";`) at the top of the file — this makes any accidental client-side import a build-time error. Follow this pattern for any new trusted-only module.

## Typed Supabase Client Conventions

Three client factories, one per trust boundary — always pick the correct one, never reach for `admin` out of convenience:

| File | Function | Key | Use case |
|---|---|---|---|
| `lib/supabase/server.ts` | `createClient()` (async) | anon key + cookies | Server Components / Server Actions, RLS-enforced via user session |
| `lib/supabase/client.ts` | `createClient()` | anon key | Client Components, RLS-enforced via user session |
| `lib/supabase/admin.ts` | `createAdminClient()` | service-role key | Trusted server-only contexts only (cron/sync jobs) — bypasses RLS, guarded by `import "server-only"` |

- All three are generic over `Database` from `@/lib/types`: `createServerClient<Database>(...)`, `createBrowserClient<Database>(...)`, `createClient<Database>(...)`. Never call an untyped Supabase client — always import `Database` and parametrize.
- `lib/types.ts` is **hand-maintained** to mirror `supabase/migrations`, not auto-generated in the normal workflow (there's a documented escape hatch: `supabase gen types typescript`, but the file header says it's hand-maintained). When adding/changing a column, update both the migration and `lib/types.ts` `*Row`/`*Insert` pair together.
- `lib/types.ts` types are standalone interfaces (no self-referential `Database[...]` lookups) specifically so TypeScript resolves the schema cleanly — don't refactor these into a nested `Database["public"]["Tables"][...]` shape.
- The server client's `setAll` cookie writer is wrapped in `try {} catch {}` with a comment: safe to ignore when called from a Server Component while middleware refreshes the session. Preserve this try/catch if touching `lib/supabase/server.ts`.

---

*Convention analysis: 2026-07-02*
