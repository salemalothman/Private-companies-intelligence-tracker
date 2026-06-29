/**
 * Pure extraction helpers for the Exa events sweep — date, secondary share
 * price, and event-type classification. Kept free of `server-only` so the
 * regex logic can be unit-tested directly.
 */

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9,
  oct: 10, nov: 11, dec: 12,
};

const ymd = (y: string, mo: number, d: string | number) =>
  `${y}-${String(mo).padStart(2, "0")}-${String(Number(d)).padStart(2, "0")}`;

/** Best-effort extraction of a calendar date mentioned in free text. */
export function parseEventDate(text: string): string | null {
  const t = text.replace(/\s+/g, " ");
  const iso = t.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  let m = t.match(/\b([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(20\d{2})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(m[3], MONTHS[m[1].toLowerCase()], m[2]);

  m = t.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (m && MONTHS[m[2].toLowerCase()]) return ymd(m[3], MONTHS[m[2].toLowerCase()], m[1]);

  m = t.match(/\bQ([1-4])\s*(20\d{2})\b/i);
  if (m) return ymd(m[2], (Number(m[1]) - 1) * 3 + 1, 1);

  m = t.match(/\b([A-Za-z]{3,9})\.?\s+(20\d{2})\b/);
  if (m && MONTHS[m[1].toLowerCase()]) return ymd(m[2], MONTHS[m[1].toLowerCase()], 1);

  return null;
}

const SCALE: Record<string, number> = {
  k: 1e3, thousand: 1e3, m: 1e6, million: 1e6,
  b: 1e9, billion: 1e9, t: 1e12, trillion: 1e12,
};
const MONEY_RE = "\\$\\s?([\\d][\\d.,]*)\\s*(billion|million|trillion|thousand|b|m|t|k)";

/** The subject company's revenue / ARR, e.g. "revenue of $4B" / "$4B in ARR". */
export function parseRevenue(text: string): number | undefined {
  const t = text.replace(/\s+/g, " ");
  const m =
    t.match(new RegExp(`(?:revenue|arr|annual recurring revenue)\\s+of\\s+${MONEY_RE}`, "i")) ||
    t.match(new RegExp(`${MONEY_RE}\\s+(?:in\\s+)?(?:annual\\s+)?(?:revenue|arr|recurring revenue)`, "i"));
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, "")) * (SCALE[m[2].toLowerCase()] ?? 1);
  return Number.isFinite(n) ? n : undefined;
}

/** Secondary-market price per share, e.g. "$58.50 per share" -> 58.5. */
export function parseSharePrice(text: string): number | undefined {
  const m = text.match(/\$\s?([\d][\d.,]*)\s*(?:per share|\/\s*share|a share)/i);
  if (!m) return undefined;
  const n = Number(m[1].replace(/,/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

export type ParsedEventType = "corporate" | "valuation" | "secondary";

/** Bucket a result into corporate calendar / valuation / secondary-market. */
export function classifyEvent(text: string): ParsedEventType {
  const t = text.toLowerCase();
  if (/secondary|tender offer|per share|\/\s*share|a share|forge global|nasdaq private/.test(t))
    return "secondary";
  if (/valuation|valued at|raise[sd]?\b|funding round|post-?money/.test(t))
    return "valuation";
  return "corporate";
}
