import { describe, expect, it } from "vitest";
import { extractDeal } from "@/lib/connectors/exa-parse";

describe("extractDeal", () => {
  it("anchors valuation to the right money token, not the raise", () => {
    expect(extractDeal("Ramp raises $750M at $44B valuation")).toEqual({
      valuation: 44_000_000_000,
      amountRaised: 750_000_000,
      round: undefined,
    });
  });

  it("reads a valuation-only headline", () => {
    expect(extractDeal("Ramp hits $44 billion valuation")).toMatchObject({
      valuation: 44_000_000_000,
    });
  });

  it("captures round name, raise, and valuation together", () => {
    expect(extractDeal("Acme raises $30M Series A at a $200M valuation")).toEqual({
      valuation: 200_000_000,
      amountRaised: 30_000_000,
      round: "Series A",
    });
  });

  it("handles 'valued at' phrasing", () => {
    expect(extractDeal("Startup now valued at $2.5 billion")).toMatchObject({
      valuation: 2_500_000_000,
    });
  });

  it("returns empty when there is no financial figure", () => {
    expect(extractDeal("Company launches a new product line")).toEqual({
      valuation: undefined,
      amountRaised: undefined,
      round: undefined,
    });
  });
});
