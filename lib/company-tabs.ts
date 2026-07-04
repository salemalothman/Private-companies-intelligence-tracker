/**
 * Company-page tab groups + legacy deep-link resolution.
 *
 * The detail page groups its former 9 flat tabs into 4 intent groups
 * (Airbnb-style sequencing); every pre-restructure `?tab=` value stays a
 * working deep link FOREVER by resolving to its new group + in-page section.
 * Resolution must run BEFORE UrlTabs' allow-list check, or a legacy value
 * would silently fall back to Overview.
 *
 * Pure module — no React, unit-tested in company-tabs.test.ts.
 */

export const COMPANY_TAB_GROUPS = [
  "overview",
  "financials",
  "market",
  "records",
] as const;

export type CompanyTabGroup = (typeof COMPANY_TAB_GROUPS)[number];

/** Every pre-restructure tab value → its new home. Never remove entries. */
export const LEGACY_TAB_MAP: Record<
  string,
  { tab: CompanyTabGroup; section?: string }
> = {
  overview: { tab: "overview" },
  investment: { tab: "financials", section: "investment" },
  valuation: { tab: "financials", section: "valuation" },
  "valuation-targets": { tab: "financials", section: "targets" },
  funding: { tab: "financials", section: "funding" },
  competitors: { tab: "market", section: "competitors" },
  news: { tab: "market", section: "news" },
  provenance: { tab: "records", section: "provenance" },
  dataroom: { tab: "records", section: "dataroom" },
};

/**
 * Resolve raw `?tab=` / `?section=` params to a canonical group + section.
 * Order: canonical group passes through (with the raw section, if any);
 * legacy value maps to its group+section; anything else falls back to
 * overview with no section.
 */
export function resolveCompanyTab(
  rawTab: string | null,
  rawSection: string | null,
): { tab: CompanyTabGroup; section: string | null } {
  if (rawTab && (COMPANY_TAB_GROUPS as readonly string[]).includes(rawTab)) {
    return { tab: rawTab as CompanyTabGroup, section: rawSection };
  }
  const legacy = rawTab ? LEGACY_TAB_MAP[rawTab] : undefined;
  if (legacy) return { tab: legacy.tab, section: legacy.section ?? null };
  return { tab: "overview", section: null };
}
