import { describe, expect, it } from "vitest";
import {
  isGenericMultiCompanyReport,
  screenCompanyEvent,
  wrongEntitySignal,
} from "@/lib/enrichment/disambiguation";

describe("wrongEntitySignal — Accrete AI vs Accrete Inc (TYO:4395)", () => {
  it("blocks the Japanese public ticker collision", () => {
    expect(wrongEntitySignal("Accrete Ai", "Accrete Inc. (4395.T) closing price on Tokyo Stock Exchange").blocked).toBe(true);
    expect(wrongEntitySignal("Accrete Ai", "TYO: 4395 stock quote up 3%").blocked).toBe(true);
    expect(wrongEntitySignal("Accrete Ai", "アクリート shares").blocked).toBe(true);
  });
  it("blocks Yahoo Finance stock alerts on the private company", () => {
    const r = wrongEntitySignal("Accrete Ai", "Yahoo Finance: 4395.T share price alert");
    expect(r.blocked).toBe(true);
  });
  it("allows genuine private-company AI signals", () => {
    expect(wrongEntitySignal("Accrete Ai", "Accrete AI wins DoD STRATFI award for autonomous agents").blocked).toBe(false);
    expect(wrongEntitySignal("Accrete Ai", "Accrete raises Series C for enterprise AI knowledge engines").blocked).toBe(false);
  });
  it("does not over-block companies without a collision rule", () => {
    expect(wrongEntitySignal("Replit", "Replit launches a new agent feature").blocked).toBe(false);
  });
  it("flags generic public-equity noise on any private company", () => {
    expect(wrongEntitySignal("moove io", "Moove stock price ticker on NASDAQ trading at $40 per share on the nasdaq").blocked).toBe(true);
  });
});

describe("wrongEntitySignal — purge scope must not delete legitimate rows", () => {
  it("does NOT purge an item with a third-party (peer) ticker mention", () => {
    // NYSE:CRM belongs to Salesforce, not the tracked company — an incidental
    // peer ticker must never trigger the destructive DELETE path.
    expect(
      wrongEntitySignal("Acme", "Acme acquired by Salesforce (NYSE:CRM)", {
        scope: "purge",
      }).blocked,
    ).toBe(false);
    // …and it is not even blocked at ingest (name-adjacency, not mere mention).
    expect(
      wrongEntitySignal("Acme", "Acme acquired by Salesforce (NYSE:CRM)").blocked,
    ).toBe(false);
  });

  it("does NOT purge a finance.yahoo.com funding item", () => {
    expect(
      wrongEntitySignal(
        "Moove Io",
        "Moove raises $100M Series B — https://finance.yahoo.com/news/moove-funding",
        { scope: "purge" },
      ).blocked,
    ).toBe(false);
  });

  it("STILL drops the TSE:4395 wrong-entity collision at ingest", () => {
    expect(
      wrongEntitySignal(
        "Accrete Ai",
        "Accrete Inc. TSE:4395 closing price on Tokyo Stock Exchange",
      ).blocked,
    ).toBe(true);
    // …and the purge path also still removes it (collision rule + STOCK_SIGNAL).
    expect(
      wrongEntitySignal(
        "Accrete Ai",
        "Accrete Inc. TSE:4395 closing price on Tokyo Stock Exchange",
        { scope: "purge" },
      ).blocked,
    ).toBe(true);
  });

  it("still drops a name-adjacent public ticker + finance aggregator at ingest", () => {
    expect(
      wrongEntitySignal("Moove Io", "Moove Corp (NYSE:MOOV) share price update")
        .blocked,
    ).toBe(true);
    expect(
      wrongEntitySignal(
        "Moove Io",
        "Moove quote — https://www.tradingview.com/symbols/NYSE-MOOV/",
      ).blocked,
    ).toBe(true);
  });
});

describe("isGenericMultiCompanyReport", () => {
  it("is true for a sector report that omits the tracked company name", () => {
    expect(
      isGenericMultiCompanyReport("Accrete Ai", "AI Valuations: Q2 2026"),
    ).toBe(true);
    expect(
      isGenericMultiCompanyReport("Accrete Ai", "The state of the AI market map"),
    ).toBe(true);
    expect(
      isGenericMultiCompanyReport("Accrete Ai", "Top 50 AI startups ranking"),
    ).toBe(true);
  });
  it("is false when the title references the tracked company", () => {
    expect(
      isGenericMultiCompanyReport("Accrete Ai", "Accrete AI valuation reaches $500M"),
    ).toBe(false);
  });
  it("is false for a plain company-specific headline", () => {
    expect(
      isGenericMultiCompanyReport("Accrete Ai", "Accrete AI wins DoD contract"),
    ).toBe(false);
  });
});

describe("screenCompanyEvent", () => {
  const accrete = { name: "Accrete Ai", country: "United States", founded_year: 2017 };

  it("drops the live Accrete Inc. (TSE:4395) TradingView earnings event", () => {
    const r = screenCompanyEvent(accrete, {
      type: "corporate",
      title: "Accrete, Inc. (TSE:4395) Q3 earnings date",
      detail: "Earnings scheduled for the Tokyo-listed entity",
      url: "https://www.tradingview.com/symbols/TSE-4395/",
      value: null,
    });
    expect(r.drop).toBe(true);
    expect(r.value).toBeNull();
    expect(r.reason).toBeTruthy();
  });

  it("drops the live windsordrake 'AI Valuations: Q2 2026' report with a $852B value", () => {
    const r = screenCompanyEvent(accrete, {
      type: "valuation",
      title: "AI Valuations: Q2 2026",
      detail: "Sector-wide multiples across the AI landscape",
      url: "https://windsordrake.com/ai-valuations-q2-2026",
      value: 852_000_000_000,
    });
    expect(r.drop).toBe(true);
    expect(r.value).toBeNull();
  });

  it("drops a foreign exchange-symbol title for a private company (no collision rule)", () => {
    const r = screenCompanyEvent(
      { name: "Moove Io", country: "United Kingdom", founded_year: 2020 },
      {
        type: "secondary",
        title: "Moove Corp (NYSE:MOOV) share price update",
        detail: null,
        url: "https://finance.yahoo.com/quote/MOOV",
        value: 42,
      },
    );
    expect(r.drop).toBe(true);
    expect(r.value).toBeNull();
  });

  it("drops a foreign exchange origin that contradicts the stored country", () => {
    const r = screenCompanyEvent(
      { name: "Ramp", country: "United States", founded_year: 2019 },
      {
        type: "corporate",
        title: "Ramp Holdings (TYO:7150) files annual report in Japan",
        detail: null,
        url: null,
        value: null,
      },
    );
    expect(r.drop).toBe(true);
  });

  it("passes a legitimate company-specific event with its value intact", () => {
    const r = screenCompanyEvent(accrete, {
      type: "valuation",
      title: "Accrete AI valuation rises to $500M in Series C",
      detail: "Priced round led by enterprise investors",
      url: "https://techcrunch.com/accrete-ai-series-c",
      value: 500_000_000,
    });
    expect(r.drop).toBe(false);
    expect(r.value).toBe(500_000_000);
  });

  it("still screens ticker signals when profile facts are absent", () => {
    const r = screenCompanyEvent(
      { name: "Accrete Ai" },
      {
        type: "secondary",
        title: "Accrete Inc. 4395.T closing price on Tokyo Stock Exchange",
        detail: null,
        url: null,
        value: 10,
      },
    );
    expect(r.drop).toBe(true);
  });
});
