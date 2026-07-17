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
  it("trusts akta.pro as a tier-1 private-market source", () => {
    expect(isTrustedSource("akta.pro")).toBe(true);
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

  it("strips a forward down-round regression and an implausible outlier", () => {
    const { keep, anomalies } = validateTimeline([
      { id: "v", date: "2026-03-14", post_money: 9e9, source: "techcrunch.com" },
      { id: "w", date: "2026-06-29", post_money: 3e9, source: "unverified — primary source pending" },
      { id: "z", date: "2026-06-19", post_money: 4.6e12, source: "exa" }, // $4.6T
    ]);
    const stripped = anomalies.filter((a) => a.action === "strip").map((a) => a.entry.id).sort();
    expect(stripped).toEqual(["w", "z"]);
    expect(keep.map((k) => k.id)).toEqual(["v"]);
  });

  it("rejects forward down-rounds, any-date duplicates, and absurd outliers at write time", () => {
    const existing: TimelineEntry[] = [
      { date: "2026-03-14", post_money: 9e9, source: "techcrunch.com" },
    ];
    const { accepted, rejected } = filterIngestValuations(existing, [
      { date: "2026-06-29", post_money: 3e9, source: "exa" }, // forward low
      { date: "2026-01-01", post_money: 9e9, source: "exa" }, // any-date dup of verified $9B
      { date: "2026-06-19", post_money: 4.6e12, source: "exa" }, // absurd
      { date: "2026-09-01", post_money: 1.2e10, source: "bloomberg.com" }, // trusted growth
    ]);
    expect(rejected).toHaveLength(3);
    expect(accepted.map((a) => a.post_money)).toEqual([1.2e10]);
  });

  it("keeps a lone unverified entry (only source) but flags it", () => {
    const { keep, anomalies } = validateTimeline([
      { id: "x", date: "2024-01-01", post_money: 2e9, round: "Series B", source: "grok:x" },
    ]);
    expect(keep.map((k) => k.id)).toEqual(["x"]);
    expect(anomalies.find((a) => a.entry.id === "x")?.action).toBe("flag");
  });
});

describe("Accrete incident — pdf trust + upward-outlier spike guard", () => {
  it("trusts pdf: and url: document sources by prefix (case-insensitive)", () => {
    expect(isTrustedSource("pdf:Deal_Overview_-_Accrete_.pdf")).toBe(true);
    expect(isTrustedSource("url:https://techcrunch.com/x")).toBe(true);
  });

  it("keeps existing untrusted labels untrusted", () => {
    for (const s of ["exa", "grok:x", "Manual entry", "private-market aggregate (unverified)", "unverified — primary source pending", ""])
      expect(isTrustedSource(s)).toBe(false);
  });

  it("strips an $852B untrusted spike while keeping the pdf-sourced rounds", () => {
    const { keep, anomalies } = validateTimeline([
      { id: "p1", date: "2025-01-01", post_money: 6.25e8, source: "pdf:Deal_Overview_-_Accrete_.pdf" },
      { id: "p2", date: "2025-06-01", post_money: 6.5e8, source: "pdf:Deal_Overview_-_Accrete_.pdf" },
      { id: "spike", date: "2025-12-01", post_money: 8.52e11, source: "exa" }, // $852B — >20x the $650M max
    ]);
    const stripped = anomalies.filter((a) => a.action === "strip").map((a) => a.entry.id);
    expect(stripped).toEqual(["spike"]);
    expect(keep.map((k) => k.id).sort()).toEqual(["p1", "p2"]);
  });

  it("rejects the $852B spike at write time against the established pdf set", () => {
    const existing: TimelineEntry[] = [
      { date: "2025-01-01", post_money: 6.25e8, source: "pdf:Deal_Overview_-_Accrete_.pdf" },
      { date: "2025-06-01", post_money: 6.5e8, source: "pdf:Deal_Overview_-_Accrete_.pdf" },
    ];
    const { accepted, rejected } = filterIngestValuations(existing, [
      { date: "2025-12-01", post_money: 8.52e11, source: "exa" },
    ]);
    expect(accepted).toHaveLength(0);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reasons.join(" ")).toMatch(/spike/i);
  });

  it("keeps a lone untrusted high valuation when there is nothing to compare against", () => {
    const { keep, anomalies } = validateTimeline([
      { id: "lone", date: "2025-12-01", post_money: 8.52e11, source: "exa" },
    ]);
    expect(keep.map((k) => k.id)).toEqual(["lone"]);
    expect(anomalies.find((a) => a.entry.id === "lone")?.action).toBe("flag");
  });

  it("never strips a trusted publisher-domain high valuation by the spike rule", () => {
    const { keep, anomalies } = validateTimeline([
      { id: "tc", date: "2025-01-01", post_money: 6.5e8, source: "techcrunch.com" },
      { id: "bb", date: "2025-06-01", post_money: 2e10, source: "bloomberg.com" }, // $20B — >20x, but trusted
    ]);
    const stripped = anomalies.filter((a) => a.action === "strip").map((a) => a.entry.id);
    expect(stripped).toEqual([]);
    expect(keep.map((k) => k.id).sort()).toEqual(["bb", "tc"]);
  });
});
