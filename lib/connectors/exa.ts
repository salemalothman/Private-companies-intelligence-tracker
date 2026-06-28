import "server-only";
import Exa from "exa-js";
import type {
  ConnectorCompanyProfile,
  ConnectorFundingRound,
  ConnectorNewsItem,
  DataConnector,
} from "@/lib/connectors/types";
import { extractDeal } from "@/lib/connectors/exa-parse";
import {
  classifyEvent,
  parseEventDate,
  parseSharePrice,
} from "@/lib/connectors/exa-events-parse";

const SOURCE = "exa";

export interface ConnectorCompanyEvent {
  type: "corporate" | "valuation" | "secondary";
  title: string;
  detail?: string;
  eventDate?: string;
  value?: number;
  url?: string;
}

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

/**
 * Sweep the web for a company's scheduled corporate events, fresh valuation
 * mentions, and secondary-market share prices. Best-effort structured
 * extraction from search highlights; gated on EXA_API_KEY.
 */
export async function exaCompanyEventsFor(
  query: string,
): Promise<ConnectorCompanyEvent[]> {
  const exa = client();
  if (!exa) return [];
  const queries = [
    `${query} upcoming events 2026 conference earnings product launch IPO date`,
    `${query} secondary market share price tender offer current valuation 2026`,
  ];
  const events: ConnectorCompanyEvent[] = [];
  const seen = new Set<string>();
  try {
    for (const q of queries) {
      const hits = await search(exa, q, 6);
      for (const h of hits) {
        const title = (h.title ?? "").trim();
        if (!title) continue;
        const text = `${title}. ${(h.highlights ?? []).join(" ")}`;
        const type = classifyEvent(text);
        let value: number | undefined;
        let eventDate: string | undefined;
        if (type === "secondary") {
          value = parseSharePrice(text);
          eventDate = isoDate(h.publishedDate);
        } else if (type === "valuation") {
          value = extractDeal(text).valuation ?? undefined;
          eventDate = isoDate(h.publishedDate);
        } else {
          // Corporate: the date is the event date stated in the text, not the
          // article's publish date — that's what makes it "upcoming".
          eventDate = parseEventDate(text) ?? undefined;
        }
        // Drop figure-less valuation/secondary hits — they're just noise.
        if (type !== "corporate" && value == null) continue;
        const key = `${type}|${title.toLowerCase()}`;
        if (seen.has(key)) continue;
        seen.add(key);
        events.push({
          type,
          title,
          detail: h.highlights?.[0]?.trim(),
          eventDate,
          value,
          url: h.url,
        });
      }
    }
    return events.slice(0, 10);
  } catch (e) {
    console.error("exaCompanyEventsFor:", (e as Error).message);
    return events;
  }
}
