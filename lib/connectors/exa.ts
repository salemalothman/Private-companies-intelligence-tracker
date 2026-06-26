import "server-only";
import Exa from "exa-js";
import type {
  ConnectorCompanyProfile,
  ConnectorFundingRound,
  ConnectorNewsItem,
  DataConnector,
} from "@/lib/connectors/types";
import { extractDeal } from "@/lib/connectors/exa-parse";

const SOURCE = "exa";

function client(): Exa | null {
  const key = process.env.EXA_API_KEY;
  return key ? new Exa(key) : null;
}

interface ExaHit {
  title?: string;
  url?: string;
  publishedDate?: string;
  highlights?: string[];
}

async function search(exa: Exa, query: string, numResults: number): Promise<ExaHit[]> {
  const r = await exa.searchAndContents(query, {
    type: "auto",
    numResults,
    highlights: true,
  });
  return (r.results ?? []) as ExaHit[];
}

const isoDate = (d?: string) => (d ? d.slice(0, 10) : undefined);

/**
 * Exa-powered web-search connector. Surfaces the latest news, funding rounds,
 * and valuations for a company from across the web (not just X), feeding the
 * News tab and — via funding rounds with a valuation — the valuation timeline.
 * Gated on EXA_API_KEY; every method degrades to an empty result on error.
 */
export class ExaConnector implements DataConnector {
  readonly id = "exa";

  async fetchCompanyProfile(): Promise<ConnectorCompanyProfile | null> {
    return null; // Exa is a market-intel source, not a profile source.
  }

  async fetchFundingRounds(query: string): Promise<ConnectorFundingRound[]> {
    const exa = client();
    if (!exa) return [];
    try {
      const hits = await search(
        exa,
        `${query} latest funding round valuation raises`,
        6,
      );
      const seen = new Set<string>();
      const rounds: ConnectorFundingRound[] = [];
      for (const h of hits) {
        const text = `${h.title ?? ""}. ${(h.highlights ?? []).join(" ")}`;
        const deal = extractDeal(text);
        if (deal.valuation == null && deal.amountRaised == null) continue;
        const date = isoDate(h.publishedDate);
        const round = deal.round ?? "Funding (Exa)";
        const key = `${round.toLowerCase()}|${date ?? ""}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rounds.push({
          round,
          date,
          amountRaised: deal.amountRaised,
          valuation: deal.valuation,
          source: SOURCE,
        });
      }
      // Top results are the most relevant; deeper hits add stale/odd figures.
      return rounds.slice(0, 3);
    } catch (e) {
      console.error("ExaConnector.fetchFundingRounds:", (e as Error).message);
      return [];
    }
  }

  async fetchNews(query: string): Promise<ConnectorNewsItem[]> {
    const exa = client();
    if (!exa) return [];
    try {
      const hits = await search(
        exa,
        `${query} latest news funding valuation partnership`,
        6,
      );
      const seen = new Set<string>();
      const news: ConnectorNewsItem[] = [];
      for (const h of hits) {
        const title = (h.title ?? "").trim();
        if (!title || seen.has(title.toLowerCase())) continue;
        seen.add(title.toLowerCase());
        news.push({
          title,
          source: SOURCE,
          url: h.url,
          date: isoDate(h.publishedDate),
          summary: h.highlights?.[0]?.trim(),
        });
      }
      return news.slice(0, 3);
    } catch (e) {
      console.error("ExaConnector.fetchNews:", (e as Error).message);
      return [];
    }
  }
}

/**
 * Latest valuation for a single company via Exa — used by the weekly market
 * sweep to populate the global cache. Returns null when nothing is found.
 */
export async function exaValuationFor(
  query: string,
): Promise<{ valuation?: number; date?: string } | null> {
  const exa = client();
  if (!exa) return null;
  try {
    const hits = await search(exa, `${query} current valuation 2026`, 4);
    for (const h of hits) {
      const deal = extractDeal(`${h.title ?? ""}. ${(h.highlights ?? []).join(" ")}`);
      if (deal.valuation != null) {
        return { valuation: deal.valuation, date: isoDate(h.publishedDate) };
      }
    }
    return null;
  } catch (e) {
    console.error("exaValuationFor:", (e as Error).message);
    return null;
  }
}
