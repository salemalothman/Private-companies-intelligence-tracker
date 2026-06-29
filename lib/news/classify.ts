/**
 * News categories. NULL/undefined = a general update; "contract" = a material
 * business deal or contract win that the feed highlights.
 */
export type NewsCategory = "contract";

/**
 * Strong deal signals — phrases that, on their own, reliably indicate a company
 * secured or announced a business deal / material contract.
 */
const DEAL_PATTERNS: RegExp[] = [
  /\bcontract(s)?\b/,
  /\bawarded\b|\bawards?\b/,
  /\bpartnership\b|\bpartners? with\b|\bteams? up with\b/,
  /\bsign(s|ed)?\b.*\b(deal|agreement|contract|partnership)\b/,
  /\b(deal|agreement|contract|partnership)\b.*\bsign(s|ed)?\b/,
  /\bwins?\b.*\b(deal|contract|bid|mandate|customer|client|account)\b/,
  /\bselected by\b|\bchosen by\b|\bpicks?\b.*\bto power\b/,
  /\b(multi-year|multiyear|framework)\b.*\b(deal|agreement|contract)\b/,
  /\bprocurement\b|\bmandate\b/,
  /\block(s|ed)? in\b.*\b(customer|client|deal)\b/,
  /\blands?\b.*\b(deal|contract|customer|client|partnership)\b/,
  /\brolls? out\b.*\bwith\b/,
  /\bgoes? live with\b|\bdeploys?\b.*\bacross\b/,
  /\bexpands? (its )?partnership\b/,
  /\bmemorandum of understanding\b|\bmou\b/,
];

/**
 * Classify a news item from its title (+ optional summary). Returns "contract"
 * when the text describes a business deal / contract win, else null. Pure and
 * deterministic so every source — connector or manual entry — is tagged the
 * same way at ingestion time.
 */
export function classifyNews(
  title: string,
  summary?: string | null,
): NewsCategory | null {
  const text = `${title} ${summary ?? ""}`.toLowerCase();
  return DEAL_PATTERNS.some((re) => re.test(text)) ? "contract" : null;
}

/** True when the item is a material deal / contract win. */
export function isContractWin(category: string | null | undefined): boolean {
  return category === "contract";
}

export type Sentiment = "positive" | "neutral" | "negative";

const NEGATIVE =
  /\b(layoff|lay off|down ?round|decline|loss|lawsuit|shut ?down|cut|miss(?:ed)?|bankrupt|investigation|resign|fraud|probe|delay|recall|breach|hack|outage|sued?|fine[ds]?|plunge|slump|writedown|write-down)\b/i;
const POSITIVE =
  /\b(rais\w*|funding|valuation|growth|expand\w*|launch\w*|acqui\w*|partnership|profit\w*|record|surge|double[ds]?|triple[ds]?|milestone|wins?|awarded|secures?|beats?|soars?|breakthrough|ipo|hits?\b)\b/i;

/**
 * Lightweight keyword sentiment scorer for news items. Negative cues take
 * precedence (downside matters more), then positive, else neutral. Pure and
 * deterministic so the same article always scores the same.
 */
export function scoreSentiment(
  title: string,
  summary?: string | null,
): Sentiment {
  const text = `${title} ${summary ?? ""}`;
  if (NEGATIVE.test(text)) return "negative";
  if (POSITIVE.test(text)) return "positive";
  return "neutral";
}
