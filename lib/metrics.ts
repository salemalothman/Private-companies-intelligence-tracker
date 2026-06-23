/**
 * Portfolio metrics — pure functions over company + related records.
 *
 * These power the dashboard cards, table, and charts. They are intentionally
 * dependency-free and deterministic so they can be unit-tested in isolation.
 *
 * Private companies have no market price, so "current value" is estimated as
 *   ownership % × latest post-money valuation
 * falling back to invested cost basis when no valuation has been recorded.
 */

import type {
  Company,
  CompanyWithRelations,
  FundingRound,
  Valuation,
} from "@/lib/types";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function byDateDesc<T extends { date: string | null }>(rows: T[]): T[] {
  return [...rows]
    .filter((r) => r.date)
    .sort((a, b) => new Date(b.date!).getTime() - new Date(a.date!).getTime());
}

/** The headline figure for a valuation row (post-money preferred). */
export function valuationAmount(v: Valuation | null | undefined): number | null {
  if (!v) return null;
  return v.post_money ?? v.pre_money ?? null;
}

/** Most recent valuation by date. */
export function latestValuation(
  valuations: Valuation[],
): Valuation | null {
  return byDateDesc(valuations)[0] ?? null;
}

/** Second-most-recent valuation by date (the prior round). */
export function previousValuation(
  valuations: Valuation[],
): Valuation | null {
  return byDateDesc(valuations)[1] ?? null;
}

/** Total capital the investor has deployed into a company. */
export function companyInvested(company: CompanyWithRelations): number {
  return company.investments.reduce((sum, inv) => sum + (inv.amount ?? 0), 0);
}

/**
 * Best estimate of current ownership: the ownership % from the most recent
 * investment (later rounds reflect post-dilution stakes). Null if unknown.
 */
export function currentOwnershipPct(
  company: CompanyWithRelations,
): number | null {
  const sorted = [...company.investments]
    .filter((i) => i.ownership_pct != null)
    .sort(
      (a, b) =>
        new Date(b.investment_date).getTime() -
        new Date(a.investment_date).getTime(),
    );
  return sorted[0]?.ownership_pct ?? null;
}

/**
 * Estimated current value of the investor's stake:
 *   ownership % × latest valuation.
 * Returns null when neither ownership nor valuation is known.
 */
export function currentValue(company: CompanyWithRelations): number | null {
  const ownership = currentOwnershipPct(company);
  const valuation = valuationAmount(latestValuation(company.valuations));
  if (ownership == null || valuation == null) return null;
  return (ownership / 100) * valuation;
}

/** Current value, falling back to cost basis when it can't be estimated. */
export function currentValueOrCost(company: CompanyWithRelations): number {
  return currentValue(company) ?? companyInvested(company);
}

/** Round-over-round change in company valuation, as a fraction. */
export function companyChangePct(
  company: CompanyWithRelations,
): number | null {
  const latest = valuationAmount(latestValuation(company.valuations));
  const previous = valuationAmount(previousValuation(company.valuations));
  if (latest == null || previous == null || previous === 0) return null;
  return (latest - previous) / previous;
}

/** Most recent funding round label (e.g. "Series B"). */
export function lastFundingRound(
  company: CompanyWithRelations,
): FundingRound | null {
  return byDateDesc(company.funding_rounds)[0] ?? null;
}

/** Date of the latest update across valuations, rounds, and news. */
export function lastUpdate(company: CompanyWithRelations): string | null {
  const dates = [
    ...company.valuations.map((v) => v.date),
    ...company.funding_rounds.map((r) => r.date),
    ...company.news.map((n) => n.date),
  ].filter((d): d is string => Boolean(d));
  if (dates.length === 0) return null;
  return dates.sort(
    (a, b) => new Date(b).getTime() - new Date(a).getTime(),
  )[0];
}

/**
 * Rule-based risk score placeholder (0–100, higher = riskier).
 * Replaced by the AI Risk Agent in phase P6. Uses the stored risk_score
 * when present, otherwise derives a heuristic from valuation trajectory and
 * staleness.
 */
export function riskScore(
  company: CompanyWithRelations,
  now: Date = new Date(),
): number | null {
  if (company.risk_score != null) return company.risk_score;

  const change = companyChangePct(company);
  const updated = lastUpdate(company);
  if (change == null && !updated) return null;

  let score = 50;
  if (change != null) {
    if (change < 0) score += 30; // down round
    else if (change > 0.5) score -= 20; // strong markup
    else if (change > 0) score -= 5;
  }
  if (updated) {
    const ageDays =
      (now.getTime() - new Date(updated).getTime()) / MS_PER_DAY;
    if (ageDays > 365) score += 15; // stale
    else if (ageDays > 180) score += 5;
  } else {
    score += 10;
  }
  return Math.max(0, Math.min(100, Math.round(score)));
}

// ---------------------------------------------------------------------------
// Portfolio-level aggregates
// ---------------------------------------------------------------------------

export interface PortfolioSummary {
  totalInvested: number;
  portfolioValue: number;
  unrealizedGain: number;
  totalReturnPct: number | null;
  companyCount: number;
  activeCount: number;
}

export function portfolioSummary(
  companies: CompanyWithRelations[],
): PortfolioSummary {
  const totalInvested = companies.reduce(
    (s, c) => s + companyInvested(c),
    0,
  );
  const portfolioValue = companies.reduce(
    (s, c) => s + currentValueOrCost(c),
    0,
  );
  const unrealizedGain = portfolioValue - totalInvested;
  return {
    totalInvested,
    portfolioValue,
    unrealizedGain,
    totalReturnPct: totalInvested > 0 ? unrealizedGain / totalInvested : null,
    companyCount: companies.length,
    activeCount: companies.filter((c) => c.status === "active").length,
  };
}

export interface SectorSlice {
  sector: string;
  value: number;
}

/** Estimated current value grouped by sector (for the allocation donut). */
export function sectorAllocation(
  companies: CompanyWithRelations[],
): SectorSlice[] {
  const map = new Map<string, number>();
  for (const c of companies) {
    const key = c.sector?.trim() || "Uncategorized";
    map.set(key, (map.get(key) ?? 0) + currentValueOrCost(c));
  }
  return [...map.entries()]
    .map(([sector, value]) => ({ sector, value }))
    .sort((a, b) => b.value - a.value);
}

export interface PerformerRow {
  id: string;
  name: string;
  changePct: number;
}

/** Companies ranked by round-over-round valuation change. */
export function topPerformers(
  companies: CompanyWithRelations[],
  limit = 5,
): PerformerRow[] {
  return companies
    .map((c) => ({ id: c.id, name: c.name, changePct: companyChangePct(c) }))
    .filter((r): r is PerformerRow => r.changePct != null)
    .sort((a, b) => b.changePct - a.changePct)
    .slice(0, limit);
}

export interface RiskPoint {
  id: string;
  name: string;
  risk: number;
  value: number;
}

/** Points for the risk matrix scatter: risk score vs. position size. */
export function riskMatrix(companies: CompanyWithRelations[]): RiskPoint[] {
  return companies
    .map((c) => {
      const risk = riskScore(c);
      return risk == null
        ? null
        : { id: c.id, name: c.name, risk, value: currentValueOrCost(c) };
    })
    .filter((p): p is RiskPoint => p !== null);
}

export interface ValuationChange {
  id: string;
  name: string;
  changePct: number;
  date: string | null;
}

/** Most recent valuation changes across the portfolio, newest first. */
export function latestValuationChanges(
  companies: CompanyWithRelations[],
  limit = 5,
): ValuationChange[] {
  return companies
    .map((c) => {
      const change = companyChangePct(c);
      const latest = latestValuation(c.valuations);
      return change == null
        ? null
        : { id: c.id, name: c.name, changePct: change, date: latest?.date ?? null };
    })
    .filter((v): v is ValuationChange => v !== null)
    .sort((a, b) => {
      const ta = a.date ? new Date(a.date).getTime() : 0;
      const tb = b.date ? new Date(b.date).getTime() : 0;
      return tb - ta;
    })
    .slice(0, limit);
}

export interface PortfolioValuePoint {
  date: string;
  value: number;
}

/**
 * Time series of estimated portfolio value. For each date on which any
 * company recorded a valuation, sum every company's value using its latest
 * valuation as-of that date (× ownership), falling back to cost basis.
 */
export function portfolioValueSeries(
  companies: CompanyWithRelations[],
): PortfolioValuePoint[] {
  const dates = Array.from(
    new Set(
      companies.flatMap((c) =>
        c.valuations.map((v) => v.date).filter(Boolean),
      ),
    ),
  ).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

  return dates.map((date) => {
    const asOf = new Date(date).getTime();
    let value = 0;
    for (const c of companies) {
      const ownership = currentOwnershipPct(c);
      const vAsOf = c.valuations
        .filter((v) => v.date && new Date(v.date).getTime() <= asOf)
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
      const amount = valuationAmount(vAsOf);
      if (ownership != null && amount != null) {
        value += (ownership / 100) * amount;
      } else {
        value += companyInvested(c);
      }
    }
    return { date, value };
  });
}

/** Build a UI row for the portfolio company table. */
export interface CompanyTableRow {
  id: string;
  name: string;
  sector: string | null;
  country: string | null;
  investmentDate: string | null;
  amountInvested: number;
  ownershipPct: number | null;
  lastValuation: number | null;
  previousValuation: number | null;
  changePct: number | null;
  lastFundingRound: string | null;
  lastUpdate: string | null;
  riskScore: number | null;
  status: Company["status"];
}

export function companyTableRow(
  company: CompanyWithRelations,
): CompanyTableRow {
  const firstInvestment = [...company.investments].sort(
    (a, b) =>
      new Date(a.investment_date).getTime() -
      new Date(b.investment_date).getTime(),
  )[0];
  return {
    id: company.id,
    name: company.name,
    sector: company.sector,
    country: company.country,
    investmentDate: firstInvestment?.investment_date ?? null,
    amountInvested: companyInvested(company),
    ownershipPct: currentOwnershipPct(company),
    lastValuation: valuationAmount(latestValuation(company.valuations)),
    previousValuation: valuationAmount(previousValuation(company.valuations)),
    changePct: companyChangePct(company),
    lastFundingRound: lastFundingRound(company)?.round ?? null,
    lastUpdate: lastUpdate(company),
    riskScore: riskScore(company),
    status: company.status,
  };
}
