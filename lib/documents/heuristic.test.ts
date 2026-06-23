import { describe, expect, it } from "vitest";
import { heuristicExtract } from "@/lib/documents/heuristic";

const opts = { title: "Acme raises Series B", source: "url:example.com" };

describe("heuristicExtract", () => {
  const text =
    "Acme Corp announced on June 1, 2023 that it raised $100 million in a " +
    "Series B round led by Sequoia Capital, valuing the company at $2 billion. " +
    "The new funding will fuel rapid growth and product expansion.";
  const r = heuristicExtract(text, opts);

  it("extracts the funding round with amount, valuation, and lead investor", () => {
    expect(r.fundingRounds).toHaveLength(1);
    const fr = r.fundingRounds[0];
    expect(fr.round).toBe("Series B");
    expect(fr.amountRaised).toBe(100_000_000);
    expect(fr.valuation).toBe(2_000_000_000);
    expect(fr.leadInvestor).toBe("Sequoia Capital");
    expect(fr.date).toBe("2023-06-01");
  });

  it("synthesizes a valuation point when amount + date are present", () => {
    expect(r.valuations).toEqual([
      {
        date: "2023-06-01",
        post_money: 2_000_000_000,
        round: "Series B",
        source: "url:example.com",
      },
    ]);
  });

  it("creates a news item with positive sentiment", () => {
    expect(r.news).toHaveLength(1);
    expect(r.news[0].title).toBe("Acme raises Series B");
    expect(r.news[0].sentiment).toBe("positive");
  });

  it("flags negative sentiment on bad news", () => {
    const bad = heuristicExtract(
      "The company announced layoffs and a down round amid declining revenue.",
      { title: "Acme cuts staff", source: "url:x" },
    );
    expect(bad.news[0].sentiment).toBe("negative");
  });

  it("returns no round/valuation when the text has no financial signals", () => {
    const none = heuristicExtract("A quiet day with no numbers to report.", {
      title: "Update",
      source: "pdf:memo",
    });
    expect(none.fundingRounds).toHaveLength(0);
    expect(none.valuations).toHaveLength(0);
    expect(none.news).toHaveLength(1);
  });
});
