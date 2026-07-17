import { describe, expect, it } from "vitest";
import { formatRemaining } from "@/lib/format-remaining";

describe("formatRemaining", () => {
  it("renders minutes + seconds above a minute", () => {
    expect(formatRemaining(370000)).toBe("~6m 10s left");
  });

  it("renders seconds only under a minute", () => {
    expect(formatRemaining(45000)).toBe("~45s left");
  });

  it("collapses non-positive input to the overrun label", () => {
    expect(formatRemaining(0)).toBe("wrapping up…");
    expect(formatRemaining(-5000)).toBe("wrapping up…");
  });

  it("stays correct at a round minute boundary", () => {
    expect(formatRemaining(3600000)).toBe("~60m 0s left");
  });
});
