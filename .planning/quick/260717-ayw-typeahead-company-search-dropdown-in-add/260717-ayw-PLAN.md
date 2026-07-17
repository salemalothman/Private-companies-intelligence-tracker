---
phase: 260717-ayw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/connectors/akta.ts
  - lib/connectors/akta.test.ts
  - app/(app)/companies/actions.ts
  - components/company/company-typeahead.tsx
  - components/company/add-company-dialog.tsx
autonomous: true
requirements: [TYPEAHEAD-01, TYPEAHEAD-02, TYPEAHEAD-03]

must_haves:
  truths:
    - "Typing >=2 chars in the Add Company name field shows a live suggestion dropdown that updates as the user types"
    - "Each suggestion row shows a logo (or monogram fallback), the company name, and a brief description (product_category / URL)"
    - "Publicly-traded companies (company_status public or delisted) never appear in the dropdown"
    - "Selecting a suggestion fills the form's name + website (+ sector) and closes the dropdown; free-form typing + submit still work unchanged"
    - "The private-only filter/mapper is unit-tested with no HTTP"
  artifacts:
    - path: "lib/connectors/akta.ts"
      provides: "searchAktaCompanies HTTP fn + toPrivateSuggestions pure mapper + exported AktaSearchHit + CompanySuggestion types"
      contains: "export function toPrivateSuggestions"
    - path: "lib/connectors/akta.test.ts"
      provides: "Unit tests for toPrivateSuggestions private-only exclusion + cap"
      contains: "toPrivateSuggestions"
    - path: "app/(app)/companies/actions.ts"
      provides: "searchCompaniesAction server action (requireUser + ActionResult-style return)"
      contains: "export async function searchCompaniesAction"
    - path: "components/company/company-typeahead.tsx"
      provides: "'use client' debounced typeahead input + dropdown"
      min_lines: 60
    - path: "components/company/add-company-dialog.tsx"
      provides: "Name input replaced by CompanyTypeahead, wired to fill name/website/sector"
      contains: "CompanyTypeahead"
  key_links:
    - from: "components/company/company-typeahead.tsx"
      to: "searchCompaniesAction"
      via: "debounced server-action call with stale-response guard"
      pattern: "searchCompaniesAction"
    - from: "app/(app)/companies/actions.ts"
      to: "searchAktaCompanies + toPrivateSuggestions"
      via: "compose HTTP fetch then pure map"
      pattern: "toPrivateSuggestions"
    - from: "components/company/add-company-dialog.tsx"
      to: "CompanyTypeahead"
      via: "replaces raw name Input, onSelect fills form"
      pattern: "onSelect"
---

<objective>
Add a real-time, private-only company-search typeahead to the Add Company flow.
As the user types the company name, an akta-backed autocomplete dropdown appears
showing each candidate's logo, name, and brief description, so similarly-named
entities (e.g. five different "Accrete") can be visually disambiguated. Publicly
traded companies are strictly excluded — this tracker holds private entities only.

Purpose: Speed up + de-risk company entry with grounded suggestions, extending the
just-shipped `pickPrimaryCompanyHit` private-only guardrail (commit 1e1f92f) to the
UI entry point.
Output: An exported akta search fn + pure private-only mapper (unit-tested), a
server action bridging the server-only akta key to the client, a reusable
`"use client"` typeahead component, and the wired Add Company dialog.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

<interfaces>
<!-- Existing akta.ts contracts the executor builds on. Do NOT re-derive. -->

lib/connectors/akta.ts (already present):
- `async function aktaGet(path, params: Record<string,string>): Promise<unknown | null>`
    module-private HTTP shell — carries the mandatory `x-api-key` + `User-Agent`
    (Cloudflare 1010 guard), returns envelope `.data`, null on any failure/no key.
- `const PUBLIC_MARKET_STATUSES = new Set(["public", "delisted"])` — the
    public-market status set. REUSE this; do not redefine the exclusion list.
- `interface AktaSearchHit { uuid?, name?, website?, product_category?, company_status? }`
    currently NOT exported — export it in Task 1.
- `pickPrimaryCompanyHit(hits)` — the existing single-primary guardrail; the new
    mapper is its list-returning sibling (same exclusion semantics, not first-only).

app/(app)/companies/actions.ts (already present):
- `"use server"` file. `requireUser()` → `{ supabase, user }`; guard
    `if (!user) return { error: "Not authenticated." }`.
- `interface ActionResult { error?: string; id?: string }` — follow the
    typed-result-object convention (never throw to client).
- `str()` trims/nullifies form values (pattern reference only).

components/company/add-company-dialog.tsx (already present, `"use client"`):
- Local form state `f: FormState` with `name`, `website`, `sector`, `logo_url`, …
- Name input at lines ~227-240 inside `<div className="relative flex-1">`, with an
    existing debounced `enrichCompany(name)` effect (700ms) that auto-fills the rest
    of the form. The typeahead is ADDITIVE to that effect — both may run.
- Logo/monogram treatment: circular `h-11 w-11 rounded-full border bg-muted` with
    `<img onError=...>` Clearbit→favicon→initial fallback (lines ~193-226).

lib/enrichment/enrich.ts:
- Clearbit logo pattern: `https://logo.clearbit.com/${domain}` built (not fetched)
    from the website hostname; browser `<img onError>` verifies + falls back.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Export akta private-only search mapper + HTTP fn (TDD)</name>
  <files>lib/connectors/akta.ts, lib/connectors/akta.test.ts</files>
  <behavior>
    toPrivateSuggestions(hits, opts?):
    - Drops hits whose `company_status` is in PUBLIC_MARKET_STATUSES ("public", "delisted"),
      case-insensitive on trimmed status.
    - KEEPS "private", "acquired", "unknown", missing/undefined status (lenient — a thin
      status field never over-prunes), matching pickPrimaryCompanyHit semantics.
    - Drops hits with no non-empty `name`.
    - Maps each survivor to CompanySuggestion { uuid?, name, website?, category? } where
      category = product_category (undefined when blank). NO logo field (derived client-side).
    - Caps output at 8 (default), preserving akta's input order.
    - Non-array / null / empty input → [] (never throws).
    Test cases (no HTTP — pass literal hit arrays):
    - "public" and "delisted" hits are dropped; "private"/"acquired"/"unknown"/missing kept
    - nameless hit dropped
    - >8 eligible hits → exactly 8 returned, order preserved
    - empty/undefined/non-array input → []
    - product_category mapped to `category`; blank category → undefined
  </behavior>
  <action>
    In lib/connectors/akta.ts: (a) change `interface AktaSearchHit` to `export interface
    AktaSearchHit`. (b) Add and export `interface CompanySuggestion { uuid?: string; name:
    string; website?: string; category?: string }`. (c) Add exported pure fn
    `toPrivateSuggestions(hits: AktaSearchHit[] | null | undefined, opts?: { cap?: number }):
    CompanySuggestion[]` implementing the behavior above — REUSE the existing
    PUBLIC_MARKET_STATUSES set for the exclusion (do not define a new list); default cap 8.
    Place it near pickPrimaryCompanyHit with a doc comment noting it is the list-returning
    sibling of that guardrail. (d) Add exported async HTTP fn `searchAktaCompanies(query:
    string): Promise<AktaSearchHit[]>` that calls `aktaGet("/v1/company/search", { query })`
    and returns the array (or [] when the payload is not an array / null) — mirror
    resolveAktaCompany's array-guard; never throw. Do NOT filter inside searchAktaCompanies
    (keep HTTP and the pure mapper separable so the mapper stays HTTP-free testable).
    Add the co-located tests in lib/connectors/akta.test.ts (append to the existing file,
    matching its describe/it style).
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run test -- lib/connectors/akta.test.ts</automated>
  </verify>
  <done>toPrivateSuggestions + searchAktaCompanies + CompanySuggestion + exported AktaSearchHit exist; new unit tests green; tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: searchCompaniesAction server action</name>
  <files>app/(app)/companies/actions.ts</files>
  <action>
    Add `export async function searchCompaniesAction(query: string): Promise<{ suggestions?:
    CompanySuggestion[]; error?: string }>`. Import `searchAktaCompanies`, `toPrivateSuggestions`,
    and the `CompanySuggestion` type from `@/lib/connectors/akta`. Guard auth first via
    `requireUser()` → `if (!user) return { error: "Not authenticated." }`. Trim the query; if
    `< 2` chars return `{ suggestions: [] }` (not an error — the client polls on every keystroke).
    Cap query length to 80 chars before the call (`q.slice(0, 80)`). Wrap the akta call in
    try/catch returning `{ suggestions: [] }` on failure (best-effort, graceful-degradation
    convention — an akta outage must not surface an error toast on every keystroke). On success
    return `{ suggestions: toPrivateSuggestions(await searchAktaCompanies(q)) }`. This is
    read-only and additive; it does not touch the createCompany submit path.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>searchCompaniesAction compiles, is auth-gated, min-length + max-length bounded, degrades to empty on failure, and returns private-only suggestions.</done>
</task>

<task type="auto">
  <name>Task 3: CompanyTypeahead component + wire into Add Company dialog</name>
  <files>components/company/company-typeahead.tsx, components/company/add-company-dialog.tsx</files>
  <action>
    Create `components/company/company-typeahead.tsx` (`"use client"`). Props: `value: string`,
    `onChange: (name: string) => void`, `onSelect: (s: CompanySuggestion) => void`, optional
    `placeholder`, `autoFocus`. Render a `<div className="relative">` wrapping the existing
    `Input` (from `@/components/ui/input`) plus an absolutely-positioned dropdown popover below it.
    Behavior:
    - Debounce ~250ms after each keystroke, then call `searchCompaniesAction(value)`.
    - Stale-response guard: increment a `useRef` request-sequence counter per fire; ignore any
      response whose sequence is not the latest (prevents out-of-order overwrites; no AbortController
      needed for a server action).
    - Do NOT query when `value.trim().length < 2`; clear/hide the dropdown instead.
    - States: loading (a small `Loader2` spinner from lucide-react), results (rows), and empty
      ("No private companies found." in `text-muted-foreground`).
    - Each row: left = logo block — `<img>` at `https://logo.clearbit.com/<hostname>` derived from
      the suggestion's `website` (reuse the domain-extraction approach already in
      add-company-dialog's `domainFromUrl`; export/lift or duplicate the tiny helper), with
      `onError` falling back to a monogram initial block (uppercase first letter) styled like the
      dialog's existing `h-11 w-11 rounded-full border bg-muted` treatment but sized for a row
      (e.g. h-8 w-8). Middle = name (`font-medium`) over a truncated brief line: `category`, else the
      website hostname, in `text-xs text-muted-foreground truncate`. Rows are tap-friendly (min touch
      height, `px-3 py-2`, full-width button, hover/active bg).
    - Keyboard nav: Down/Up move an `activeIndex`, Enter selects the active row (or first when none
      active), Escape closes the dropdown. Mouse click / touch also selects.
    - Selecting a row calls `onSelect(s)` and closes the dropdown (clear results, reset activeIndex).
    - Style with design-system tokens only: popover container `rounded-lg border border-border
      bg-popover shadow-md` (hairline border, no border-2), `z-50`, `max-h-72 overflow-y-auto`,
      active row `bg-accent`. Financial/no numeric figures here.
    - Close the dropdown on outside click / input blur (with a short delay so row clicks register).
    In add-company-dialog.tsx: replace the raw name `<Input ...>` (inside `<div className="relative
    flex-1">`, ~lines 227-240) with `<CompanyTypeahead value={f.name} onChange={(v) => setF((p) =>
    ({ ...p, name: v }))} onSelect={handlePickSuggestion} autoFocus placeholder="OpenAI" />`. Keep the
    surrounding logo-preview circle and the existing `enrichCompany` debounce effect untouched
    (both search-suggest and enrich coexist). Add `handlePickSuggestion(s: CompanySuggestion)` that
    fills `name` from `s.name`, `website` from `s.website` (when present), and `sector` from
    `s.category` (when present) via the existing `setF` / `userSet` mechanics — treat picked fields
    as user-set so re-enrichment does not clobber them; the free-form type-and-submit path is unchanged.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint && npm run test</automated>
  </verify>
  <done>Dialog name field renders CompanyTypeahead; dropdown shows logo+name+brief per row, keyboard-navigable, private-only; picking a row fills name/website/sector; tsc + lint + full test suite green.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| client → searchCompaniesAction | Untrusted `query` string crosses from the browser into a server action. |
| server action → akta API | App-controlled request to the third-party akta search endpoint. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-ayw-01 | Tampering/Injection | searchCompaniesAction `query` → akta query string | mitigate | Trim + cap length to 80; pass only through `URLSearchParams` inside the existing `aktaGet` (encodes the value). No SQL/shell path — akta is HTTP-only. |
| T-ayw-02 | Denial of Service | per-keystroke server-action calls hitting akta's 100 req/min limit | mitigate | 250ms client debounce + min-length 2 gate + stale-sequence dropping; server-side length cap; akta outage degrades to `{ suggestions: [] }` (no cascading error). |
| T-ayw-03 | Info Disclosure | server-only `AKTA_API_KEY` reaching the client | mitigate | Key stays in `lib/connectors/akta.ts` (`import "server-only"`); only the `"use server"` action is client-reachable — it returns mapped suggestions, never the key. |
| T-ayw-04 | Elevation of Privilege | unauthenticated search access | mitigate | `requireUser()` gate returns `{ error: "Not authenticated." }` before any akta call. |
| T-ayw-SC | Tampering | npm/pip/cargo installs | mitigate | No new dependencies introduced (plain-div dropdown, no cmdk/downshift) — nothing to audit. |
</threat_model>

<verification>
- `npx tsc --noEmit` clean (strict mode).
- `npm run lint` clean.
- `npm run test` green, including the new `toPrivateSuggestions` cases in `lib/connectors/akta.test.ts` (no HTTP in tests).
- Manual sanity (optional): with a live `AKTA_API_KEY`, typing "Accrete" in Add Company shows multiple private "Accrete" entities and no public-market ones.
</verification>

<success_criteria>
- Add Company name field is a live typeahead: >=2 chars triggers a debounced private-only suggestion dropdown.
- Each row visually disambiguates via logo (Clearbit + monogram fallback), name, and a brief category/URL line.
- Public / delisted companies never appear (unit-tested exclusion; server-side enforced).
- Selecting a suggestion fills name + website + sector; free-form entry and submit are unchanged.
- All quality gates pass: tsc, eslint, Vitest.
</success_criteria>

<output>
Create `.planning/quick/260717-ayw-typeahead-company-search-dropdown-in-add/260717-ayw-SUMMARY.md` when done.
</output>
