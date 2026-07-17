import "server-only";
import { z } from "zod";
import type {
  ConnectorCompanyProfile,
  ConnectorCompetitor,
  ConnectorFundingRound,
  ConnectorNewsItem,
  DataConnector,
} from "@/lib/connectors/types";

/**
 * akta.pro connector — a same-domain private-company data + news-signals API.
 *
 * Unlike Grok/Exa, akta returns entity-resolved news with a native AI summary,
 * sentiment, and publisher metadata (no separate LLM pass), plus structured
 * firmographic and financial-estimate data. Its figures are estimates, never
 * facts, so every financial value is labelled with an explicit "estimate" basis
 * (data-integrity constraint). Gated on AKTA_API_KEY; every method degrades to a
 * null / empty result on any failure — never throws.
 */

const SOURCE = "akta.pro";
const AKTA_BASE = "https://api.akta.pro/api";

/** akta wraps every response in a credits-accounted envelope. */
const envelopeSchema = z.object({
  data: z.unknown(),
  credits_consumed: z.number().optional(),
});

/** Drop nulls so optional interface fields stay `undefined`, not `null`. */
const clean = <T>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

/** akta timestamps are ISO; the app stores plain YYYY-MM-DD dates. */
const isoDate = (d?: string | null): string | undefined =>
  d ? d.slice(0, 10) : undefined;

// ---------------------------------------------------------------------------
// Raw akta payload shapes (snake_case) — only read inside the pure mappers so
// the rest of the app never touches akta's field names directly.
// ---------------------------------------------------------------------------

interface AktaRawProfile {
  name?: string;
  website?: string;
  product_category?: string;
  industry?: string;
  country?: string;
  founded_year?: number;
  description?: string;
  company_description?: string;
  company_description_short?: string;
  founders?: string[];
}

interface AktaRawNewsItem {
  title?: string;
  summary?: string;
  ai_summary?: string;
  sentiment?: string;
  url?: string;
  date?: string;
  published_at?: string;
  published_date?: string;
  publisher?: { domain?: string; name?: string } | string | null;
  source_domain?: string;
}

/** akta financial estimates arrive as range bands, e.g. {code:"1B-5B", label:"$1B-$5B"}. */
interface AktaEstimateBand {
  code?: string;
  label?: string;
}

interface AktaRawFinancial {
  revenue?: number;
  revenue_estimate?: number | AktaEstimateBand;
  valuation?: number;
  valuation_estimate?: number | AktaEstimateBand;
  valuation_date?: string;
  as_of?: string;
}

interface AktaSearchHit {
  uuid?: string;
  name?: string;
  website?: string;
  product_category?: string;
  company_status?: string;
}

interface AktaIndustryHit {
  code?: string | number;
  industry_name?: string;
  similarity?: number;
}

/**
 * One entity mention inside an akta industry-news article. akta has surfaced the
 * mention under a few different field names across tiers/versions; we accept all
 * plausible shapes leniently rather than pin one (tampering guard — a shape drift
 * degrades to no competitors, never a throw).
 */
const aktaMentionSchema = z
  .object({
    name: z.string().optional(),
    company_name: z.string().optional(),
    uuid: z.string().optional(),
  })
  .passthrough();

/** An industry-news article as seen by the mention extractor — mentions may live
 * under any of three field names, each an array of {@link aktaMentionSchema}. */
const aktaIndustryArticleSchema = z
  .object({
    companies: z.array(aktaMentionSchema).optional(),
    company_mentions: z.array(aktaMentionSchema).optional(),
    mentions: z.array(aktaMentionSchema).optional(),
  })
  .passthrough();

/** Normalize akta's sentiment string to the connector union, else undefined. */
function mapSentiment(
  s?: string,
): "positive" | "neutral" | "negative" | undefined {
  const v = (s ?? "").trim().toLowerCase();
  return v === "positive" || v === "neutral" || v === "negative" ? v : undefined;
}

/** A domain-like token is what isTrustedSource treats as a real publisher. */
const DOMAIN_RE = /[a-z0-9-]+\.[a-z]{2,}/i;

/**
 * Prefer akta's structured publisher domain; fall back to the article URL's
 * hostname, then the source domain. In practice akta's `publisher` is a display
 * name ("SmartCompany"), which would never pass the trusted-source domain check
 * — the article URL is the reliable domain carrier.
 */
function publisherDomain(item: AktaRawNewsItem): string | undefined {
  const fromString =
    typeof item.publisher === "string" ? item.publisher.trim() : undefined;
  if (fromString && DOMAIN_RE.test(fromString)) return fromString;
  const structured =
    typeof item.publisher === "object" ? item.publisher?.domain : undefined;
  if (structured) return structured;
  if (item.url) {
    try {
      return new URL(item.url).hostname.replace(/^www\./, "");
    } catch {
      // fall through to source_domain
    }
  }
  return clean(item.source_domain);
}

/**
 * Parse an akta estimate band into a transparent number: "$1B-$5B" → the band
 * midpoint; "$25B+" / "OVER-25B" → the band floor; "UNDER-10M" → half the cap.
 * Returns the number plus the human band label so callers can keep the range
 * visible in the basis string — the midpoint is never presented as a precise
 * figure. Plain numbers pass through with no label.
 */
export function parseEstimateBand(
  v: number | AktaEstimateBand | null | undefined,
): { value: number; label?: string } | null {
  if (typeof v === "number") return Number.isFinite(v) ? { value: v } : null;
  if (!v || typeof v !== "object") return null;
  const text = (v.label ?? v.code ?? "").toString().trim();
  if (!text) return null;
  const MULT: Record<string, number> = { K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
  const nums = [...text.matchAll(/\$?\s*([\d.]+)\s*([KMBT])?/gi)]
    .map((m) => {
      const n = Number(m[1]);
      const mult = MULT[(m[2] ?? "").toUpperCase()] ?? 1;
      return Number.isFinite(n) ? n * mult : null;
    })
    .filter((n): n is number => n != null && n > 0);
  if (nums.length === 0) return null;
  const upper = /under|below|<|less/i.test(text);
  const open = /\+|over|above|>/i.test(text);
  let value: number;
  if (nums.length >= 2) value = (nums[0] + nums[1]) / 2;
  else if (upper) value = nums[0] / 2;
  else value = nums[0]; // single bound: open-ended floor, or exact
  void open;
  return { value, label: text };
}

// ---------------------------------------------------------------------------
// Pure mappers — exported so they're unit-testable without any HTTP.
// ---------------------------------------------------------------------------

/** akta firmographic JSON → ConnectorCompanyProfile (null when nameless/empty). */
export function mapAktaProfile(
  data: AktaRawProfile | null | undefined,
): ConnectorCompanyProfile | null {
  if (!data || !data.name) return null;
  return {
    name: data.name,
    website: clean(data.website),
    sector: clean(data.product_category ?? data.industry),
    country: clean(data.country),
    foundedYear: clean(data.founded_year),
    description: clean(
      data.description ??
        data.company_description ??
        data.company_description_short,
    ),
    founders: data.founders && data.founders.length ? data.founders : undefined,
  };
}

/**
 * akta news array → ConnectorNewsItem[] with its native summary + sentiment.
 * Source is the article's publisher domain from akta metadata, falling back to
 * "akta.pro" (itself a trusted tier-1 source). Untitled items are dropped.
 */
export function mapAktaNews(
  items: AktaRawNewsItem[] | null | undefined,
): ConnectorNewsItem[] {
  if (!Array.isArray(items)) return [];
  const out: ConnectorNewsItem[] = [];
  for (const it of items) {
    const title = (it.title ?? "").trim();
    if (!title) continue;
    out.push({
      title,
      source: publisherDomain(it) ?? SOURCE,
      url: clean(it.url),
      date: isoDate(it.date ?? it.published_at ?? it.published_date),
      summary: clean((it.summary ?? it.ai_summary)?.trim()),
      sentiment: mapSentiment(it.sentiment),
    });
  }
  return out;
}

/**
 * akta financial_estimate JSON → Omit<ConnectorCompetitor, "name">. The basis /
 * revenueBasis strings MUST literally say "estimate": akta's financials are
 * modeled, never verified facts (data-integrity constraint). Null when neither a
 * valuation nor a revenue figure is present.
 */
export function mapAktaFinancial(
  data: AktaRawFinancial | null | undefined,
): Omit<ConnectorCompetitor, "name"> | null {
  if (!data) return null;
  const valuation = parseEstimateBand(data.valuation ?? data.valuation_estimate);
  const revenue = parseEstimateBand(data.revenue ?? data.revenue_estimate);
  if (valuation == null && revenue == null) return null;
  // Band values are midpoints/floors, never precise figures — keep the human
  // range label in the basis so the UI shows exactly what akta reported.
  const basisFor = (b: { label?: string } | null): string | undefined =>
    b == null
      ? undefined
      : b.label
        ? `akta.pro financial estimate (${b.label} band)`
        : "akta.pro financial estimate";
  return {
    valuation: valuation?.value,
    valuationDate: clean(data.valuation_date ?? data.as_of),
    revenue: revenue?.value,
    revenueBasis: basisFor(revenue),
    basis: basisFor(valuation),
    source: SOURCE,
  };
}

/**
 * akta industry-search hits → a comma-separated code list for the /v1/news
 * `industry` filter. Keeps only hits at/above the similarity floor (default 0.45
 * — below that the match is too loose to trust as the target's real industry) and
 * caps the list (default 3) so one over-broad search never fans the news query
 * out across dozens of industries. Empty / malformed input → "".
 */
export function resolveIndustryCodes(
  hits: AktaIndustryHit[] | null | undefined,
  opts: { floor?: number; cap?: number } = {},
): string {
  const floor = opts.floor ?? 0.45;
  const cap = opts.cap ?? 3;
  if (!Array.isArray(hits)) return "";
  return hits
    .filter(
      (h) =>
        typeof h.similarity === "number" && h.similarity >= floor && h.code != null,
    )
    .map((h) => String(h.code).trim())
    .filter((c) => c.length > 0)
    .slice(0, cap)
    .join(",");
}

/**
 * akta industry-news articles → competitor list, entity-resolved from the
 * articles' own company mentions (akta already links each mention to a company).
 * Accepts the three plausible mention field shapes leniently, excludes the target
 * company (case-insensitive), and ranks the remaining companies by mention
 * frequency (most-mentioned first). Every row is basis/source-tagged as an
 * akta.pro industry-news mention. Malformed / empty input → [] (never throws).
 */
export function extractIndustryMentions(
  articles: unknown,
  targetName: string,
): ConnectorCompetitor[] {
  if (!Array.isArray(articles)) return [];
  const target = targetName.trim().toLowerCase();
  // Preserve first-seen order for stable tie-breaking; count for the ranking.
  const counts = new Map<string, { name: string; count: number }>();
  for (const raw of articles) {
    const parsed = aktaIndustryArticleSchema.safeParse(raw);
    if (!parsed.success) continue;
    const a = parsed.data;
    const mentions = [
      ...(a.companies ?? []),
      ...(a.company_mentions ?? []),
      ...(a.mentions ?? []),
    ];
    for (const m of mentions) {
      const name = (m.name ?? m.company_name ?? "").trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (key === target) continue;
      const prev = counts.get(key);
      if (prev) prev.count += 1;
      else counts.set(key, { name, count: 1 });
    }
  }
  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .map((c) => ({
      name: c.name,
      basis: "akta.pro industry-news mention",
      source: SOURCE,
    }));
}

/**
 * Raw akta deep-search articles → ConnectorNewsItem[]. Same normalization as
 * mapAktaNews (native summary + sentiment, publisher-domain source falling back
 * to "akta.pro", untitled dropped) — named distinctly because it is the seam the
 * deep-dive grounding step depends on.
 */
export function normalizeDeepSearchArticles(
  articles: AktaRawNewsItem[] | null | undefined,
): ConnectorNewsItem[] {
  return mapAktaNews(articles);
}

// ---------------------------------------------------------------------------
// HTTP shell.
// ---------------------------------------------------------------------------

/**
 * GET the akta REST base + path with the x-api-key header and return the
 * envelope's `data` payload. On ANY failure (no key, network, non-2xx, malformed
 * envelope) return null — never throw (graceful-degradation + tampering guard).
 */
async function aktaGet(
  path: string,
  params: Record<string, string>,
): Promise<unknown | null> {
  const key = process.env.AKTA_API_KEY;
  if (!key) return null;
  try {
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`${AKTA_BASE}${path}?${qs}`, {
      headers: {
        "x-api-key": key,
        // akta.pro sits behind Cloudflare bot protection, which 403s (error
        // 1010) any request without a User-Agent — the Workers runtime fetch
        // sends none by default, so an explicit product UA is load-bearing.
        "User-Agent": "PrivateCompaniesTracker/1.0",
      },
    });
    if (!res.ok) return null;
    const parsed = envelopeSchema.safeParse(await res.json());
    return parsed.success ? parsed.data.data : null;
  } catch (e) {
    console.error("aktaGet:", (e as Error).message);
    return null;
  }
}

/**
 * Pull a named section out of an enrichment envelope. akta may return either the
 * bare section object or an object keyed by section name; handle both.
 */
function section(data: unknown, name: string): unknown {
  if (data && typeof data === "object" && name in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[name];
  }
  return data;
}

/**
 * Free company search — resolves a query to akta's uuid/website for reuse.
 * Module-level (not just a class method) so the standalone deep-search entry
 * point can reuse the exact same resolution. Returns null on any miss/failure.
 */
async function resolveAktaCompany(query: string): Promise<AktaSearchHit | null> {
  const data = await aktaGet("/v1/company/search", { query });
  if (!Array.isArray(data) || data.length === 0) return null;
  return (data as AktaSearchHit[])[0] ?? null;
}

/** Hard cap on akta /v1/news calls per deep-search (credits/denial guard). */
const DEEP_SEARCH_NEWS_CALL_CAP = 2;

/**
 * Step 3 of akta's workflow — topic-based deep search, run ONLY during deep-dive
 * generation. Resolves the company, then runs at most
 * {@link DEEP_SEARCH_NEWS_CALL_CAP} topic-scoped /v1/news calls, merges + title-
 * dedupes the articles, and normalizes them to ConnectorNewsItem[]. Absent key /
 * unresolved company / no topics → [] (never throws — matches aktaGet's contract).
 */
export async function aktaDeepSearch(
  companyQuery: string,
  topics: string[],
): Promise<ConnectorNewsItem[]> {
  const company = await resolveAktaCompany(companyQuery);
  if (!company?.uuid) return [];
  const uniqueTopics = Array.from(
    new Set(topics.map((t) => t.trim()).filter((t) => t.length > 0)),
  ).slice(0, DEEP_SEARCH_NEWS_CALL_CAP);
  if (uniqueTopics.length === 0) return [];
  const results = await Promise.all(
    uniqueTopics.map((query) =>
      aktaGet("/v1/news", {
        query,
        company: company.uuid as string,
        limit: "10",
        group_articles: "true",
      }),
    ),
  );
  const raw: AktaRawNewsItem[] = [];
  for (const data of results) {
    const items = Array.isArray(data) ? data : section(data, "articles");
    if (Array.isArray(items)) raw.push(...(items as AktaRawNewsItem[]));
  }
  // Dedupe by lowercased title so overlapping topics don't double-persist.
  const seen = new Set<string>();
  const out: ConnectorNewsItem[] = [];
  for (const item of normalizeDeepSearchArticles(raw)) {
    const key = item.title.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export class AktaConnector implements DataConnector {
  readonly id = "akta";

  /** Free company search — resolves a query to akta's uuid/website for reuse. */
  private async resolveCompany(query: string): Promise<AktaSearchHit | null> {
    return resolveAktaCompany(query);
  }

  async fetchCompanyProfile(
    query: string,
  ): Promise<ConnectorCompanyProfile | null> {
    const company = await this.resolveCompany(query);
    const ref = company?.uuid ?? company?.website;
    if (!ref) return null;
    const data = await aktaGet("/v1/company/enrichment", {
      company: ref,
      sections: "firmographic",
    });
    return mapAktaProfile(section(data, "firmographic") as AktaRawProfile | null);
  }

  async fetchFundingRounds(): Promise<ConnectorFundingRound[]> {
    // funding_detail is Enterprise-only and silently absent on lower tiers, so
    // rounds keep coming from Grok/Exa/SEC — akta contributes none here.
    return [];
  }

  async fetchNews(query: string): Promise<ConnectorNewsItem[]> {
    const company = await this.resolveCompany(query);
    if (!company?.uuid) return [];
    // akta returns AI summary + sentiment + publisher metadata natively — no
    // Grok pass needed.
    const data = await aktaGet("/v1/news", {
      company: company.uuid,
      limit: "15",
      group_articles: "true",
    });
    const items = Array.isArray(data) ? data : section(data, "articles");
    return mapAktaNews((Array.isArray(items) ? items : []) as AktaRawNewsItem[]);
  }

  /**
   * Step 2 of akta's workflow — industry-resolved competitor discovery. Resolves
   * the company (free) → resolves its industry codes via /v1/industry/search
   * (free) → ONE /v1/news call scoped to those industries → entity-resolved
   * competitor mentions ranked by frequency. Absent key / no company / no
   * industry codes / no articles → []. HARD cost guard: exactly one /v1/news call.
   */
  async fetchCompetitors(
    query: string,
    hint?: string,
  ): Promise<ConnectorCompetitor[]> {
    const company = await this.resolveCompany(query);
    if (!company) return [];
    const resolvedName = company.name ?? query;
    const industryQuery = (
      company.product_category ??
      hint ??
      resolvedName
    ).trim();
    if (!industryQuery) return [];
    const industryData = await aktaGet("/v1/industry/search", {
      query: industryQuery,
    });
    const hits = Array.isArray(industryData)
      ? industryData
      : section(industryData, "industries");
    const codes = resolveIndustryCodes(
      (Array.isArray(hits) ? hits : []) as AktaIndustryHit[],
    );
    if (!codes) return [];
    const newsData = await aktaGet("/v1/news", {
      industry: codes,
      limit: "25",
      group_articles: "true",
    });
    const articles = Array.isArray(newsData)
      ? newsData
      : section(newsData, "articles");
    return extractIndustryMentions(articles, resolvedName);
  }

  async fetchValuationMetric(
    query: string,
  ): Promise<Omit<ConnectorCompetitor, "name"> | null> {
    const company = await this.resolveCompany(query);
    const ref = company?.uuid ?? company?.website;
    if (!ref) return null;
    const data = await aktaGet("/v1/company/enrichment", {
      company: ref,
      sections: "financial_estimate",
    });
    return mapAktaFinancial(
      section(data, "financial_estimate") as AktaRawFinancial | null,
    );
  }
}
