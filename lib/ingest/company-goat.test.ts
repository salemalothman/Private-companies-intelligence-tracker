import { describe, expect, it } from "vitest";
import {
  mapFundingResult,
  needsCikRequery,
} from "@/lib/ingest/company-goat";
import type { IngestTarget } from "@/lib/ingest/types";

const target: IngestTarget = {
  companyId: "co-123",
  userId: "user-456",
  subject: "Replit",
  kind: "company",
  domain: "replit.com",
};

/**
 * A single normal Form D round as company-goat funding --agent emits it inside
 * the `results` array. `filings` (or a top-level rounds array) carries the
 * accession-keyed offerings.
 */
const normalRound = {
  accession: "0001234567-24-000123",
  cik: "0001512099",
  offering_amount: 97400000,
  amount_sold: 80000000,
  filing_date: "2024-03-15",
  exemption: "06b",
  related_persons: [{ name: "Amjad Masad", role: "Executive Officer" }],
};

describe("needsCikRequery", () => {
  it("returns candidate CIKs when the result is flagged ambiguous", () => {
    const result = {
      is_ambiguous: true,
      cik_summaries: [
        { cik: "0000111", name: "Replit Inc" },
        { cik: "0000222", name: "Replit SPV LLC" },
      ],
    };
    expect(needsCikRequery(result)).toEqual(["0000111", "0000222"]);
  });

  it("returns [] when the result resolves to a single unambiguous CIK", () => {
    expect(needsCikRequery({ cik: "0001512099" })).toEqual([]);
  });

  it("returns [] (candidates empty) when ambiguous but no cik_summaries — caller must skip", () => {
    expect(needsCikRequery({ is_ambiguous: true })).toEqual([]);
  });
});

describe("mapFundingResult", () => {
  it("maps a normal rounds array to FormDRoundInsert rows with target + source tagging", () => {
    const rows = mapFundingResult({ rounds: [normalRound] }, target);
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.company_id).toBe("co-123");
    expect(r.user_id).toBe("user-456");
    expect(r.subject).toBe("Replit");
    expect(r.accession).toBe("0001234567-24-000123");
    expect(r.cik).toBe("0001512099");
    expect(r.offering_amount).toBe(97400000);
    expect(r.amount_sold).toBe(80000000);
    expect(r.filing_date).toBe("2024-03-15");
    expect(r.exemption).toBe("06b");
    expect(r.related_persons).toEqual([
      { name: "Amjad Masad", role: "Executive Officer" },
    ]);
    expect(r.source).toBe("company-goat");
    expect(typeof r.fetched_at).toBe("string");
    expect(Number.isNaN(Date.parse(r.fetched_at as string))).toBe(false);
  });

  it("accepts rounds under a top-level `filings` key and a bare results array too", () => {
    expect(mapFundingResult({ filings: [normalRound] }, target)).toHaveLength(1);
    expect(mapFundingResult([normalRound], target)).toHaveLength(1);
  });

  it("drops a round with no accession (natural-key anchor — never fabricated)", () => {
    const { accession: _drop, ...noAccession } = normalRound;
    void _drop;
    expect(mapFundingResult({ rounds: [noAccession] }, target)).toEqual([]);
  });

  it("excludes SPV / fund-vehicle filers (not the company's own raise)", () => {
    const spv = {
      ...normalRound,
      accession: "0009999999-24-000999",
      filer_name: "Replit SPV a series of AngelList",
    };
    expect(mapFundingResult({ rounds: [spv] }, target)).toEqual([]);
  });

  it("keeps a non-SPV filer whose name matches the subject", () => {
    const rows = mapFundingResult(
      { rounds: [{ ...normalRound, filer_name: "Replit, Inc." }] },
      target,
    );
    expect(rows).toHaveLength(1);
  });

  it("nulls absent numeric fields — never defaults an amount to zero", () => {
    const bare = {
      accession: "0001111111-24-000111",
      cik: "0001512099",
    };
    const rows = mapFundingResult({ rounds: [bare] }, target);
    expect(rows).toHaveLength(1);
    expect(rows[0].offering_amount).toBeNull();
    expect(rows[0].amount_sold).toBeNull();
    expect(rows[0].filing_date).toBeNull();
    expect(rows[0].exemption).toBeNull();
    // must be explicit null, never 0
    expect(rows[0].offering_amount).not.toBe(0);
    expect(rows[0].amount_sold).not.toBe(0);
  });

  it("coerces a numeric cik to a string and tolerates numeric-string amounts", () => {
    const rows = mapFundingResult(
      {
        rounds: [
          {
            accession: "0002222222-24-000222",
            cik: 1512099,
            offering_amount: "5000000",
          },
        ],
      },
      target,
    );
    expect(rows[0].cik).toBe("1512099");
    expect(rows[0].offering_amount).toBe(5000000);
  });

  it("returns [] when the result is ambiguous (no name-fragment amount is cached)", () => {
    const ambiguous = {
      is_ambiguous: true,
      cik_summaries: [
        { cik: "0000111", name: "Replit Inc" },
        { cik: "0000222", name: "Replit Labs" },
      ],
      rounds: [{ ...normalRound, offering_amount: 12345 }],
    };
    expect(mapFundingResult(ambiguous, target)).toEqual([]);
  });

  it("returns [] for empty / absent / non-object results without throwing", () => {
    expect(mapFundingResult({ rounds: [] }, target)).toEqual([]);
    expect(mapFundingResult({}, target)).toEqual([]);
    expect(mapFundingResult(undefined, target)).toEqual([]);
    expect(mapFundingResult(null, target)).toEqual([]);
    expect(mapFundingResult("garbage", target)).toEqual([]);
    expect(mapFundingResult(42, target)).toEqual([]);
  });

  it("carries source_url through when the round provides one", () => {
    const withUrl = {
      ...normalRound,
      accession: "0003333333-24-000333",
      source_url: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
    };
    const rows = mapFundingResult({ rounds: [withUrl] }, target);
    expect(rows[0].source_url).toBe(
      "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany",
    );
  });
});
