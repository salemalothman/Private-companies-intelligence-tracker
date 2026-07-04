import { describe, expect, it } from "vitest";
import { planRoundHygiene } from "@/lib/enrichment/round-hygiene";
import type { FundingRoundRow, ValuationRow } from "@/lib/types";

const round = (p: Partial<FundingRoundRow>): FundingRoundRow => ({
  id: p.id ?? "r1",
  company_id: p.company_id ?? "co",
  round: p.round ?? "Undisclosed",
  date: p.date ?? null,
  amount_raised: p.amount_raised ?? null,
  valuation: p.valuation ?? null,
  investors: p.investors ?? null,
  lead_investor: p.lead_investor ?? null,
  share_price: p.share_price ?? null,
  source: p.source ?? "x",
  created_at: p.created_at ?? "2026-01-01T00:00:00Z",
});

const val = (p: Partial<ValuationRow>): ValuationRow =>
  ({
    id: p.id ?? "v1",
    company_id: p.company_id ?? "co",
    date: p.date ?? "2026-01-01",
    round: p.round ?? null,
    pre_money: p.pre_money ?? null,
    post_money: p.post_money ?? null,
    share_price: p.share_price ?? null,
    source: p.source ?? "x",
    confidence: p.confidence ?? "low",
    created_at: p.created_at ?? "2026-01-01T00:00:00Z",
  }) as ValuationRow;

describe("planRoundHygiene", () => {
  // The live duplicate: an unnamed amount-only exa event next to the named
  // round of the same raise must be deleted, with its source folded in.
  it("plans delete for the absorbed duplicate and a source-merge patch for the survivor", () => {
    const seriesH = round({
      id: "h",
      round: "Series H",
      date: "2026-05-28",
      amount_raised: 65e9,
      valuation: 965e9,
      source: "grok:x:social",
    });
    const exaDup = round({
      id: "e",
      round: "Funding (Exa)",
      date: "2026-05-29",
      amount_raised: 65e9,
      source: "exa",
    });
    const plan = planRoundHygiene([seriesH, exaDup], [
      val({ post_money: 965e9, date: "2026-05-28" }),
    ]);
    expect(plan.deleteIds).toEqual(["e"]);
    expect(plan.updates).toHaveLength(1);
    expect(plan.updates[0].id).toBe("h");
    expect(plan.updates[0].patch.source).toContain("exa");
    expect(plan.inserts).toHaveLength(0); // timeline already covers $965B
  });

  it("backfills a valuation row when a round's recorded post-money is missing from the timeline", () => {
    const plan = planRoundHygiene(
      [
        round({
          id: "h",
          round: "Series H",
          date: "2026-05-28",
          valuation: 965e9,
          source: "grok:x:social, exa",
        }),
      ],
      [val({ post_money: 380e9, date: "2026-02-12" })],
    );
    expect(plan.inserts).toEqual([
      {
        company_id: "co",
        date: "2026-05-28",
        round: "Series H",
        post_money: 965e9,
        source: "grok:x:social, exa",
        confidence: "medium",
      },
    ]);
    expect(plan.deleteIds).toHaveLength(0);
    expect(plan.updates).toHaveLength(0);
  });

  it("is idempotent: a clean company plans no work", () => {
    const plan = planRoundHygiene(
      [round({ id: "h", round: "Series H", date: "2026-05-28", valuation: 965e9 })],
      [val({ post_money: 965e9, date: "2026-05-28" })],
    );
    expect(plan.updates).toHaveLength(0);
    expect(plan.deleteIds).toHaveLength(0);
    expect(plan.inserts).toHaveLength(0);
  });

  it("never backfills for rounds without a recorded post-money (null-honest)", () => {
    const plan = planRoundHygiene(
      [round({ id: "g", date: "2026-02-12", amount_raised: 30e9 })],
      [],
    );
    expect(plan.inserts).toHaveLength(0);
  });

  // Anti-ping-pong: a restatement the timeline sweep would immediately strip
  // (an untrusted duplicate of a verified figure) must never be planned, or
  // backfill-insert and sweep-strip loop forever.
  it("does not backfill a candidate the write-time guard rejects", () => {
    const plan = planRoundHygiene(
      [
        round({
          id: "c",
          round: "Series C",
          date: "2021-04-29",
          valuation: 1.8e9,
          source: "unverified — primary source pending",
        }),
      ],
      // A verified publisher already records the same figure (outside the
      // ±3-day coverage window, so it becomes a candidate — then the guard
      // rejects it as an unverified duplicate of a verified figure).
      [val({ post_money: 1.8e9, date: "2021-04-20", source: "techcrunch.com" })],
    );
    expect(plan.inserts).toHaveLength(0);
  });
});
