import { describe, expect, it } from "vitest";
import { formatCurrency, formatDate } from "@/lib/utils";

describe("formatCurrency (deterministic, no Intl compact)", () => {
  it("renders compact USD with a stable 2-decimal format", () => {
    expect(formatCurrency(360_000)).toBe("$360.00K");
    expect(formatCurrency(555_000)).toBe("$555.00K");
    expect(formatCurrency(9_000_000_000)).toBe("$9.00B");
    expect(formatCurrency(1_160_000_000)).toBe("$1.16B");
    expect(formatCurrency(1_300_000_000_000)).toBe("$1.30T");
    expect(formatCurrency(545_670)).toBe("$545.67K");
    expect(formatCurrency(5)).toBe("$5.00");
  });

  it("handles negatives and nullish input", () => {
    expect(formatCurrency(-400_000)).toBe("-$400.00K");
    expect(formatCurrency(null)).toBe("—");
    expect(formatCurrency(undefined)).toBe("—");
    expect(formatCurrency(NaN)).toBe("—");
  });

  it("formats standard grouped dollars when compact is false", () => {
    expect(formatCurrency(1_234_567, { compact: false })).toBe("$1,234,567");
    expect(formatCurrency(-2_500, { compact: false })).toBe("-$2,500");
  });
});

describe("formatDate (UTC, locale-stable)", () => {
  it("renders a date-only value identically regardless of timezone", () => {
    expect(formatDate("2026-03-14")).toBe("Mar 14, 2026");
    expect(formatDate(null)).toBe("—");
  });
});
