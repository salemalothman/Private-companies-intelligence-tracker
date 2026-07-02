import { describe, expect, it } from "vitest";
import { mapCrossSection, mapStatementResult } from "@/lib/ingest/sec-edgar";

const ctx = { cik: "0000320193", ticker: "AAPL", entityName: "Apple Inc." };

/**
 * A `facts statement --kind income --agent` result as the CLI emits it inside the
 * `results` payload: a `periods` array where each period carries a fiscal-period
 * label and the us-gaap income tags present for that period.
 */
const statementResult = {
  cik: "0000320193",
  entity_name: "Apple Inc.",
  currency: "USD",
  periods: [
    {
      fiscal_period: "FY2024",
      "us-gaap:Revenues": 391035000000,
      "us-gaap:NetIncomeLoss": 93736000000,
      "us-gaap:GrossProfit": 180683000000,
      "us-gaap:OperatingIncomeLoss": 123216000000,
    },
    {
      fiscal_period: "FY2023",
      "us-gaap:Revenues": 383285000000,
      "us-gaap:NetIncomeLoss": 96995000000,
      "us-gaap:GrossProfit": 169148000000,
      "us-gaap:OperatingIncomeLoss": 114301000000,
    },
  ],
};

describe("mapStatementResult", () => {
  it("maps every period to a PeerFinancialInsert row keyed by (cik, fiscal_period)", () => {
    const rows = mapStatementResult(statementResult, ctx);
    expect(rows).toHaveLength(2);
    const fy24 = rows.find((r) => r.fiscal_period === "FY2024")!;
    expect(fy24.cik).toBe("0000320193");
    expect(fy24.ticker).toBe("AAPL");
    expect(fy24.entity_name).toBe("Apple Inc.");
    expect(fy24.revenue).toBe(391035000000);
    expect(fy24.net_income).toBe(93736000000);
    expect(fy24.gross_profit).toBe(180683000000);
    expect(fy24.operating_income).toBe(123216000000);
    expect(fy24.currency).toBe("USD");
    expect(fy24.source).toBe("sec-edgar");
    expect(typeof fy24.fetched_at).toBe("string");
    expect(Number.isNaN(Date.parse(fy24.fetched_at as string))).toBe(false);
  });

  it("nulls a numeric field when its us-gaap tag is absent for that period (never 0, never carried)", () => {
    const partial = {
      cik: "0000320193",
      periods: [
        {
          fiscal_period: "FY2022",
          "us-gaap:Revenues": 394328000000,
          // NetIncomeLoss / GrossProfit / OperatingIncomeLoss absent this period
        },
      ],
    };
    const rows = mapStatementResult(partial, ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0].revenue).toBe(394328000000);
    expect(rows[0].net_income).toBeNull();
    expect(rows[0].gross_profit).toBeNull();
    expect(rows[0].operating_income).toBeNull();
    // must be explicit null, never 0
    expect(rows[0].net_income).not.toBe(0);
    expect(rows[0].gross_profit).not.toBe(0);
    expect(rows[0].operating_income).not.toBe(0);
  });

  it("prefers the canonical us-gaap:Revenues tag, falling back to RevenueFromContract… when Revenues is absent", () => {
    const withFallback = {
      cik: "0000320193",
      periods: [
        {
          fiscal_period: "FY2021",
          "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax": 365817000000,
        },
      ],
    };
    expect(mapStatementResult(withFallback, ctx)[0].revenue).toBe(365817000000);

    const bothPresent = {
      cik: "0000320193",
      periods: [
        {
          fiscal_period: "FY2020",
          "us-gaap:Revenues": 274515000000,
          "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax": 999,
        },
      ],
    };
    // canonical Revenues wins — the contract-revenue tag is never summed in
    expect(mapStatementResult(bothPresent, ctx)[0].revenue).toBe(274515000000);
  });

  it("drops a period with no fiscal_period label (natural-key anchor — never fabricated)", () => {
    const labelless = {
      cik: "0000320193",
      periods: [
        { "us-gaap:Revenues": 123 }, // no fiscal_period
        { fiscal_period: "FY2019", "us-gaap:Revenues": 260174000000 },
      ],
    };
    const rows = mapStatementResult(labelless, ctx);
    expect(rows).toHaveLength(1);
    expect(rows[0].fiscal_period).toBe("FY2019");
  });

  it("coerces numeric-string amounts and a numeric cik to a string", () => {
    const stringy = {
      cik: 320193,
      periods: [{ fiscal_period: "FY2018", "us-gaap:Revenues": "265595000000" }],
    };
    const rows = mapStatementResult(stringy, ctx);
    expect(rows[0].cik).toBe("0000320193"); // ctx cik takes precedence
    expect(rows[0].revenue).toBe(265595000000);
  });

  it("returns [] for empty / absent / non-object results without throwing", () => {
    expect(mapStatementResult({ periods: [] }, ctx)).toEqual([]);
    expect(mapStatementResult({}, ctx)).toEqual([]);
    expect(mapStatementResult(undefined, ctx)).toEqual([]);
    expect(mapStatementResult(null, ctx)).toEqual([]);
    expect(mapStatementResult("garbage", ctx)).toEqual([]);
    expect(mapStatementResult(42, ctx)).toEqual([]);
  });
});

/**
 * A `cross-section --tag us-gaap:Revenues --ticker A,B --periods last8 --agent`
 * result: a pivot of per-entity revenue across periods. Each row identifies the
 * peer (cik/ticker/name) and carries a `values` map of fiscal_period → revenue.
 */
const crossSection = {
  tag: "us-gaap:Revenues",
  rows: [
    {
      cik: "0000320193",
      ticker: "AAPL",
      entity_name: "Apple Inc.",
      values: { FY2024: 391035000000, FY2023: 383285000000 },
    },
    {
      cik: "0000789019",
      ticker: "MSFT",
      entity_name: "Microsoft Corporation",
      values: { FY2024: 245122000000, FY2023: null },
    },
  ],
};

describe("mapCrossSection", () => {
  it("pivots each peer×period into a PeerFinancialInsert row keyed by (cik, fiscal_period)", () => {
    const rows = mapCrossSection(crossSection);
    // AAPL: 2 periods, MSFT: 1 real period (the null one is dropped, not zeroed)
    expect(rows).toHaveLength(3);
    const aaplFy24 = rows.find(
      (r) => r.cik === "0000320193" && r.fiscal_period === "FY2024",
    )!;
    expect(aaplFy24.ticker).toBe("AAPL");
    expect(aaplFy24.entity_name).toBe("Apple Inc.");
    expect(aaplFy24.revenue).toBe(391035000000);
    expect(aaplFy24.source).toBe("sec-edgar");
    expect(typeof aaplFy24.fetched_at).toBe("string");
  });

  it("drops a period whose revenue is null (never fabricates a zero)", () => {
    const rows = mapCrossSection(crossSection);
    const msftFy23 = rows.find(
      (r) => r.cik === "0000789019" && r.fiscal_period === "FY2023",
    );
    expect(msftFy23).toBeUndefined();
    // and no row carries a 0 revenue
    expect(rows.every((r) => r.revenue !== 0)).toBe(true);
  });

  it("drops a peer with no cik (the natural-key anchor) rather than caching it", () => {
    const noCik = {
      rows: [
        { ticker: "PVT", values: { FY2024: 100 } }, // no cik
        { cik: "0000320193", values: { FY2024: 391035000000 } },
      ],
    };
    const rows = mapCrossSection(noCik);
    expect(rows).toHaveLength(1);
    expect(rows[0].cik).toBe("0000320193");
  });

  it("returns [] for empty / absent / non-object results without throwing", () => {
    expect(mapCrossSection({ rows: [] })).toEqual([]);
    expect(mapCrossSection({})).toEqual([]);
    expect(mapCrossSection(undefined)).toEqual([]);
    expect(mapCrossSection(null)).toEqual([]);
    expect(mapCrossSection("garbage")).toEqual([]);
  });
});
