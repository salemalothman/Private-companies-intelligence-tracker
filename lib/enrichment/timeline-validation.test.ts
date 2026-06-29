import { describe, expect, it } from "vitest";
import {
  filterIngestValuations,
  isTrustedSource,
  validateTimeline,
  type TimelineEntry,
} from "@/lib/enrichment/timeline-validation";

describe("isTrustedSource", () => {
  it("trusts real publisher domains + SEC, rejects tools/aggregates/manual", () => {
    for (const s of ["techcrunch.com", "replit.com", "bloomberg.com", "SEC EDGAR (Form D)"])
      expect(isTrustedSource(s)).toBe(true);
    for (const s of ["exa", "grok:x", "Manual entry", "private-market aggregate (unverified)", "unverified — primary source pending", ""])
      expect(isTrustedSource(s)).toBe(false);
  });
});

describe("validateTimeline — Replit's true sequence", () => {
  const REPLIT: TimelineEntry[] = [
    { id: "a", date: "2023-04-25", post_money: 1.16e9, round: "Series B", source: "techcrunch.com" },
    { id: "b", date: "2023-04-25", post_money: 1.16e9, round: "Series B extension", source: "grok:x" },
    { id: "c", date: "2023-12-14", post_money: 9e9, round: null, source: "exa" },
    { id: "d", date: "2025-09-10", post_money: 3e9, round: "Series C", source: "techcrunch.com" },
    { id: "e", date: "2026-03-11", post_money: 9e9, round: "Series D", source: "replit.com" },
    { id: "f", date: "2026-03-14", post_money: 9e9, round: "Series D", source: "techcrunch.com" },
  ];

  it("strips the backdated $9B-in-2023 hallucination and the unverified duplicate", () => {
    const { keep, anomalies } = validateTimeline(REPLIT);
    const stripped = anomalies.filter((a) => a.action === "strip").map((a) => a.entry.id);
    expect(stripped).toContain("c"); // $9B @ 2023-12-14 (exa) — exceeds later $3B verified round
    expect(stripped).toContain("b"); // unverified Series B dup
    expect(keep.map((k) => k.id).sort()).toEqual(["a", "d", "e", "f"]); // verified sequence
  });

  it("the surviving timeline is monotonic and all-verified", () => {
    const { keep } = validateTimeline(REPLIT);
    const sorted = [...keep].sort((x, y) => (x.date! < y.date! ? -1 : 1));
    expect(sorted.map((s) => s.post_money)).toEqual([1.16e9, 3e9, 9e9, 9e9]); // non-decreasing
    expect(sorted.every((s) => isTrustedSource(s.source))).toBe(true);
  });

  it("rejects a backdated unverified valuation at write time, accepts verified ones", () => {
    const existing: TimelineEntry[] = [
      { date: "2025-09-10", post_money: 3e9, source: "techcrunch.com" },
      { date: "2026-03-14", post_money: 9e9, source: "techcrunch.com" },
    ];
    const { accepted, rejected } = filterIngestValuations(existing, [
      { date: "2023-12-14", post_money: 9e9, source: "exa" }, // backdated → reject
      { date: "2025-09-10", post_money: 3e9, source: "grok:x" }, // unverified dup → reject
      { date: "2026-06-01", post_money: 1.0e10, source: "exa" }, // forward, consistent → accept
      { date: "2026-04-01", post_money: 9.5e9, source: "bloomberg.com" }, // verified → accept
    ]);
    expect(rejected.map((r) => r.entry.date).sort()).toEqual(["2023-12-14", "2025-09-10"]);
    expect(accepted.map((a) => a.date).sort()).toEqual(["2026-04-01", "2026-06-01"]);
  });

  it("keeps a lone unverified entry (only source) but flags it", () => {
    const { keep, anomalies } = validateTimeline([
      { id: "x", date: "2024-01-01", post_money: 2e9, round: "Series B", source: "grok:x" },
    ]);
    expect(keep.map((k) => k.id)).toEqual(["x"]);
    expect(anomalies.find((a) => a.entry.id === "x")?.action).toBe("flag");
  });
});
