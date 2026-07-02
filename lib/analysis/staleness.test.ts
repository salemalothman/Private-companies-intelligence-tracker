import { describe, expect, it } from "vitest";
import { isStale } from "@/lib/analysis/staleness";

describe("isStale", () => {
  const generated = "2026-06-01T00:00:00.000Z";

  it("is true when underlying data changed strictly after generated_at", () => {
    expect(isStale(generated, "2026-06-02T00:00:00.000Z")).toBe(true);
  });

  it("is false when the change is before generated_at", () => {
    expect(isStale(generated, "2026-05-01T00:00:00.000Z")).toBe(false);
  });

  it("is false when the change is exactly equal to generated_at", () => {
    expect(isStale(generated, generated)).toBe(false);
  });

  it("is false when generated_at is null or undefined (no analysis yet)", () => {
    expect(isStale(null, "2026-06-02T00:00:00.000Z")).toBe(false);
    expect(isStale(undefined, "2026-06-02T00:00:00.000Z")).toBe(false);
  });

  it("is false when latestDataChange is null or undefined", () => {
    expect(isStale(generated, null)).toBe(false);
    expect(isStale(generated, undefined)).toBe(false);
  });

  it("accepts Date instances on either side", () => {
    expect(isStale(new Date(generated), new Date("2026-06-05T00:00:00.000Z"))).toBe(
      true,
    );
    expect(isStale(new Date("2026-06-05T00:00:00.000Z"), new Date(generated))).toBe(
      false,
    );
  });

  it("returns false on unparseable input", () => {
    expect(isStale("not-a-date", "2026-06-02T00:00:00.000Z")).toBe(false);
    expect(isStale(generated, "also-not-a-date")).toBe(false);
  });
});
