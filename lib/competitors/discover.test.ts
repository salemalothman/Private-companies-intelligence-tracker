import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConnectorCompetitor,
  DataConnector,
} from "@/lib/connectors/types";

// The registry is the only external seam: swap in fake connectors per test.
// hoisted so the mock factory can safely close over the mutable holder.
const { registry } = vi.hoisted(() => ({
  registry: { connectors: [] as DataConnector[] },
}));

vi.mock("@/lib/connectors/registry", () => ({
  getConnectors: () => registry.connectors,
  hasLiveConnectors: () => registry.connectors.some((c) => c.id !== "stub"),
}));

import { discoverCompetitors } from "@/lib/competitors/discover";

type Metric = Omit<ConnectorCompetitor, "name"> | null;

interface FakeOpts {
  id: string;
  competitors?: ConnectorCompetitor[] | (() => Promise<ConnectorCompetitor[]>);
  metric?: Metric;
  hasFetchCompetitors?: boolean;
  hasFetchValuationMetric?: boolean;
}

function makeConnector(opts: FakeOpts) {
  const fetchCompetitors = vi.fn(async () => {
    const c = opts.competitors;
    return typeof c === "function" ? c() : (c ?? []);
  });
  const fetchValuationMetric = vi.fn(async () => opts.metric ?? null);
  const conn: Record<string, unknown> = {
    id: opts.id,
    fetchCompanyProfile: async () => null,
    fetchFundingRounds: async () => [],
    fetchNews: async () => [],
  };
  if (opts.hasFetchCompetitors !== false) conn.fetchCompetitors = fetchCompetitors;
  if (opts.hasFetchValuationMetric) conn.fetchValuationMetric = fetchValuationMetric;
  return {
    connector: conn as unknown as DataConnector,
    fetchCompetitors,
    fetchValuationMetric,
  };
}

describe("discoverCompetitors", () => {
  beforeEach(() => {
    registry.connectors = [];
  });

  it("returns empty when no competitor-capable connector is configured", async () => {
    registry.connectors = [
      makeConnector({ id: "sec-edgar", hasFetchCompetitors: false }).connector,
    ];
    const out = await discoverCompetitors("Target Co");
    expect(out).toEqual({ competitors: [], self: null });
  });

  it("merges lists additively; a same-name akta row wins over another source", async () => {
    const grok = makeConnector({
      id: "grok",
      competitors: [
        { name: "Acme", valuation: 1e9, basis: "per @X", source: "grok:x" },
        { name: "Solo", valuation: 2e8, source: "grok:x" },
      ],
    });
    const akta = makeConnector({
      id: "akta",
      competitors: [
        { name: "acme", basis: "akta.pro industry-news mention", source: "akta.pro" },
        { name: "Newcomer", basis: "akta.pro industry-news mention", source: "akta.pro" },
      ],
    });
    registry.connectors = [grok.connector, akta.connector];

    const { competitors } = await discoverCompetitors("Target Co");
    const names = competitors.map((c) => c.name.toLowerCase()).sort();
    expect(names).toEqual(["acme", "newcomer", "solo"]);
    const acme = competitors.find((c) => c.name.toLowerCase() === "acme");
    // akta wins the duplicate name.
    expect(acme?.source).toMatch(/akta/i);
    expect(acme?.basis).toMatch(/akta/i);
  });

  it("queries fetchValuationMetric on ALL implementers; akta estimate wins the self row", async () => {
    const grok = makeConnector({
      id: "grok",
      competitors: [{ name: "Peer", source: "grok:x" }],
      metric: { valuation: 5e9, source: "grok:x" },
      hasFetchValuationMetric: true,
    });
    const akta = makeConnector({
      id: "akta",
      competitors: [{ name: "Peer2", source: "akta.pro" }],
      metric: {
        valuation: 6e9,
        basis: "akta.pro financial estimate",
        source: "akta.pro",
      },
      hasFetchValuationMetric: true,
    });
    registry.connectors = [grok.connector, akta.connector];

    const { self } = await discoverCompetitors("Target Co");
    expect(grok.fetchValuationMetric).toHaveBeenCalledTimes(1);
    expect(akta.fetchValuationMetric).toHaveBeenCalledTimes(1);
    expect(self?.source).toMatch(/akta/i);
    expect(self?.valuation).toBe(6e9);
  });

  it("isolates a throwing source to [] without aborting the merge", async () => {
    const grok = makeConnector({
      id: "grok",
      competitors: async () => {
        throw new Error("boom");
      },
    });
    const akta = makeConnector({
      id: "akta",
      competitors: [
        { name: "Survivor", basis: "akta.pro industry-news mention", source: "akta.pro" },
      ],
    });
    registry.connectors = [grok.connector, akta.connector];

    const { competitors } = await discoverCompetitors("Target Co");
    expect(competitors.map((c) => c.name)).toEqual(["Survivor"]);
  });

  it("retries the empty primary source once but never retries akta", async () => {
    let grokCall = 0;
    const grok = makeConnector({
      id: "grok",
      competitors: async () => {
        grokCall += 1;
        return grokCall === 1 ? [] : [{ name: "Peer", source: "grok:x" }];
      },
    });
    const akta = makeConnector({
      id: "akta",
      competitors: [],
    });
    registry.connectors = [grok.connector, akta.connector];

    const { competitors } = await discoverCompetitors("Target Co");
    expect(grok.fetchCompetitors).toHaveBeenCalledTimes(2); // one retry
    expect(akta.fetchCompetitors).toHaveBeenCalledTimes(1); // no retry
    expect(competitors.map((c) => c.name)).toEqual(["Peer"]);
  });
});
