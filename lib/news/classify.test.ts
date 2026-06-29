import { describe, expect, it } from "vitest";
import { classifyNews, isContractWin, scoreSentiment } from "@/lib/news/classify";

describe("classifyNews", () => {
  it("flags clear contract wins / business deals", () => {
    const deals = [
      "Acme awarded $40M federal contract",
      "Acme signs multi-year deal with Boeing",
      "Acme partners with Microsoft to power its cloud",
      "Acme selected by the Department of Defense",
      "Acme wins major enterprise customer",
      "Acme lands a multi-year contract with the NHS",
    ];
    for (const t of deals) expect(classifyNews(t)).toBe("contract");
  });

  it("leaves general news uncategorized", () => {
    const general = [
      "I published my first game on Replit",
      "Replit is actually one of the worst stories",
      "Acme raises $100M Series C",
      "Acme launches new AI feature",
    ];
    for (const t of general) expect(classifyNews(t)).toBeNull();
  });

  it("reads the summary as well as the title", () => {
    expect(
      classifyNews("Big news today", "The firm was awarded a government contract"),
    ).toBe("contract");
  });

  it("isContractWin reflects the stored category", () => {
    expect(isContractWin("contract")).toBe(true);
    expect(isContractWin(null)).toBe(false);
    expect(isContractWin("general")).toBe(false);
  });
});

describe("scoreSentiment", () => {
  it("flags positive on raises/growth", () => {
    expect(scoreSentiment("Acme raises $50M Series B")).toBe("positive");
    expect(scoreSentiment("Acme secures major partnership")).toBe("positive");
  });
  it("flags negative on downside news (precedence over positive cues)", () => {
    expect(scoreSentiment("Acme announces layoffs after a down round")).toBe("negative");
    expect(scoreSentiment("Acme faces lawsuit despite recent funding")).toBe("negative");
  });
  it("defaults to neutral", () => {
    expect(scoreSentiment("Acme publishes its quarterly newsletter")).toBe("neutral");
  });
});
