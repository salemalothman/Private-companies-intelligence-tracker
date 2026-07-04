"use client";

import { UrlTabs } from "@/components/company/url-tabs";
import { COMPANY_TAB_GROUPS, resolveCompanyTab } from "@/lib/company-tabs";

/**
 * The company page's tab root: UrlTabs configured with the 4 canonical groups
 * and the legacy-alias resolver. This thin client wrapper exists because
 * `resolve` is a FUNCTION — it cannot cross the RSC boundary from the server
 * page as a prop, so the client side owns it (lib/company-tabs is pure and
 * client-importable).
 */
export function CompanyTabs({ children }: { children: React.ReactNode }) {
  return (
    <UrlTabs
      values={COMPANY_TAB_GROUPS}
      defaultValue="overview"
      resolve={(raw) => resolveCompanyTab(raw, null).tab}
    >
      {children}
    </UrlTabs>
  );
}
