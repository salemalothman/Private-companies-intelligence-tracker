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
});
