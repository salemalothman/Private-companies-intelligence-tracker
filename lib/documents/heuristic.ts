import type {
  ConnectorFundingRound,
  ConnectorNewsItem,
} from "@/lib/connectors/types";

export interface ExtractedCompetitor {
  name: string;
  /** Post-money valuation in USD, if the document states one. */
  valuation?: number;
  /** Revenue / ARR in USD, if stated. */
  revenue?: number;
  /** Short provenance note (e.g. the phrase it was extracted from). */
  note?: string;
}

export interface ExtractedEntities {
  fundingRounds: ConnectorFundingRound[];
  valuations: {
    date: string;
    post_money: number;
    round: string | null;
    source: string;
  }[];
  news: ConnectorNewsItem[];
  competitors: ExtractedCompetitor[];
}

export interface ExtractOptions {
  title: string;
  source: string;
  url?: string;
}

const UNIT: Record<string, number> = {
  k: 1e3,
  thousand: 1e3,
  m: 1e6,
  mn: 1e6,
  million: 1e6,
  b: 1e9,
  bn: 1e9,
  billion: 1e9,
};

function parseAmount(numStr: string, unit: string): number | null {
  const n = parseFloat(numStr.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;
  return n * (UNIT[unit.toLowerCase()] ?? 1);
}

function normalizeDate(s: string): string | null {
  const trimmed = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  // Use local components so named dates ("June 1, 2023") don't shift across tz.
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function titleCaseRound(s: string): string {
  return s
    .trim()
    .replace(/\bseries\s+([a-k])\b/i, (_m, l) => `Series ${l.toUpperCase()}`)
    .replace(/\bpre-seed\b/i, "Pre-Seed")
    .replace(/\bseed\b/i, "Seed");
}

function detectSentiment(text: string): "positive" | "neutral" | "negative" {
  const t = text.toLowerCase();
  const neg =
    /\b(layoff|lay off|down round|decline|loss|lawsuit|shut down|shutdown|cut|miss(?:ed)?|bankrupt|investigation|resign)\b/;
  const pos =
    /\b(rais\w*|funding|valuation|growth|expand\w*|launch\w*|acqui\w*|partnership|profit\w*|record|surge|double[ds]?|milestone)\b/;
  if (neg.test(t)) return "negative";
  if (pos.test(t)) return "positive";
  return "neutral";
}

const STOP_NAME =
  /^(the|our|other|others|various|many|several|key|main|major|some|all|including|such|etc|inc|corp|llc|ltd)$/i;

/**
 * Heuristically pull competitor names out of a "competitors / competitive
 * landscape" mention. Captures the listed companies (and any inline valuation
 * stated right after a name). Names only — the LLM engine extracts richer data.
 */
function extractCompetitors(clean: string): ExtractedCompetitor[] {
  const m =
    clean.match(/competitors?(?:\s+include|\s+are)?\s*:?\s+([^.;\n]{3,220})/i) ||
    clean.match(/competitive landscape\s*:?\s+([^.;\n]{3,220})/i) ||
    clean.match(/(?:competes?|competing)\s+(?:with|against)\s+([^.;\n]{3,220})/i);
  if (!m) return [];

  const seen = new Set<string>();
  const out: ExtractedCompetitor[] = [];
  for (const part of m[1].split(/,|;|\band\b|&|\//i)) {
    // A name optionally followed by an inline "($X valuation)".
    const seg = part
      .replace(/\b(such as|including|like|e\.g\.?|namely|etc\.?)\b/gi, "")
      .trim();
    // A run of capitalized tokens ("Shield AI"), stopping at any lowercase word.
    const nameMatch = seg.match(/^([A-Z][A-Za-z0-9&.'\-]*(?:\s+[A-Z][A-Za-z0-9&.'\-]*)*)/);
    if (!nameMatch) continue;
    const name = nameMatch[1].trim().replace(/\s+(?:inc|corp|llc|ltd)\.?$/i, "");
    const key = name.toLowerCase();
    if (name.length < 2 || STOP_NAME.test(name) || seen.has(key)) continue;
    seen.add(key);
    const valM = seg.match(/\$\s?([\d.,]+)\s*(billion|million|bn|mn|m|b)\b/i);
    out.push({
      name,
      valuation: valM ? parseAmount(valM[1], valM[2]) ?? undefined : undefined,
      note: seg.slice(0, 80),
    });
    if (out.length >= 6) break;
  }
  return out;
}

/**
 * Keyless heuristic extraction of financial entities from document/article text.
 * Pulls a funding round, valuation point, a news item with sentiment, and any
 * competitor mentions. This is the fallback engine; the LLM extractor (gated on
 * a key) produces far higher accuracy via the same {@link ExtractedEntities}
 * contract.
 */
export function heuristicExtract(
  text: string,
  opts: ExtractOptions,
): ExtractedEntities {
  const clean = text.replace(/\s+/g, " ").trim();

  // Date
  const dateMatch =
    clean.match(
      /\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/,
    ) || clean.match(/\b\d{4}-\d{2}-\d{2}\b/);
  const date = dateMatch ? normalizeDate(dateMatch[0]) : null;

  // Round
  const roundMatch = clean.match(/\b(pre-seed|seed|series\s+[a-k])\b/i);
  const round = roundMatch ? titleCaseRound(roundMatch[1]) : null;

  // Amount raised
  const raiseMatch =
    clean.match(
      /rais\w*\s+(?:a\s+|an?\s+|its\s+)?\$\s?([\d.,]+)\s*(billion|million|bn|mn|m|b|k)\b/i,
    ) || clean.match(/\$\s?([\d.,]+)\s*(billion|million|bn|mn|m|b)\b/i);
  const amountRaised = raiseMatch
    ? parseAmount(raiseMatch[1], raiseMatch[2])
    : null;

  // Valuation — handle "valuing ... at $X", "valuation of $X", "valued at $X",
  // and "$X valuation".
  const valMatch =
    clean.match(
      /valu\w*[^$]{0,40}?\$\s?([\d.,]+)\s*(billion|million|bn|mn|m|b)\b/i,
    ) ||
    clean.match(/\$\s?([\d.,]+)\s*(billion|million|bn|mn|m|b)\s+valuation/i);
  const valuation = valMatch ? parseAmount(valMatch[1], valMatch[2]) : null;

  // Lead investor
  const leadMatch = clean.match(
    /led by ([A-Z][A-Za-z0-9&.'\- ]+?)(?:[,.]| and | with | to )/,
  );
  const leadInvestor = leadMatch ? leadMatch[1].trim() : null;

  const fundingRounds: ConnectorFundingRound[] = [];
  if (round || amountRaised != null || valuation != null) {
    fundingRounds.push({
      round: round ?? "Undisclosed",
      date: date ?? undefined,
      amountRaised: amountRaised ?? undefined,
      valuation: valuation ?? undefined,
      leadInvestor: leadInvestor ?? undefined,
      investors: leadInvestor ? [leadInvestor] : undefined,
      source: opts.source,
    });
  }

  const valuations: ExtractedEntities["valuations"] = [];
  if (valuation != null && date) {
    valuations.push({ date, post_money: valuation, round, source: opts.source });
  }

  const news: ConnectorNewsItem[] = [
    {
      title: opts.title,
      source: opts.source,
      url: opts.url,
      date: date ?? undefined,
      summary: clean.slice(0, 240),
      sentiment: detectSentiment(`${opts.title} ${clean.slice(0, 400)}`),
    },
  ];

  return { fundingRounds, valuations, news, competitors: extractCompetitors(clean) };
}
