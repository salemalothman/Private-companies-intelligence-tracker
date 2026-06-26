import type { CompetitorRow } from "@/lib/types";

/** A single row in the combined competitor ranking. */
export interface RankedEntity {
  name: string;
  valuation: number | null;
  valuationDate: string | null;
  basis: string | null;
  source: string | null;
  secVerified: boolean;
  /** True for the company the page is about (vs. a discovered competitor). */
  isTarget: boolean;
}

export interface TargetEntity {
  name: string;
  valuation: number | null;
  valuationDate: string | null;
}

/**
 * Pure: merge the target company with its discovered competitors into one list
 * sorted by valuation, highest first. Entities with an unknown valuation sort
 * last (preserving a stable, name-ordered tail). The target is always included
 * so the user can see where their company ranks against the field.
 */
export function buildCompetitorRanking(
  target: TargetEntity,
  competitors: CompetitorRow[],
): RankedEntity[] {
  const rows: RankedEntity[] = [
    {
      name: target.name,
      valuation: target.valuation,
      valuationDate: target.valuationDate,
      basis: null,
      source: null,
      secVerified: false,
      isTarget: true,
    },
    ...competitors.map((c) => ({
      name: c.name,
      valuation: c.valuation,
      valuationDate: c.valuation_date,
      basis: c.basis,
      source: c.source,
      secVerified: c.sec_verified,
      isTarget: false,
    })),
  ];

  return rows.sort((a, b) => {
    if (a.valuation == null && b.valuation == null)
      return a.name.localeCompare(b.name);
    if (a.valuation == null) return 1;
    if (b.valuation == null) return -1;
    return b.valuation - a.valuation;
  });
}
