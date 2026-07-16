import { describe, expect, it } from "vitest";
import { dedupeConnectorRounds } from "@/lib/ingestion/dedupe";
import type { ConnectorFundingRound } from "@/lib/connectors/types";

const r = (p: Partial<ConnectorFundingRound>): ConnectorFundingRound => ({
  round: p.round ?? "Undisclosed",
  date: p.date,
  amountRaised: p.amountRaised,
  valuation: p.valuation,
  investors: p.investors,
  leadInvestor: p.leadInvestor,
  source: p.source ?? "x",
});

describe("dedupeConnectorRounds", () => {
  it("collapses same-valuation rounds within 3 days, keeping the explicit name", () => {
    // The screenshot scenario: one $9B event split across names/dates.
    const out = dedupeConnectorRounds([
      r({ round: "Series D", date: "2026-03-14", valuation: 9e9, source: "grok:x" }),
      r({ round: "Undisclosed", date: "2026-03-11", valuation: 9e9, source: "agdillon" }),
      r({ round: "Series D", date: "2026-03-11", valuation: 9e9, investors: ["a16z"], source: "exa" }),
      r({ round: "Funding (Exa)", date: "2026-03-11", valuation: 9e9, source: "exa" }),
      r({ round: "Series C", date: "2025-09-10", valuation: 3e9, source: "agdillon" }),
    ]);

    expect(out).toHaveLength(2);
    const nine = out.find((x) => x.valuation === 9e9)!;
    expect(nine.round).toBe("Series D"); // explicit name wins
    expect(nine.investors).toEqual(["a16z"]); // metadata merged in
    expect(nine.source).toContain("exa"); // sources combined
    expect(nine.source).toContain("grok:x");
    expect(out.find((x) => x.valuation === 3e9)!.round).toBe("Series C");
  });

  it("does not merge different valuations on the same date", () => {
    const out = dedupeConnectorRounds([
      r({ round: "Series A", date: "2024-01-01", valuation: 100e6 }),
      r({ round: "Series B", date: "2024-01-01", valuation: 300e6 }),
    ]);
    expect(out).toHaveLength(2);
  });

  it("does not merge the same valuation outside the date window", () => {
    const out = dedupeConnectorRounds([
      r({ round: "Series D", date: "2026-03-01", valuation: 9e9 }),
      r({ round: "Undisclosed", date: "2026-03-10", valuation: 9e9 }), // 9 days apart
    ]);
    expect(out).toHaveLength(2);
  });

  it("passes through rows lacking a date or valuation", () => {
    const out = dedupeConnectorRounds([
      r({ round: "Undisclosed", date: undefined, valuation: 9e9 }),
      r({ round: "Series D", date: "2026-03-11", valuation: undefined }),
    ]);
    expect(out).toHaveLength(2);
  });

  // Regression (live duplicate): an unnamed amount-only event must fold into
  // the named round of the same raise even when it carries NO valuation —
  // "Funding (Exa)" May 29 ($65B raised) duplicated "Series H" May 28
  // ($65B raised, $965B post) because matching keyed on valuation alone.
  it("merges an amount-only unnamed event into the named round of the same raise", () => {
    const out = dedupeConnectorRounds([
      r({
        round: "Series H",
        date: "2026-05-28",
        amountRaised: 65e9,
        valuation: 965e9,
        source: "grok:x:social",
      }),
      r({ round: "Funding (Exa)", date: "2026-05-29", amountRaised: 65e9, source: "exa" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].round).toBe("Series H");
    expect(out[0].valuation).toBe(965e9);
    expect(out[0].source).toContain("exa");
    expect(out[0].source).toContain("grok:x:social");
  });

  it("keeps the akta row as primary when it collides with another source", () => {
    // Same valuation + date window → same event; akta wins as primary even
    // though the other row carries the more explicit round name.
    const out = dedupeConnectorRounds([
      r({ round: "Series D", date: "2026-03-11", valuation: 9e9, amountRaised: 1e9, source: "grok:x" }),
      r({ round: "Undisclosed", date: "2026-03-12", valuation: 9e9, amountRaised: 2e9, source: "akta.pro" }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].amountRaised).toBe(2e9); // akta figure retained as primary
    expect(out[0].source).toContain("akta.pro");
  });

  it("does not cross-match a raise amount against an equal valuation", () => {
    // $65B raised vs a $65B post-money are different facts — separate keyspaces.
    const out = dedupeConnectorRounds([
      r({ round: "Series H", date: "2026-05-28", amountRaised: 65e9 }),
      r({ round: "Series B", date: "2026-05-29", valuation: 65e9 }),
    ]);
    expect(out).toHaveLength(2);
  });
});
