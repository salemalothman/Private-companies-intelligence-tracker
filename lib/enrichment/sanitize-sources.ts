import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Source-citation sanitization.
 *
 * Strips generic aggregator / search-engine / LLM labels ("Exa", "Grok (X)",
 * "Perplexity", …) from every attribution field and resolves the underlying
 * primary publisher — the article's domain, the exact X handle, an SEC filing,
 * or a corporate press release. Pure resolver + a DB-wide worker. The resolver
 * is side-effect free so it can be unit-tested.
 */

type DB = SupabaseClient<Database>;

/** Tier-1 financial/business outlets to prefer when ranking discovered links. */
export const TRUSTED_OUTLETS = [
  "bloomberg.com", "wsj.com", "cnbc.com", "reuters.com", "ft.com",
  "forbes.com", "theinformation.com", "techcrunch.com", "businessinsider.com",
  "axios.com", "fortune.com", "sec.gov",
];

const GENERIC =
  /\b(exa|grok|perplexity|openai|gpt-?\d?|claude|llm|copilot|gemini|bing|duckduckgo|google search|search engine|x-?search|x_search)\b/i;

/** Flag for rows whose generic label can't be resolved to a real publisher. */
export const UNRESOLVED = "unverified — primary source pending";

export function sourceDomain(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

export function isTrustedOutlet(domain: string | null): boolean {
  return !!domain && TRUSTED_OUTLETS.includes(domain);
}

/** True when a source label is a generic tool/aggregator rather than a publisher. */
export function isGenericSource(source: string | null | undefined): boolean {
  const s = (source ?? "").trim();
  return s === "" || GENERIC.test(s);
}

/**
 * A bare, clickable publisher domain like "techcrunch.com" (no spaces, exact
 * host + TLD). Shared by the provenance link-guard and the canonical provider
 * label so they classify a source string identically.
 */
export function isPublisherDomain(source: string | null | undefined): boolean {
  const s = (source ?? "").trim().toLowerCase();
  return s !== "" && !s.includes(" ") && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s);
}

/** An SEC regulatory filing source ("SEC EDGAR (Form D)", "sec-edgar", sec.gov…). */
export function isSecFiling(source: string | null | undefined): boolean {
  const s = (source ?? "").trim().toLowerCase();
  return (
    s.includes("sec edgar") ||
    s.includes("sec.gov") ||
    s === "sec-edgar" ||
    s.includes("form d")
  );
}

export interface SourceInput {
  source: string | null | undefined;
  url?: string | null;
}

/**
 * Resolve a row's attribution to a primary source. Returns the cleaned label, or
 * null when a generic label has no resolvable underlying publisher (caller flags
 * it). Already-clean sources (real domains, "SEC EDGAR (Form D)", "AG Dillon",
 * "pdf:…", "@handle (X)", press releases) pass through unchanged.
 */
export function resolvePrimarySource({ source, url }: SourceInput): string | null {
  const s = (source ?? "").trim();
  const handle = s.match(/\(@?([A-Za-z0-9_]{2,30})\)/)?.[1];

  if (isGenericSource(s)) {
    const d = sourceDomain(url);
    if (d) return d; // the article's publisher domain
    if (handle) return `@${handle} (X)`; // exact X account embedded in the label
    return null; // unresolvable → flag
  }
  return s; // already a primary source
}

const TEXT_TABLES = ["news", "company_events"] as const; // carry a url
const PLAIN_TABLES = [
  "valuations", "funding_rounds", "competitors", "market_valuations",
] as const;

export interface SanitizeSummary {
  scanned: number;
  rewritten: number;
  flagged: number;
}

/** Minimal query-builder surface used for dynamically-named tables. */
interface DynTable {
  select(cols: string): Promise<{ data: { id: string; source: string | null; url?: string | null }[] | null }>;
  update(patch: { source: string }): { eq(col: string, val: string): Promise<unknown> };
}

/** Audit + rewrite every source field across the database. Idempotent. */
export async function sanitizeAllSources(supabase: DB): Promise<SanitizeSummary> {
  let scanned = 0, rewritten = 0, flagged = 0;

  // Dynamic table names aren't expressible in the typed client; narrow to the
  // minimal builder surface this function actually uses instead of raw `any`.
  const tbl = (name: string) =>
    (supabase.from as unknown as (n: string) => DynTable)(name);
  const apply = async (table: string, hasUrl: boolean) => {
    const cols = hasUrl ? "id, source, url" : "id, source";
    const { data } = await tbl(table).select(cols);
    for (const row of data ?? []) {
      scanned++;
      if (!isGenericSource(row.source)) continue;
      const resolved = resolvePrimarySource({ source: row.source, url: row.url });
      const next = resolved ?? UNRESOLVED;
      if (next === row.source) continue;
      await tbl(table).update({ source: next }).eq("id", row.id);
      rewritten++;
      if (resolved === null) flagged++;
    }
  };

  for (const t of TEXT_TABLES) await apply(t, true);
  for (const t of PLAIN_TABLES) await apply(t, false);

  // companies.revenue_source
  const { data: cos } = await supabase
    .from("companies")
    .select("id, revenue_source");
  for (const c of (cos ?? []) as { id: string; revenue_source: string | null }[]) {
    scanned++;
    if (!isGenericSource(c.revenue_source)) continue;
    const next = resolvePrimarySource({ source: c.revenue_source }) ?? UNRESOLVED;
    if (next === c.revenue_source) continue;
    await supabase.from("companies").update({ revenue_source: next }).eq("id", c.id);
    rewritten++;
    if (next === UNRESOLVED) flagged++;
  }

  return { scanned, rewritten, flagged };
}
