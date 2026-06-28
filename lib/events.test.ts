import { describe, expect, it } from "vitest";
import { buildIngestEvents } from "@/lib/events";

const empty = { rounds: [], valuations: [], news: [], competitors: [] };

describe("buildIngestEvents", () => {
  it("builds a funding-round event with amount + valuation", () => {
    const [e] = buildIngestEvents({
      ...empty,
      rounds: [
        { round: "Series D", date: "2026-03-11", amountRaised: 4e8, valuation: 9e9, source: "exa" },
      ],
    });
    expect(e.type).toBe("funding_round");
    expect(e.title).toBe("New round: Series D");
    expect(e.detail).toBe("$400.00M raised at $9.00B");
    expect(e.occurredAt).toBe("2026-03-11");
  });

  it("builds a valuation event with delta vs the prior mark", () => {
    const [e] = buildIngestEvents({
      ...empty,
      valuations: [{ date: "2026-03-11", post_money: 9e9, round: "Series D", source: "exa" }],
      previousPostMoney: 3e9,
    });
    expect(e.type).toBe("valuation");
    expect(e.detail).toBe("+200.0% vs prior mark");
  });

  it("only emits contract-win events from news (skips generic)", () => {
    const events = buildIngestEvents({
      ...empty,
      news: [
        { title: "Acme awarded $40M federal contract", sentiment: "positive" },
        { title: "Acme launches a new feature" },
      ],
    });
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("contract_win");
  });

  it("builds competitor events", () => {
    const [e] = buildIngestEvents({
      ...empty,
      competitors: [{ name: "Anduril", valuation: 61e9, source: "document" }],
    });
    expect(e.type).toBe("competitor");
    expect(e.title).toBe("New competitor tracked: Anduril");
    expect(e.detail).toBe("$61.00B");
  });

  it("returns nothing for an empty ingest", () => {
    expect(buildIngestEvents(empty)).toEqual([]);
  });

  it("mutes event types not enabled in prefs", () => {
    const events = buildIngestEvents({
      ...empty,
      rounds: [{ round: "Series A", source: "x" }],
      competitors: [{ name: "Rival", source: "x" }],
      prefs: { types: ["funding_round"] },
    });
    expect(events.map((e) => e.type)).toEqual(["funding_round"]);
  });

  it("drops valuation moves below the threshold but keeps larger ones", () => {
    const input = {
      ...empty,
      valuations: [{ date: "2026-03-01", post_money: 1.05e9, round: null, source: "x" }],
      previousPostMoney: 1e9, // +5% move
    };
    expect(buildIngestEvents({ ...input, prefs: { valuationMinPct: 10 } })).toHaveLength(0);
    expect(buildIngestEvents({ ...input, prefs: { valuationMinPct: 4 } })).toHaveLength(1);
  });

  it("keeps an initial valuation (no prior) regardless of threshold", () => {
    const events = buildIngestEvents({
      ...empty,
      valuations: [{ date: "2026-03-01", post_money: 1e9, round: "Seed", source: "x" }],
      prefs: { valuationMinPct: 50 },
    });
    expect(events).toHaveLength(1);
  });
});
