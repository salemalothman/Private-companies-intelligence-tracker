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

export interface BlockResult {
  blocked: boolean;
  reason?: string;
}

/**
 * Decide whether a text signal belongs to the wrong entity for `companyName`.
 * Applies named collision rules first, then generic public-equity noise for
 * companies known to be private.
 */
export function wrongEntitySignal(
  companyName: string,
  text: string,
  opts: { isPrivate?: boolean } = {},
): BlockResult {
  const name = companyName.trim().toLowerCase();
  for (const r of COLLISION_RULES) {
    if (r.company.toLowerCase() === name && r.block.test(text)) {
      return { blocked: true, reason: r.reason };
    }
  }
  // A private company should never carry live stock-quote signals.
  if (opts.isPrivate !== false && STOCK_SIGNAL.test(text)) {
    return { blocked: true, reason: "Public-equity stock signal on a private company" };
  }
  return { blocked: false };
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
    .filter((e) => wrongEntitySignal(company.name, signalText(e)).blocked)
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
    .filter((n) => wrongEntitySignal(company.name, signalText(n)).blocked)
    .map((n) => n.id);
  if (newsIds.length) {
    await supabase.from("news").delete().in("id", newsIds);
    newsBlocked = newsIds.length;
  }

  return { eventsBlocked, newsBlocked };
}
