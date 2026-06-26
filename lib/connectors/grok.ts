import "server-only";
import { xai } from "@ai-sdk/xai";
import { generateObject } from "ai";
import { z } from "zod";
import type {
  ConnectorCompanyProfile,
  ConnectorFundingRound,
  ConnectorNewsItem,
  DataConnector,
} from "@/lib/connectors/types";

const SOURCE = "grok:x";

/** Drop nulls so optional interface fields stay `undefined`, not `null`. */
const clean = <T>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

/**
 * One-shot Grok search + structured extraction. The `xai.responses` model runs
 * xAI's native X search server-side, then returns data shaped to `schema`.
 *
 * `generateObject`'s public option type doesn't expose `tools` (xSearch is a
 * server-side agentic tool), so we attach it at runtime and re-assert the base
 * option type — this keeps `schema` inference for the result while still passing
 * the tool through to the model.
 */
async function grokSearch<S extends z.ZodTypeAny>(
  schema: S,
  prompt: string,
): Promise<z.infer<S>> {
  const options = {
    model: xai.responses("grok-4.3"),
    schema,
    prompt,
  };
  const { object } = await generateObject({
    ...options,
    tools: { x_search: xai.tools.xSearch() },
  } as typeof options);
  return object as z.infer<S>;
}

const profileSchema = z.object({
  found: z
    .boolean()
    .describe("True only if a real, identifiable company was found on X."),
  name: z.string().nullable(),
  website: z.string().nullable(),
  sector: z.string().nullable().describe('Short category, e.g. "AI", "Fintech".'),
  country: z.string().nullable().describe("HQ country."),
  foundedYear: z.number().nullable(),
  description: z.string().nullable().describe("One sentence, max ~180 chars."),
  founders: z.array(z.string()).nullable(),
});

const roundsSchema = z.object({
  rounds: z
    .array(
      z.object({
        round: z.string().describe('e.g. "Seed", "Series A".'),
        date: z.string().nullable().describe("ISO YYYY-MM-DD if known."),
        amountRaised: z.number().nullable().describe("Absolute USD, e.g. 1.2B -> 1200000000."),
        valuation: z.number().nullable().describe("Post-money, absolute USD."),
        investors: z.array(z.string()).nullable(),
        leadInvestor: z.string().nullable(),
      }),
    )
    .describe("Empty array if no funding rounds are found."),
});

const newsSchema = z.object({
  news: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().nullable().describe("Link to the post / article."),
        date: z.string().nullable().describe("ISO YYYY-MM-DD if known."),
        summary: z.string().nullable(),
        sentiment: z.enum(["positive", "neutral", "negative"]).nullable(),
      }),
    )
    .describe("Empty array if nothing relevant is found."),
});

/**
 * Grok-powered connector. Uses xAI's `grok-4.3` responses model with the native
 * X search tool to fetch and structure company data in a single step. Replaces
 * the planned raw Twitter/X API integration. Gated on `XAI_API_KEY` in the
 * registry; every method degrades to an empty result instead of throwing.
 */
export class GrokConnector implements DataConnector {
  readonly id = "grok";

  async fetchCompanyProfile(
    query: string,
  ): Promise<ConnectorCompanyProfile | null> {
    try {
      const r = await grokSearch(
        profileSchema,
        `Search X (Twitter) for the company "${query}". Identify the company and ` +
          `extract its profile (sector, HQ country, website, founded year, founders, ` +
          `a one-sentence description). If you cannot confidently identify a real ` +
          `company, set "found" to false and leave the other fields null.`,
      );
      if (!r.found || !r.name) return null;
      return {
        name: r.name,
        website: clean(r.website),
        sector: clean(r.sector),
        country: clean(r.country),
        foundedYear: clean(r.foundedYear),
        description: clean(r.description),
        founders: clean(r.founders),
      };
    } catch (e) {
      console.error("GrokConnector.fetchCompanyProfile:", (e as Error).message);
      return null;
    }
  }

  async fetchFundingRounds(query: string): Promise<ConnectorFundingRound[]> {
    try {
      const r = await grokSearch(
        roundsSchema,
        `Search X (Twitter) for "${query} funding" and "${query} raises". Extract ` +
          `every distinct funding round you can verify (round name, date, amount ` +
          `raised, post-money valuation, lead investor, other investors). Return an ` +
          `empty array if none are found.`,
      );
      return (r.rounds ?? []).map((x) => ({
        round: x.round,
        date: clean(x.date),
        amountRaised: clean(x.amountRaised),
        valuation: clean(x.valuation),
        investors: clean(x.investors),
        leadInvestor: clean(x.leadInvestor),
        source: SOURCE,
      }));
    } catch (e) {
      console.error("GrokConnector.fetchFundingRounds:", (e as Error).message);
      return [];
    }
  }

  async fetchNews(query: string): Promise<ConnectorNewsItem[]> {
    try {
      const r = await grokSearch(
        newsSchema,
        `Search X (Twitter) for "${query} news" and recent posts about "${query}". ` +
          `Extract the most relevant recent items (headline, link, date, a short ` +
          `summary, and overall sentiment). Return an empty array if nothing ` +
          `relevant is found.`,
      );
      return (r.news ?? []).map((x) => ({
        title: x.title,
        source: SOURCE,
        url: clean(x.url),
        date: clean(x.date),
        summary: clean(x.summary),
        sentiment: clean(x.sentiment),
      }));
    } catch (e) {
      console.error("GrokConnector.fetchNews:", (e as Error).message);
      return [];
    }
  }
}
