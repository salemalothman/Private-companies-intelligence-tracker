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
 * akta industry-news articles → company mentions ranked by frequency. Accepts the
 * three plausible mention field shapes leniently, excludes the target company
 * (case-insensitive), drops unnamed mentions, and returns `{ name, count }` sorted
 * most-mentioned first with first-seen order as the tie-break. This is the pure
 * counting core shared by {@link extractIndustryMentions} and the relevance-
 * filtered discovery pipeline. Malformed / empty input → [] (never throws).
 */
export function rankIndustryMentions(
  articles: unknown,
  targetName: string,
): Array<{ name: string; count: number }> {
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
  // Array.sort is stable in Node 20, so equal-count rows keep first-seen order.
  return Array.from(counts.values()).sort((a, b) => b.count - a.count);
}

/**
 * akta industry-news articles → competitor list, entity-resolved from the
 * articles' own company mentions (akta already links each mention to a company).
 * Thin wrapper over {@link rankIndustryMentions} that tags every ranked mention
 * with the byte-for-byte akta.pro industry-news basis/source. Behavior-preserving:
 * the mapping is identical to the pre-refactor extractor. Empty input → [].
 */
export function extractIndustryMentions(
  articles: unknown,
  targetName: string,
): ConnectorCompetitor[] {
  return rankIndustryMentions(articles, targetName).map((c) => ({
    name: c.name,
    basis: "akta.pro industry-news mention",
    source: SOURCE,
  }));
}

// ---------------------------------------------------------------------------
// Relevance filtering — pure, HTTP-free precision layer over ranked mentions.
// ---------------------------------------------------------------------------

/** One ranked mention enriched with its free-resolve firmographic fields. */
export interface ResolvedMention {
  name: string;
  count: number;
  product_category?: string;
  company_status?: string;
}

/** Options for {@link filterRelevantMentions}. */
export interface RelevanceOptions {
  /** Minimum industry-news article mentions to survive (default 2). */
  minMentions?: number;
  /** Token-Jaccard floor for a category match when no token is shared (default 0.3). */
  threshold?: number;
}

/**
 * Generic category words that carry no discriminating signal — sharing one of
 * these between two categories must NOT count as a relevance match, or every
 * "* Software" company would look comparable to every other.
 */
const CATEGORY_STOPWORDS = new Set([
  "software",
  "platform",
  "solutions",
  "services",
  "technology",
  "technologies",
  "inc",
  "co",
  "corp",
  "company",
  "the",
  "and",
  "a",
  "an",
]);

/**
 * Company statuses that mean the entity is no longer an operating peer. Matched
 * leniently: unknown/undefined and "private"/"public" are kept, only clearly-dead
 * states are dropped, so a thin status field never over-prunes discovery.
 */
const DEAD_STATUSES = new Set([
  "acquired",
  "delisted",
  "closed",
  "defunct",
  "dead",
]);

/** Lowercase, split on non-alphanumerics, drop stopwords + empties → token set. */
function categoryTokens(category: string | undefined): Set<string> {
  if (!category) return new Set();
  return new Set(
    category
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 0 && !CATEGORY_STOPWORDS.has(t)),
  );
}

/** Token-set Jaccard similarity (|∩| / |∪|); 0 when either side is empty. */
function tokenJaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Precision filter over ranked-and-resolved industry-news mentions. Keeps only
 * plausibly-comparable peers by layering three cheap, pure gates over the free
 * firmographic resolve — adds NO billable calls:
 *   1. Min mentions: a candidate seen in fewer than `minMentions` (default 1)
 *      articles is dropped. Live data (2026-07-17) showed real competitors
 *      typically appear once in a 25-article window while repeat mentions were
 *      the noise (mega-caps in tangential stories) — so frequency is kept as a
 *      RANKING signal, and the category-similarity gate does the filtering.
 *   2. Verifiability: a candidate with no `product_category` is unresolvable →
 *      dropped.
 *   3. Liveness: a clearly-dead `company_status` → dropped (lenient otherwise).
 *   4. Category similarity: keep when the candidate shares >= 1 substantive token
 *      with the target category OR the token-Jaccard >= `threshold` (default 0.3).
 *      A target category with no substantive tokens is treated leniently (survive
 *      on mention count alone) so a thin target category never zeroes discovery.
 * Survivors are re-sorted by mention count (desc) and tagged with the unchanged
 * akta.pro industry-news basis/source. Empty / malformed input → [] (never throws).
 */
export function filterRelevantMentions(
  resolved: ResolvedMention[],
  targetCategory: string,
  opts: RelevanceOptions = {},
): ConnectorCompetitor[] {
  if (!Array.isArray(resolved)) return [];
  const minMentions = opts.minMentions ?? 1;
  const threshold = opts.threshold ?? 0.3;
  const targetTokens = categoryTokens(targetCategory);
  return resolved
    .filter(
      (r): r is ResolvedMention =>
        !!r && typeof r.name === "string" && r.name.trim().length > 0,
    )
    .filter((r) => (r.count ?? 0) >= minMentions)
    .filter((r) => !DEAD_STATUSES.has((r.company_status ?? "").trim().toLowerCase()))
    .filter((r) => {
      const cat = (r.product_category ?? "").trim();
      if (!cat) return false; // unverifiable → drop
      // Thin target category → be lenient, keep on mention count alone.
      if (targetTokens.size === 0) return true;
      const candTokens = categoryTokens(cat);
      if (candTokens.size === 0) return false;
      for (const t of candTokens) if (targetTokens.has(t)) return true;
      return tokenJaccard(targetTokens, candTokens) >= threshold;
    })
    .sort((a, b) => b.count - a.count)
    .map((r) => ({
      name: r.name.trim(),
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
 *
 * `privateOnly` applies the app's holdings guardrail: this tracker holds
 * privately held companies only, so when resolving the PRIMARY (tracked)
 * company we must never bind to a public-market entity — a "public" match is
 * either the wrong real-world entity or a company this app doesn't cover.
 * Competitor-candidate resolves pass `privateOnly: false`: the competitive
 * landscape legitimately includes public peers (e.g. Figma).
 */
async function resolveAktaCompany(
  query: string,
  opts: { privateOnly?: boolean } = {},
): Promise<AktaSearchHit | null> {
  const data = await aktaGet("/v1/company/search", { query });
  if (!Array.isArray(data) || data.length === 0) return null;
  const hits = data as AktaSearchHit[];
  return opts.privateOnly ? pickPrimaryCompanyHit(hits) : (hits[0] ?? null);
}

/** Statuses that mark a public-market entity — never a valid PRIMARY match. */
const PUBLIC_MARKET_STATUSES = new Set(["public", "delisted"]);

/**
 * First search hit eligible to be the tracked (primary) company: skips hits
 * whose company_status marks a public-market entity; unknown/missing statuses
 * stay eligible (lenient — a thin status field must never zero out resolution).
 * Pure and exported for HTTP-free tests.
 */
export function pickPrimaryCompanyHit(
  hits: AktaSearchHit[] | null | undefined,
): AktaSearchHit | null {
  if (!Array.isArray(hits)) return null;
  return (
    hits.find(
      (h) =>
        !PUBLIC_MARKET_STATUSES.has((h?.company_status ?? "").trim().toLowerCase()),
    ) ?? null
  );
}

/** Hard cap on akta /v1/news calls per deep-search (credits/denial guard). */
const DEEP_SEARCH_NEWS_CALL_CAP = 2;

/**
 * Hard cap on the FREE /v1/company/search resolves the competitor relevance
 * filter issues per fetchCompetitors run. These cost 0 credits but still hit the
 * network, so we bound the fan-out — the top-mentioned candidates are the only
 * ones worth verifying against product category.
 */
const RELEVANCE_RESOLVE_CAP = 10;

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
  const company = await resolveAktaCompany(companyQuery, { privateOnly: true });
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

  /**
   * Free company search — resolves the TRACKED company, so the privately-held
   * guardrail applies (public-market hits are never a valid primary match).
   */
  private async resolveCompany(query: string): Promise<AktaSearchHit | null> {
    return resolveAktaCompany(query, { privateOnly: true });
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
   * Step 2 of akta's workflow — competitor discovery. Resolves the company
   * (free) → resolves its industry codes via /v1/industry/search (free) → TWO
   * billable /v1/news calls (the target's own news for co-mentions, the
   * strongest peer signal; plus industry-scoped news for breadth) →
   * entity-resolved mentions merged with a co-mention boost → a precision pass
   * that keeps only plausibly-comparable peers. Absent key / no company / no
   * articles → []. HARD cost guards: at most two billable /v1/news calls, and
   * the FREE /v1/company/search resolves that feed the relevance filter are
   * capped at {@link RELEVANCE_RESOLVE_CAP} candidates (best-effort, never throws).
   */
  async fetchCompetitors(
    query: string,
    hint?: string,
  ): Promise<ConnectorCompetitor[]> {
    const company = await this.resolveCompany(query);
    if (!company) return [];
    const resolvedName = company.name ?? query;
    const targetCategory = (
      company.product_category ??
      hint ??
      resolvedName
    ).trim();
    if (!targetCategory) return [];
    // Two billable news calls, HARD CAP — that is the entire discovery cost:
    //   a) the target's OWN news: co-mentioned companies (comparison pieces,
    //      market roundups) are a strong peer signal;
    //   b) a semantic comparison query ("X competitors alternatives...") —
    //      live testing (2026-07-17, Canva) showed this is where real peers
    //      get named (Figma, Affinity, Leonardo AI). Constraining it with the
    //      `industry` filter ANDs the filters and returned ZERO articles, and
    //      industry-only news skewed to tangential mega-caps — so the
    //      comparison query intentionally runs unconstrained.
    // Both run best-effort; either failing degrades to the other's candidates.
    const comparisonParams: Record<string, string> = {
      query: `${resolvedName} competitors alternatives comparison`,
      limit: "25",
      group_articles: "true",
    };
    const [companyNewsData, industryNewsData] = await Promise.all([
      company.uuid
        ? aktaGet("/v1/news", {
            company: company.uuid,
            limit: "15",
            group_articles: "true",
          })
        : Promise.resolve(null),
      aktaGet("/v1/news", comparisonParams),
    ]);
    const toArticles = (d: unknown): unknown[] => {
      if (Array.isArray(d)) return d;
      const s = section(d, "articles");
      return Array.isArray(s) ? s : [];
    };

    // Rank each pool independently and take the top half of the resolve budget
    // from EACH — neither pool may crowd out the other (live testing: grouped
    // syndicated stories can flood the company-news pool with 9x mentions of
    // unrelated mega-caps, which would otherwise consume every resolve slot
    // before a once-mentioned genuine peer from a comparison article gets one).
    // The category-similarity gate in filterRelevantMentions does the actual
    // filtering; counts only order candidates. Capped BEFORE any resolve so the
    // free /v1/company/search fan-out can never exceed RELEVANCE_RESOLVE_CAP.
    // Asymmetric split: the comparison-query pool is the stronger signal and
    // its genuine peers often carry only 1 mention, so it gets the larger share
    // of the resolve budget (7/3 of 10) — live testing showed a 5/5 split let
    // 2-count tangential names (Anthropic, Teva) squeeze out a 1-count Figma.
    const COMPARISON_POOL_CAP = Math.ceil(RELEVANCE_RESOLVE_CAP * 0.7);
    const COMPANY_POOL_CAP = RELEVANCE_RESOLVE_CAP - COMPARISON_POOL_CAP;
    const merged = new Map<string, { name: string; count: number }>();
    const takePool = (data: unknown, cap: number): void => {
      for (const c of rankIndustryMentions(toArticles(data), resolvedName).slice(
        0,
        cap,
      )) {
        const prev = merged.get(c.name.toLowerCase());
        if (prev) prev.count += c.count;
        else merged.set(c.name.toLowerCase(), { name: c.name, count: c.count });
      }
    };
    takePool(industryNewsData, COMPARISON_POOL_CAP); // comparison-query pool
    takePool(companyNewsData, COMPANY_POOL_CAP);
    const candidates = [...merged.values()]
      .sort((a, b) => b.count - a.count)
      .slice(0, RELEVANCE_RESOLVE_CAP);
    if (candidates.length === 0) return [];

    // Free (0-credit) firmographic resolves, best-effort + isolated per candidate:
    // any miss/failure maps to null and is dropped — never adds a /v1/news call.
    const resolved = (
      await Promise.all(
        candidates.map(async (c): Promise<ResolvedMention | null> => {
          try {
            const hit = await resolveAktaCompany(c.name);
            if (!hit) return null;
            return {
              name: c.name,
              count: c.count,
              product_category: hit.product_category,
              company_status: hit.company_status,
            };
          } catch {
            return null;
          }
        }),
      )
    ).filter((r): r is ResolvedMention => r != null);

    return filterRelevantMentions(resolved, targetCategory);
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
