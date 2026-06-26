import type { Company } from "@/lib/types";

/** A single estimated revenue segment in the business-model breakdown. */
export interface RevenueSegment {
  key: "enterprise" | "government" | "services" | "consumer";
  label: string;
  /** Integer percentage of estimated revenue (the set sums to 100). */
  pct: number;
}

type SegKey = RevenueSegment["key"];

const LABELS: Record<SegKey, string> = {
  enterprise: "Enterprise Software / SaaS",
  government: "Government / Public Sector Contracts",
  services: "Professional Services / Implementation",
  consumer: "Consumer Subscriptions / Usage-based",
};

/**
 * Keyword signals per segment. Each match adds the given weight to that
 * segment's score. Weights are deliberately coarse — this is a heuristic
 * estimate adapted to the company profile, not a financial disclosure.
 */
const SIGNALS: Record<SegKey, Array<[RegExp, number]>> = {
  enterprise: [
    [/\bsaas\b/, 3],
    [/\benterprise\b/, 3],
    [/\bb2b\b/, 3],
    [/\bplatform\b/, 2],
    [/\bcloud\b/, 2],
    [/\bapi\b/, 2],
    [/\bdeveloper|devtool|\bide\b|\bcode\b/, 2],
    [/\bsoftware\b/, 2],
    [/\binfrastructure\b/, 2],
    [/\bdata|analytics\b/, 1],
    [/\bsecurity\b/, 1],
    [/\bai\b|\bllm\b|machine learning/, 1],
  ],
  government: [
    [/\bgovernment|\bgov\b|public sector|public-sector/, 4],
    [/\bdefense|defence|military\b/, 4],
    [/\bfederal|agency|agencies\b/, 3],
    [/\bcivic|municipal\b/, 2],
    [/\bcompliance|regulat/, 1],
  ],
  services: [
    [/\bconsult|consulting\b/, 4],
    [/\bimplementation|integrator|integration\b/, 3],
    [/professional services/, 4],
    [/\bdeployment|rollout\b/, 2],
    [/\badvisory|managed services\b/, 2],
    [/\bsupport contract|onboarding\b/, 1],
  ],
  consumer: [
    [/\bconsumer\b|\bb2c\b/, 4],
    [/\bsubscription|freemium\b/, 3],
    [/usage-based|pay.as.you.go|metered\b/, 3],
    [/\bcreator|prosumer|individual\b/, 2],
    [/\bmobile app|\bapp\b/, 2],
    [/\bgaming|\bgame\b/, 2],
    [/\bmarketplace\b/, 1],
  ],
};

/** Fallback split when the profile yields no signal — generic software company. */
const DEFAULT_WEIGHTS: Record<SegKey, number> = {
  enterprise: 6,
  government: 1,
  services: 2,
  consumer: 3,
};

const ORDER: SegKey[] = ["enterprise", "government", "services", "consumer"];

/**
 * Largest-remainder rounding so the integer percentages sum to exactly 100,
 * even after rounding, preserving the relative ordering of the raw weights.
 */
function toPercentages(weights: Record<SegKey, number>): Record<SegKey, number> {
  const total = ORDER.reduce((s, k) => s + weights[k], 0) || 1;
  const raw = ORDER.map((k) => ({ k, exact: (weights[k] / total) * 100 }));
  const floored = raw.map((r) => ({ ...r, floor: Math.floor(r.exact) }));
  let remainder = 100 - floored.reduce((s, r) => s + r.floor, 0);
  // Hand out the leftover points to the largest fractional parts first.
  const byFrac = [...floored].sort(
    (a, b) => b.exact - b.floor - (a.exact - a.floor),
  );
  const out = {} as Record<SegKey, number>;
  for (const r of floored) out[r.k] = r.floor;
  for (const r of byFrac) {
    if (remainder <= 0) break;
    out[r.k] += 1;
    remainder -= 1;
  }
  return out;
}

/**
 * Estimate a company's revenue distribution across four business-model
 * segments from its profile (sector, description, name). Deterministic and
 * pure — the same profile always yields the same mix, summing to 100%.
 */
export function businessModelMix(
  company: Pick<Company, "name" | "sector" | "description">,
): RevenueSegment[] {
  const haystack = [company.sector, company.description, company.name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const weights = {} as Record<SegKey, number>;
  let matched = 0;
  for (const key of ORDER) {
    let score = 0;
    for (const [re, w] of SIGNALS[key]) if (re.test(haystack)) score += w;
    weights[key] = score;
    matched += score;
  }

  // No signal at all → generic fallback so the breakdown is never empty.
  const base = matched === 0 ? DEFAULT_WEIGHTS : weights;
  // Floor every segment slightly so each is represented, then normalize.
  const smoothed = {} as Record<SegKey, number>;
  for (const key of ORDER) smoothed[key] = base[key] + 0.5;

  const pcts = toPercentages(smoothed);
  return ORDER.map((key) => ({ key, label: LABELS[key], pct: pcts[key] }));
}
