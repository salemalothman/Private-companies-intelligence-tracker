import { describe, expect, it } from "vitest";
import {
  basisLabel,
  basisVariant,
  confidenceLabel,
  confidenceSteps,
} from "@/components/company/confidence-chip";

// The repo's Vitest env is node-only (vitest.config.ts: environment "node",
// include "**/*.test.ts") and cannot render React, so we unit-test the pure
// label/variant/level mapping helpers the component composes from.

describe("basisLabel", () => {
  it("maps fact/estimate literals to Fact/Estimate labels", () => {
    expect(basisLabel("fact")).toBe("Fact");
    expect(basisLabel("estimate")).toBe("Estimate");
  });
});

describe("basisVariant", () => {
  it("gives fact the affirmed success tint and estimate a muted tint", () => {
    expect(basisVariant("fact")).toBe("success");
    expect(basisVariant("estimate")).toBe("muted");
  });
});

describe("confidenceLabel", () => {
  it("maps low/med/high (the LabelledField literals) to their labels", () => {
    expect(confidenceLabel("low")).toBe("Low");
    expect(confidenceLabel("med")).toBe("Med");
    expect(confidenceLabel("high")).toBe("High");
  });
});

describe("confidenceSteps", () => {
  it("produces a distinct filled-step count per confidence level", () => {
    expect(confidenceSteps("low")).toBe(1);
    expect(confidenceSteps("med")).toBe(2);
    expect(confidenceSteps("high")).toBe(3);
    // distinctness guards the visual three-step indicator
    const steps = new Set([
      confidenceSteps("low"),
      confidenceSteps("med"),
      confidenceSteps("high"),
    ]);
    expect(steps.size).toBe(3);
  });
});
