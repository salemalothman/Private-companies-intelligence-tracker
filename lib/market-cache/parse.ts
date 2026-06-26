/**
 * Pure parser for the AG Dillon pre-IPO research newsletter. Extracts private
 * company valuation / revenue figures from the archive headlines and narrative
 * text (the precise ranked tables are images, so we parse the machine-readable
 * prose). Deterministic and side-effect free so it can be unit-tested against
 * real newsletter strings.
 */

export interface MarketDatum {
  name: string;
  nameKey: string;
  valuation?: number;
  revenue?: number;
  /** ISO date (YYYY-MM-DD) of the issue the figure was published in. */
  asOf: string;
  note: string;
  source: string;
  sourceUrl?: string;
}

/** Normalize a company name to a stable matching key. */
export function nameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "");
}

const SCALE: Record<string, number> = {
  k: 1e3,
  m: 1e6,
  b: 1e9,
  t: 1e12,
  thousand: 1e3,
  million: 1e6,
  billion: 1e9,
  trillion: 1e12,
};

const AMOUNT_RE =
  /\$\s?([\d][\d.,]*)\s*(k|m|b|t|thousand|million|billion|trillion)\b/i;

function parseAmount(num: string, scale: string): number | null {
  const n = Number(num.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  const mult = SCALE[scale.toLowerCase()];
  return mult ? n * mult : null;
}

// Trailing tokens that are keywords, not part of a company name.
const NAME_STOPWORDS = new Set([
  "ARR", "IPO", "AT", "TO", "HITS", "ACQUIRED", "MARKET", "CAP", "TARGET",
  "NEW", "BY", "FOR", "IN", "VS", "NOW", "ON", "RAISE", "RAISES", "RAISED",
  "REVENUE", "VALUATION", "STOCK", "DEAL", "TENDER", "BUYS", "AND", "THE",
  "POST", "FIRST", "DAY", "OF", "TRADING",
]);

// Normalized leading words that look like a name but never are one — mostly
// sentence/headline openers ("Pre-IPO ...", "Several firms ...").
const BLOCKED_NAMES = new Set([
  "pre", "preipo", "the", "this", "several", "prediction", "predictionmarkets",
  "annualized", "revenue", "two", "note", "week", "market", "markets",
  "compute", "computefutures", "our", "we", "a", "an", "their",
]);

const REVENUE_RE = /\b(revenue|arr)\b/i;
const VALUATION_RE =
  /valuation|market cap|ipo target|raises?\b|raise[ds]?\b|acquir|buys?\b|to \$|tender/i;

/**
 * Parse a single clause (one semicolon-delimited fragment of a headline, or one
 * sentence of body text) into a market datum, or null if it carries no usable
 * figure. Errs toward under-extraction: a dollar amount with no valuation /
 * revenue cue is skipped rather than mislabelled.
 */
export function parseClause(
  clause: string,
  asOf: string,
  sourceUrl?: string,
): MarketDatum | null {
  let c = clause.trim();
  if (!c) return null;
  // Strip a leading possessive qualifier ("China's DeepSeek" -> "DeepSeek").
  c = c.replace(/^[A-Z][\w.]*'s\s+(?=[A-Z])/, "");
  // Drop parentheticals ("Legora (legal)" -> "Legora").
  c = c.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  // Strip a leading index artifact ("96 Cursor ..." -> "Cursor ...").
  c = c.replace(/^\d+\s+/, "");

  const amt = c.match(AMOUNT_RE);
  if (!amt) return null;
  const value = parseAmount(amt[1], amt[2]);
  if (value == null) return null;

  const isRevenue = REVENUE_RE.test(c);
  const isValuation = VALUATION_RE.test(c);
  if (!isRevenue && !isValuation) return null;

  const nameMatch = c.match(/^([A-Z][\w.&’']*(?:\s+[A-Z][\w.&’']*)*)/);
  if (!nameMatch) return null;
  const tokens = nameMatch[1].split(/\s+/);
  while (tokens.length > 1 && NAME_STOPWORDS.has(tokens[tokens.length - 1].toUpperCase())) {
    tokens.pop();
  }
  const name = tokens
    .join(" ")
    .replace(/[’']s$/, "")
    .replace(/[.,]$/, "")
    .trim();
  if (name.length < 2) return null;
  const key = nameKey(name);
  if (!key || BLOCKED_NAMES.has(key)) return null;

  const datum: MarketDatum = {
    name,
    nameKey: key,
    asOf,
    note: clause.trim().replace(/\s+/g, " ").slice(0, 200),
    source: "agdillon",
    sourceUrl,
  };
  // Prefer revenue when both cues appear (e.g. "$30B revenue, 3x ...").
  if (isRevenue) datum.revenue = value;
  else datum.valuation = value;
  return datum;
}

export interface Segment {
  text: string;
  /** ISO issue date. */
  asOf: string;
  url?: string;
}

/**
 * Parse many newsletter segments and merge into one record per company,
 * keeping the most recent figure for each metric (valuation and revenue
 * tracked independently by issue date).
 */
export function parseMarketData(segments: Segment[]): MarketDatum[] {
  return mergeData(parseSegmentsRaw(segments));
}

/** Per-clause extraction without merging — one datum per matched clause. */
export function parseSegmentsRaw(segments: Segment[]): MarketDatum[] {
  const raw: MarketDatum[] = [];
  for (const seg of segments) {
    for (const clause of seg.text.split(/;|·|•|\. /)) {
      const d = parseClause(clause, seg.asOf, seg.url);
      if (d) raw.push(d);
    }
  }
  return raw;
}

/** Merge per-company, taking the latest non-null valuation and revenue. */
export function mergeData(data: MarketDatum[]): MarketDatum[] {
  const byKey = new Map<string, MarketDatum>();
  // Process newest-first so the first write of each metric wins.
  for (const d of [...data].sort((a, b) => b.asOf.localeCompare(a.asOf))) {
    const cur = byKey.get(d.nameKey);
    if (!cur) {
      byKey.set(d.nameKey, { ...d });
      continue;
    }
    if (cur.valuation == null && d.valuation != null) cur.valuation = d.valuation;
    if (cur.revenue == null && d.revenue != null) cur.revenue = d.revenue;
  }
  return [...byKey.values()];
}
