import { describe, expect, it } from "vitest";
import { diffDocuments } from "@/lib/documents/diff";
import type { ExtractedEntities } from "@/lib/documents/heuristic";

const E = (p: Partial<ExtractedEntities>): ExtractedEntities => ({
  fundingRounds: [],
  valuations: [],
  news: [],
  competitors: [],
  ...p,
});

describe("diffDocuments", () => {
  it("detects a valuation move with direction and delta", () => {
    const prev = E({ valuations: [{ date: "2026-01-01", post_money: 2e9, round: "B", source: "pdf" }] });
    const next = E({ valuations: [{ date: "2026-06-01", post_money: 3e9, round: "C", source: "pdf" }] });
    const { changes } = diffDocuments(prev, next);
    const v = changes.find((c) => c.kind === "valuation");
    expect(v?.direction).toBe("up");
    expect(v?.detail).toContain("+50.0%");
  });

  it("flags newly-disclosed rounds and competitor set changes", () => {
    const prev = E({
      fundingRounds: [{ round: "Series A", source: "pdf" }],
      competitors: [{ name: "Acme" }],
    });
    const next = E({
      fundingRounds: [
        { round: "Series A", source: "pdf" },
        { round: "Series B", amountRaised: 5e8, source: "pdf" },
      ],
      competitors: [{ name: "Globex" }],
    });
    const { changes } = diffDocuments(prev, next);
    expect(changes.some((c) => c.kind === "round" && c.direction === "new")).toBe(true);
    expect(changes.some((c) => c.direction === "new" && /Globex/.test(c.label))).toBe(true);
    expect(changes.some((c) => c.direction === "removed" && /Acme/.test(c.label))).toBe(true);
  });

  it("returns no changes for identical documents", () => {
    const e = E({ valuations: [{ date: "2026-01-01", post_money: 2e9, round: "B", source: "pdf" }] });
    expect(diffDocuments(e, e).changes).toHaveLength(0);
  });
});
