import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";

/**
 * Entity disambiguation + signal filtering.
 *
 * Private portfolio companies frequently collide by name with unrelated public
 * tickers. This module blocks signals (news / market events) that belong to the
 * wrong entity from being routed onto a portfolio company's feed — most notably
 * isolating private "Accrete AI" from the publicly-traded Japanese "Accrete
 * Inc." (TYO: 4395 / 4395.T). Pure matchers + a DB cleanup pass.
 */

type DB = SupabaseClient<Database>;

export interface CollisionRule {
  /** Portfolio company name this rule guards (case-insensitive). */
  company: string;
  /** Patterns that mark a signal as belonging to the *wrong* entity. */
  block: RegExp;
  reason: string;
}

export const COLLISION_RULES: CollisionRule[] = [
  {
    company: "Accrete Ai",
    // ASCII alternatives use word boundaries; the katakana term can't (\b is
    // ASCII-only), so it sits outside the bounded group.
    block:
      /(?:\b(?:4395(?:\.T|\.TYO)?|TYO:\s?4395|tokyo stock exchange|accrete[, ]+inc\.?)\b|アクリート)/i,
    reason:
      "Publicly-traded Japanese SMS firm Accrete Inc. (TYO:4395) — unrelated to private Accrete AI",
  },
];

/**
 * Generic public-equity noise: stock quotes / ticker movements that should never
 * appear on a *private* company's timeline (e.g. Yahoo Finance price alerts).
 */
const STOCK_SIGNAL =
  /\b(yahoo finance|stock (price|quote|alert|movement)|share price|ticker|\d{4}\.T\b|TYO:|TSE:|closing price|day's range|market cap of|trading at .* per share on (the )?(tokyo|nasdaq|nyse))\b/i;

/**
 * Exchange-symbol title patterns (e.g. "NYSE:MOOV", "TSE:4395"). A private
 * company should never carry an exchange ticker; these siblings extend the
 * generic public-equity gate beyond the Tokyo-specific cases in STOCK_SIGNAL.
 */
const EXCHANGE_SYMBOL =
  /\b(?:NYSE|NASDAQ|TSE|TYO|LSE|HKG|SEHK|SGX|ASX|TSX|TSXV|KRX|SIX|FRA|ETR|BSE|NSE|SHA|SHE|SZSE|SSE):\s?[A-Za-z0-9]/i;

/**
 * Finance / ticker aggregator domains that publish *only* public-equity data, so
 * their presence on a private company's feed is definitively wrong-entity noise.
 * Deliberately excludes finance.yahoo.* and investing.com — those are broad
 * publishers that also carry legitimate private-company funding coverage, so
 * blocking them wholesale would purge real rows.
 */
const FINANCE_DOMAIN =
  /\b(?:tradingview\.com|marketscreener\.com|stockanalysis\.com|wallmine\.com)\b/i;

/**
 * True when an exchange ticker (e.g. "NYSE:MOOV") sits *adjacent* to the tracked
 * company's own name — "Moove Corp (NYSE:MOOV)" — rather than merely mentioning a
 * third party's ticker in passing ("Acme acquired by Salesforce (NYSE:CRM)").
 * Only a name-adjacent ticker marks the item as belonging to the wrong (public)
 * entity; an incidental peer ticker must not block a legitimate item.
 */
function exchangeTickerNearName(text: string, companyName: string): boolean {
  const token = companyName.trim().split(/\s+/)[0]?.toLowerCase();
  if (!token) return false;
  const lower = text.toLowerCase();
  // Only corporate-suffix / punctuation "connector" tokens may sit between the
  // company name and its ticker; any real word (e.g. "acquired by") breaks it.
  const gap =
    /^[\s,.\-()]*(?:(?:inc|incorporated|corp|corporation|company|co|holdings|group|ltd|limited|plc|ag|sa|nv|the)[\s,.\-()]*)*$/;
  for (const m of text.matchAll(new RegExp(EXCHANGE_SYMBOL.source, "gi"))) {
    const idx = m.index ?? 0;
    const tIdx = lower.lastIndexOf(token, idx);
    if (tIdx === -1) continue;
    if (gap.test(lower.slice(tIdx + token.length, idx))) return true;
  }
  return false;
}

/**
 * Which country an exchange prefix implies — used to catch an event that asserts
 * a foreign listing contradicting a company's stored HQ country. Conservative:
 * only exchanges with an unambiguous single home country are mapped.
 */
const EXCHANGE_COUNTRY: Record<string, string> = {
  TSE: "japan",
  TYO: "japan",
  LSE: "united kingdom",
  HKG: "hong kong",
  SEHK: "hong kong",
  SGX: "singapore",
  ASX: "australia",
  TSX: "canada",
  TSXV: "canada",
  KRX: "south korea",
  BSE: "india",
  NSE: "india",
};

export interface BlockResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Decide whether a text signal belongs to the wrong entity for `companyName`.
 * Applies named collision rules first, then generic public-equity noise for
 * companies known to be private.
 *
 * `scope` controls how aggressive the generic public-equity gate is:
 * - `"ingest"` (default): the write-time filter — also blocks name-adjacent
 *   exchange tickers and finance-aggregator domains.
 * - `"purge"`: the destructive DB-cleanup filter — restricted to named collision
 *   rules + the narrow STOCK_SIGNAL gate only, so a broad ticker/finance match
 *   can never DELETE a legitimate already-ingested row.
 */
export function wrongEntitySignal(
  companyName: string,
  text: string,
  opts: { isPrivate?: boolean; scope?: "ingest" | "purge" } = {},
): BlockResult {
  const name = companyName.trim().toLowerCase();
  for (const r of COLLISION_RULES) {
    if (r.company.toLowerCase() === name && r.block.test(text)) {
      return { blocked: true, reason: r.reason };
    }
  }
  if (opts.isPrivate === false) return { blocked: false };
  const scope = opts.scope ?? "ingest";
  // Narrow gate (both scopes): live stock-quote prose on a private company.
  if (STOCK_SIGNAL.test(text)) {
    return { blocked: true, reason: "Public-equity stock signal on a private company" };
  }
  // Broad gate (ingest only): a name-adjacent exchange ticker or a pure
  // public-equity aggregator domain. Excluded from "purge" so the DELETE path
  // can never remove a legitimate row over an incidental match.
  if (
    scope === "ingest" &&
    (exchangeTickerNearName(text, companyName) || FINANCE_DOMAIN.test(text))
  ) {
    return { blocked: true, reason: "Public-equity stock signal on a private company" };
  }
  return { blocked: false };
}

/** Report-ish phrasing that marks a title as a multi-company sector piece. */
const REPORT_KEYWORDS =
  /\b(valuations?|sector|market map|landscape|state of|top \d+|ranking|q[1-4]\s?20\d{2})\b/i;

/**
 * True when a title reads like a generic multi-company report (sector map, "AI
 * Valuations: Q2 2026", "Top 50 …") rather than a specific event for the tracked
 * company — i.e. the tracked name is absent AND report keywords are present.
 * Observational only; no scoring.
 */
export function isGenericMultiCompanyReport(
  companyName: string,
  title: string,
  detail?: string | null,
): boolean {
  const name = companyName.trim().toLowerCase();
  const nameInTitle = !!name && title.toLowerCase().includes(name);
  if (nameInTitle) return false;
  return REPORT_KEYWORDS.test([title, detail].filter(Boolean).join(" "));
}

export interface CompanyEventContext {
  name: string;
  country?: string | null;
  founded_year?: number | null;
  /** Portfolio companies are private by default; pass false for a public marker. */
  isPrivate?: boolean;
}

export interface ScreenableEvent {
  type: "corporate" | "valuation" | "secondary";
  title: string;
  detail?: string | null;
  url?: string | null;
  value?: number | null;
}

export interface EventScreenResult {
  drop: boolean;
  value: number | null;
  reason?: string;
}

/**
 * Screen one Exa-sourced event before it is stored on a private company's
 * timeline. Drops wrong-entity hits (foreign exchange tickers / finance domains),
 * foreign-listing claims that contradict a stored HQ country, and generic
 * multi-company valuation reports (a figure-less-for-this-company number is
 * noise). Pure + observational — mirrors `wrongEntitySignal`, no LLM, no scoring.
 */
export function screenCompanyEvent(
  company: CompanyEventContext,
  event: ScreenableEvent,
): EventScreenResult {
  const text = signalText(event);

  // 1. Wrong entity: named collisions + generic public-equity noise.
  const wrong = wrongEntitySignal(company.name, text, {
    isPrivate: company.isPrivate,
  });
  if (wrong.blocked) return { drop: true, value: null, reason: wrong.reason };

  // 2. Profile contradiction: a stated foreign exchange whose home country
  //    differs from the company's stored country. Conservative — only fires when
  //    the country fact is present and the exchange maps to one country.
  if (company.country) {
    const country = company.country.trim().toLowerCase();
    const m = text.match(EXCHANGE_SYMBOL);
    if (m) {
      const prefix = m[0].split(":")[0].toUpperCase();
      const exCountry = EXCHANGE_COUNTRY[prefix];
      if (exCountry && exCountry !== country) {
        return {
          drop: true,
          value: null,
          reason: `Foreign ${prefix} listing contradicts stored country ${company.country}`,
        };
      }
    }
  }

  // 3. Generic multi-company valuation report: a valuation event that names the
  //    sector, not the company — storing its figure would fabricate a per-company
  //    valuation, so drop it entirely.
  if (
    event.type === "valuation" &&
    isGenericMultiCompanyReport(company.name, event.title, event.detail)
  ) {
    return {
      drop: true,
      value: null,
      reason: "Generic multi-company sector report, not a per-company valuation",
    };
  }

  return { drop: false, value: event.value ?? null };
}

const signalText = (r: {
  title?: string | null;
  detail?: string | null;
  summary?: string | null;
  url?: string | null;
}) => [r.title, r.detail, r.summary, r.url].filter(Boolean).join(" ");

export interface DisambiguationSummary {
  eventsBlocked: number;
  newsBlocked: number;
}

/**
 * Remove already-ingested wrong-entity signals from a company's events + news.
 * Run as part of the global sync so historical false positives are scrubbed.
 */
export async function purgeWrongEntitySignals(
  supabase: DB,
  company: { id: string; name: string },
): Promise<DisambiguationSummary> {
  let eventsBlocked = 0, newsBlocked = 0;

  // Collect the wrong-entity ids, then delete each table in one round-trip.
  const { data: events } = await supabase
    .from("company_events")
    .select("id, title, detail, url")
    .eq("company_id", company.id);
  const eventIds = (events ?? [])
    .filter(
      (e) =>
        wrongEntitySignal(company.name, signalText(e), { scope: "purge" })
          .blocked,
    )
    .map((e) => e.id);
  if (eventIds.length) {
    await supabase.from("company_events").delete().in("id", eventIds);
    eventsBlocked = eventIds.length;
  }

  const { data: news } = await supabase
    .from("news")
    .select("id, title, summary, url")
    .eq("company_id", company.id);
  const newsIds = (news ?? [])
    .filter(
      (n) =>
        wrongEntitySignal(company.name, signalText(n), { scope: "purge" })
          .blocked,
    )
    .map((n) => n.id);
  if (newsIds.length) {
    await supabase.from("news").delete().in("id", newsIds);
    newsBlocked = newsIds.length;
  }

  return { eventsBlocked, newsBlocked };
}
