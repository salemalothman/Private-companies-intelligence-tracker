import { describe, expect, it } from "vitest";
import {
  COMPANY_TAB_GROUPS,
  LEGACY_TAB_MAP,
  resolveCompanyTab,
} from "@/lib/company-tabs";

describe("resolveCompanyTab", () => {
  // Backward compatibility is a hard product promise: every pre-restructure
  // ?tab= value must keep deep-linking to the same content forever.
  it("maps every legacy tab value to its new group + section", () => {
    expect(resolveCompanyTab("overview", null)).toEqual({
      tab: "overview",
      section: null,
    });
    expect(resolveCompanyTab("investment", null)).toEqual({
      tab: "financials",
      section: "investment",
    });
    expect(resolveCompanyTab("valuation", null)).toEqual({
      tab: "financials",
      section: "valuation",
    });
    expect(resolveCompanyTab("valuation-targets", null)).toEqual({
      tab: "financials",
      section: "targets",
    });
    expect(resolveCompanyTab("funding", null)).toEqual({
      tab: "financials",
      section: "funding",
    });
    expect(resolveCompanyTab("competitors", null)).toEqual({
      tab: "market",
      section: "competitors",
    });
    expect(resolveCompanyTab("news", null)).toEqual({
      tab: "market",
      section: "news",
    });
    expect(resolveCompanyTab("provenance", null)).toEqual({
      tab: "records",
      section: "provenance",
    });
    expect(resolveCompanyTab("dataroom", null)).toEqual({
      tab: "records",
      section: "dataroom",
    });
  });

  it("passes canonical group values through, preserving the raw section", () => {
    expect(resolveCompanyTab("financials", "targets")).toEqual({
      tab: "financials",
      section: "targets",
    });
    expect(resolveCompanyTab("market", null)).toEqual({
      tab: "market",
      section: null,
    });
  });

  it("falls back to overview for unknown or absent values", () => {
    expect(resolveCompanyTab("garbage", "x")).toEqual({
      tab: "overview",
      section: null,
    });
    expect(resolveCompanyTab(null, null)).toEqual({
      tab: "overview",
      section: null,
    });
  });

  it("every legacy target group exists in COMPANY_TAB_GROUPS", () => {
    for (const { tab } of Object.values(LEGACY_TAB_MAP)) {
      expect(COMPANY_TAB_GROUPS).toContain(tab);
    }
  });
});
