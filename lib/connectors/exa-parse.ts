/**
 * Pure extraction helpers for the Exa connector — kept free of `server-only`
 * so the regex logic can be unit-tested directly.
 */

const SCALE: Record<string, number> = {
  k: 1e3, m: 1e6, b: 1e9, t: 1e12,
  thousand: 1e3, million: 1e6, billion: 1e9, trillion: 1e12,
};

function money(num: string, unit: string): number | undefined {
  const n = Number(num.replace(/,/g, ""));
  const mult = SCALE[unit.toLowerCase()];
  return Number.isFinite(n) && mult ? n * mult : undefined;
}

const MONEY = "\\$\\s?([\\d][\\d.,]*)\\s*(billion|million|trillion|thousand|b|m|t|k)";

export interface ExaDeal {
  valuation?: number;
  amountRaised?: number;
  round?: string;
}

/** Pull valuation / amount-raised / round-name out of a search highlight. */
export function extractDeal(text: string): ExaDeal {
  const t = text.replace(/\s+/g, " ");
  // Valuation: the money token sits immediately before "valuation" (or after
  // "valued at" / "valuation of") — anchor tightly so "$750M at $44B valuation"
  // yields $44B, not the $750M raise.
  const valM =
    t.match(new RegExp(`${MONEY}\\s+(?:post-?money\\s+)?valuation`, "i")) ??
    t.match(new RegExp(`(?:valued at|valuation of)\\s+${MONEY}`, "i"));
  // Amount raised: money immediately after "raises", or before "round/funding".
  const raiseM =
    t.match(new RegExp(`raise[sd]?\\s+${MONEY}`, "i")) ??
    t.match(new RegExp(`${MONEY}\\s+(?:funding round|round of funding|in funding)`, "i"));
  const roundM = t.match(/\b(series\s+[a-k]|pre-seed|seed|angel)\b/i);

  return {
    valuation: valM ? money(valM[1], valM[2]) : undefined,
    amountRaised: raiseM ? money(raiseM[1], raiseM[2]) : undefined,
    round: roundM
      ? roundM[1].replace(/\b\w/g, (c) => c.toUpperCase()).trim()
      : undefined,
  };
}
