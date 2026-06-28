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
  status: Company["status"];
}

// ---------------------------------------------------------------------------
// Investment analytics (fund-grade per-deal + fund metrics)
// ---------------------------------------------------------------------------

const MS_PER_YEAR = 365.25 * MS_PER_DAY;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/** Earliest investment date — the entry date into the deal. */
export function entryDate(company: CompanyWithRelations): string | null {
  const dates = company.investments
    .map((i) => i.investment_date)
    .filter(Boolean)
    .sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
  return dates[0] ?? null;
}

/** Years held since entry (can be negative for future-dated entries). */
export function holdingYears(
  company: CompanyWithRelations,
  now: Date = new Date(),
): number | null {
  const entry = entryDate(company);
  if (!entry) return null;
  return (now.getTime() - new Date(entry).getTime()) / MS_PER_YEAR;
}

/** Valuation at entry: latest valuation on/before the entry date, else earliest. */
export function entryValuation(
  company: CompanyWithRelations,
): number | null {
  const vals = company.valuations.filter(
    (v) => v.date && valuationAmount(v) != null,
  );
  if (vals.length === 0) return null;
  const entry = entryDate(company);
  if (entry) {
    const before = vals
      .filter((v) => new Date(v.date).getTime() <= new Date(entry).getTime())
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    if (before.length) return valuationAmount(before[0]);
  }
  const earliest = [...vals].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  )[0];
  return valuationAmount(earliest);
}

/**
 * The user's investment entry point for the valuation chart: the company
 * valuation at the time they invested, dated at the entry date. Prefers the
 * prevailing round valuation (entryValuation); falls back to the valuation
 * implied by their ownership stake (invested / ownership). Null if unknown.
 */
export function investmentEntryPoint(
  company: CompanyWithRelations,
): { date: string; value: number } | null {
  const date = entryDate(company);
  if (!date) return null;
  let value = entryValuation(company);
  if (value == null) {
    const own = currentOwnershipPct(company);
    const invested = companyInvested(company);
    if (own && own > 0 && invested > 0) value = invested / (own / 100);
  }
  return value != null ? { date, value } : null;
}

/** Total shares held across all investments (null if never recorded). */
export function sharesHeld(company: CompanyWithRelations): number | null {
  const withShares = company.investments.filter((i) => i.shares != null);
  if (withShares.length === 0) return null;
  return withShares.reduce((s, i) => s + (i.shares ?? 0), 0);
}

/** Blended entry price per share = invested / shares. */
export function impliedEntryPrice(
  company: CompanyWithRelations,
): number | null {
  const shares = sharesHeld(company);
  const invested = companyInvested(company);
  return shares && shares > 0 ? invested / shares : null;
}

/** Initial ownership as a fraction of the company = invested / entry valuation. */
export function initialOwnershipFraction(
  company: CompanyWithRelations,
): number | null {
  const ev = entryValuation(company);
  const invested = companyInvested(company);
  return ev && ev > 0 ? invested / ev : null;
}

/** Latest implied price per share = entry price × (latest val / entry val). */
export function latestSharePrice(
  company: CompanyWithRelations,
): number | null {
  const implied = impliedEntryPrice(company);
  const ev = entryValuation(company);
  const lv = valuationAmount(latestValuation(company.valuations));
  if (implied != null && ev && ev > 0 && lv != null) {
    return implied * (lv / ev);
  }
  return latestValuation(company.valuations)?.share_price ?? implied;
}

/** Estimated current value of the position. */
export function dealCurrentValue(company: CompanyWithRelations): number {
  const ev = entryValuation(company);
  const lv = valuationAmount(latestValuation(company.valuations));
  const invested = companyInvested(company);
  if (ev && ev > 0 && lv != null) return invested * (lv / ev);
  return currentValueOrCost(company);
}

export function realizedProceeds(company: CompanyWithRelations): number {
  return company.realized_proceeds ?? 0;
}

/** Current value + realized proceeds. */
export function dealTotalValue(company: CompanyWithRelations): number {
  return dealCurrentValue(company) + realizedProceeds(company);
}

/** Multiple on invested capital = total value / invested. */
export function moic(company: CompanyWithRelations): number | null {
  const invested = companyInvested(company);
  return invested > 0 ? dealTotalValue(company) / invested : null;
}

/** Annualized gross IRR from MOIC and holding period, clamped to [-100%, +10000%]. */
export function grossIRR(
  company: CompanyWithRelations,
  now: Date = new Date(),
): number | null {
  const m = moic(company);
  const years = holdingYears(company, now);
  if (m == null || m <= 0 || years == null || years <= 0) return null;
  return clamp(Math.pow(m, 1 / years) - 1, -1, 100);
}

export interface FundFeeAssumptions {
  carryPct: number; // performance fee / carry, e.g. 20
  mgmtFeePct: number; // management fee, e.g. 7 (annual, % of invested)
}

/**
 * Standard market fee terms used as the fallback when a deal has no per-asset
 * override. Fees are configured per company (lib has no global fund-wide setting);
 * this constant is the implicit default for assets left blank.
 */
export const DEFAULT_FUND_FEES: FundFeeAssumptions = {
  carryPct: 20,
  mgmtFeePct: 7,
};

export interface DealFees {
  /** Effective rates after applying the deal override (?? fund default). */
  carryPct: number;
  mgmtFeePct: number;
  isCustomCarry: boolean;
  isCustomMgmt: boolean;
  /** Carry charged on this deal's own profit only (deal-by-deal waterfall). */
  carry: number;
  /** Management fee accrued on this deal's invested capital over its holding. */
  mgmtFee: number;
  netValue: number;
  netMoic: number | null;
}

/**
 * Per-deal fee computation. Carry is charged on each deal's own gain (so losers
 * never offset winners' carry — a deal-by-deal waterfall), and the management fee
 * accrues on the deal's invested capital over its holding period. The effective
 * rates come from the company's own override, falling back to the fund default.
 */
export function dealFees(
  company: CompanyWithRelations,
  defaults: FundFeeAssumptions = DEFAULT_FUND_FEES,
  now: Date = new Date(),
): DealFees {
  const invested = companyInvested(company);
  const totalValue = dealTotalValue(company);
  const gain = totalValue - invested;
  const years = Math.max(holdingYears(company, now) ?? 0, 0);

  const carryPct = company.carry_pct ?? defaults.carryPct;
  const mgmtFeePct = company.mgmt_fee_pct ?? defaults.mgmtFeePct;

  const carry = Math.max(0, gain) * (carryPct / 100);
  const mgmtFee = invested * (mgmtFeePct / 100) * years;
  const netValue = totalValue - carry - mgmtFee;

  return {
    carryPct,
    mgmtFeePct,
    isCustomCarry: company.carry_pct != null,
    isCustomMgmt: company.mgmt_fee_pct != null,
    carry,
    mgmtFee,
    netValue,
    netMoic: invested > 0 ? netValue / invested : null,
  };
}

export interface DealAnalytics {
  id: string;
  name: string;
  sector: string | null;
  status: Company["status"];
  entryDate: string | null;
  holdingYears: number | null;
  entryValuation: number | null;
  invested: number;
  impliedPrice: number | null;
  sharesHeld: number | null;
  latestPrice: number | null;
  currentValue: number;
  realizedProceeds: number;
  totalValue: number;
  gainLoss: number;
  moic: number | null;
  grossIRR: number | null;
  pctOfCost: number | null;
  initialOwnFraction: number | null;
  fees: DealFees;
}

export function dealAnalytics(
  company: CompanyWithRelations,
  fundInvested: number,
  defaults: FundFeeAssumptions = DEFAULT_FUND_FEES,
  now: Date = new Date(),
): DealAnalytics {
  const invested = companyInvested(company);
  const currentValue = dealCurrentValue(company);
  const realized = realizedProceeds(company);
  const totalValue = currentValue + realized;
  return {
    id: company.id,
    name: company.name,
    sector: company.sector,
    status: company.status,
    entryDate: entryDate(company),
    holdingYears: holdingYears(company, now),
    entryValuation: entryValuation(company),
    invested,
    impliedPrice: impliedEntryPrice(company),
    sharesHeld: sharesHeld(company),
    latestPrice: latestSharePrice(company),
    currentValue,
    realizedProceeds: realized,
    totalValue,
    gainLoss: totalValue - invested,
    moic: moic(company),
    grossIRR: grossIRR(company, now),
    pctOfCost: fundInvested > 0 ? invested / fundInvested : null,
    initialOwnFraction: initialOwnershipFraction(company),
    fees: dealFees(company, defaults, now),
  };
}

export interface FundAnalytics {
  totalInvested: number;
  totalCurrentValue: number;
  totalRealized: number;
  totalValue: number;
  gainLoss: number;
  moic: number | null;
  weightedHoldingYears: number;
  grossIRR: number | null;
  // net of fees
  carry: number;
  mgmtFees: number;
  netValue: number;
  netGainLoss: number;
  netMoic: number | null;
}

/**
 * Aggregate fund metrics. `defaults` are the fund-wide fee assumptions, applied
 * to any deal that doesn't carry its own override. Carry and management fees are
 * computed PER DEAL (see {@link dealFees}) and summed — not a flat percentage on
 * the total — so asset-level fee structures produce accurate net-to-LP figures.
 */
export function fundAnalytics(
  companies: CompanyWithRelations[],
  defaults: FundFeeAssumptions = DEFAULT_FUND_FEES,
  now: Date = new Date(),
): FundAnalytics {
  const totalInvested = companies.reduce((s, c) => s + companyInvested(c), 0);
  const totalCurrentValue = companies.reduce(
    (s, c) => s + dealCurrentValue(c),
    0,
  );
  const totalRealized = companies.reduce((s, c) => s + realizedProceeds(c), 0);
  const totalValue = totalCurrentValue + totalRealized;
  const gainLoss = totalValue - totalInvested;
  const fundMoic = totalInvested > 0 ? totalValue / totalInvested : null;

  // Invested-weighted holding period + deal-by-deal fee aggregation.
  let weightedNum = 0;
  let carry = 0;
  let mgmtFees = 0;
  for (const c of companies) {
    const invested = companyInvested(c);
    const yrs = holdingYears(c, now) ?? 0;
    weightedNum += invested * yrs;
    const f = dealFees(c, defaults, now);
    carry += f.carry;
    mgmtFees += f.mgmtFee;
  }
  const weightedHoldingYears =
    totalInvested > 0 ? weightedNum / totalInvested : 0;

  const effYears = Math.max(weightedHoldingYears, 0.01);
  const fundIRR =
    fundMoic != null && fundMoic > 0
      ? clamp(Math.pow(fundMoic, 1 / effYears) - 1, -1, 100)
      : null;

  const netValue = totalValue - carry - mgmtFees;
  const netGainLoss = netValue - totalInvested;

  return {
    totalInvested,
    totalCurrentValue,
    totalRealized,
    totalValue,
    gainLoss,
    moic: fundMoic,
    weightedHoldingYears,
    grossIRR: fundIRR,
    carry,
    mgmtFees,
    netValue,
    netGainLoss,
    netMoic: totalInvested > 0 ? netValue / totalInvested : null,
  };
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
    status: company.status,
  };
}
