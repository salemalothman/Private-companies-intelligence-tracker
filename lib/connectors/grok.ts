import "server-only";
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { z } from "zod";
import type {
  ConnectorCompanyProfile,
  ConnectorCompetitor,
  ConnectorFundingRound,
  ConnectorNewsItem,
  DataConnector,
} from "@/lib/connectors/types";

const SOURCE = "grok:x";

/**
 * Trusted private-market valuation sources the X search is told to prioritize.
 * Aaron Dillon (@AaronGDillon) posts secondary-market / private valuation data;
 * the campaign archive is a venture-tracking newsletter's back-catalogue.
 */
const PRIORITY_SOURCES =
  `Prioritize and cross-check data from these trusted private-market sources ` +
  `above all others: (1) the post history of https://x.com/AaronGDillon ` +
  `(handle @AaronGDillon) — search "from:AaronGDillon" for valuation posts; ` +
  `(2) the venture-tracking newsletter archive at ` +
  `https://us8.campaign-archive.com/home/?u=c1009bfb683b6db1d8b71e4e8&id=3efc966b29. ` +
  `Only fall back to other sources when neither covers the company.`;

/** Drop nulls so optional interface fields stay `undefined`, not `null`. */
const clean = <T>(v: T | null | undefined): T | undefined =>
  v === null || v === undefined ? undefined : v;

/**
 * Pull the first balanced JSON object/array out of a model response, ignoring
 * any trailing prose or citation markdown (e.g. `[[1]](url)`) the model appends.
 */
function extractJson(s: string): string | null {
  const oi = s.indexOf("{");
  const bi = s.indexOf("[");
  const start = oi < 0 ? bi : bi < 0 ? oi : Math.min(oi, bi);
  if (start < 0) return null;
  const open = s[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/**
 * One-shot Grok search + structured extraction. `xai.responses('grok-4.3')`
 * runs xAI's native X search server-side via the `x_search` tool, then the
 * model returns JSON which we validate against `schema`.
 *
 * NOTE: this uses `generateText` (not `generateObject`) on purpose — server-side
 * agentic tools like `x_search` only execute through the text/tool API;
 * `generateObject` silently ignores `tools` and answers from training data.
 */
async function grokSearch<S extends z.ZodTypeAny>(
  schema: S,
  instruction: string,
  shape: string,
): Promise<z.infer<S> | null> {
  const { text } = await generateText({
    model: xai.responses("grok-4.3"),
    tools: { x_search: xai.tools.xSearch() },
    prompt:
      `${instruction}\n\nAfter searching X, respond with ONLY minified JSON ` +
      `matching exactly this shape — no prose, no markdown fences, and no ` +
      `citations or footnotes before, after, or inside the JSON:\n${shape}`,
  });
  const json = extractJson(text ?? "");
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  const result = schema.safeParse(parsed);
  return result.success ? result.data : null;
}

const profileSchema = z.object({
  found: z.boolean().nullish(),
  name: z.string().nullish(),
  website: z.string().nullish(),
  sector: z.string().nullish(),
  country: z.string().nullish(),
  foundedYear: z.number().nullish(),
  description: z.string().nullish(),
  founders: z.array(z.string()).nullish(),
});
const PROFILE_SHAPE =
  '{"found":boolean,"name":string|null,"website":string|null,"sector":string|null,"country":string|null,"foundedYear":number|null,"description":string|null,"founders":string[]|null}';

const roundsSchema = z.object({
  rounds: z
    .array(
      z.object({
        round: z.string().nullish(),
        date: z.string().nullish(),
        amountRaised: z.number().nullish(),
        valuation: z.number().nullish(),
        investors: z.array(z.string()).nullish(),
        leadInvestor: z.string().nullish(),
      }),
    )
    .nullish(),
});
const ROUNDS_SHAPE =
  '{"rounds":[{"round":string,"date":"YYYY-MM-DD"|null,"amountRaised":number|null,"valuation":number|null,"investors":string[]|null,"leadInvestor":string|null}]}';

const newsSchema = z.object({
  news: z
    .array(
      z.object({
        title: z.string().nullish(),
        url: z.string().nullish(),
        date: z.string().nullish(),
        summary: z.string().nullish(),
        sentiment: z.enum(["positive", "neutral", "negative"]).nullish(),
      }),
    )
    .nullish(),
});
const NEWS_SHAPE =
  '{"news":[{"title":string,"url":string|null,"date":"YYYY-MM-DD"|null,"summary":string|null,"sentiment":"positive"|"neutral"|"negative"|null}]}';

const metricFields = {
  valuation: z.number().nullish(),
  valuationDate: z.string().nullish(),
  revenue: z.number().nullish(),
  revenueBasis: z.string().nullish(),
  basis: z.string().nullish(),
};
const METRIC_FIELDS_SHAPE =
  '"valuation":number|null,"valuationDate":"YYYY-MM-DD"|null,"revenue":number|null,"revenueBasis":string|null,"basis":string|null';

const competitorsSchema = z.object({
  competitors: z
    .array(z.object({ name: z.string().nullish(), ...metricFields }))
    .nullish(),
});
const COMPETITORS_SHAPE = `{"competitors":[{"name":string,${METRIC_FIELDS_SHAPE}}]}`;

const metricSchema = z.object({ found: z.boolean().nullish(), ...metricFields });
const METRIC_SHAPE = `{"found":boolean,${METRIC_FIELDS_SHAPE}}`;

/** Shared instruction for extracting revenue/ARR alongside a valuation. */
const REVENUE_INSTRUCTION =
  `Also capture the latest reported revenue or annualized run-rate (ARR) in USD ` +
  `("revenue") for the SAME period as the valuation, plus a one-line ` +
  `"revenueBasis" naming the figure and its source (e.g. "ARR ~$100M per ` +
  `@AaronGDillon"). Leave "revenue" null if no credible figure exists — never guess.`;

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
        PROFILE_SHAPE,
      );
      if (!r || r.found === false || !r.name) return null;
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
          `every distinct funding round you can verify (round name, amount raised ` +
          `in USD, post-money valuation in USD, lead investor, other investors). ` +
          `For EACH round you MUST include the announcement "date" as YYYY-MM-DD ` +
          `(if only the month or year is known, use the 1st of that month/year). ` +
          `Return an empty array if none are found.`,
        ROUNDS_SHAPE,
      );
      return (r?.rounds ?? []).map((x) => ({
        round: clean(x.round) ?? "Undisclosed",
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
          `Return at most the 3 most relevant, most recent items (headline, link, ` +
          `date, a short summary, and overall sentiment). Return an empty array if ` +
          `nothing relevant is found.`,
        NEWS_SHAPE,
      );
      // Hard cap at 3 news items per run regardless of what the model returns.
      return (r?.news ?? [])
        .filter((x) => clean(x.title))
        .slice(0, 3)
        .map((x) => ({
          title: x.title as string,
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

  async fetchCompetitors(query: string): Promise<ConnectorCompetitor[]> {
    try {
      const r = await grokSearch(
        competitorsSchema,
        `Identify the primary direct competitors of the private company ` +
          `"${query}" and, for EACH, its most recent known post-money ` +
          `valuation in USD. ${PRIORITY_SOURCES} For every competitor include ` +
          `the valuation "valuationDate" as YYYY-MM-DD (use the 1st of the ` +
          `month/year if only that is known) and a one-line "basis" naming the ` +
          `round and which source the figure came from (e.g. "Series C, ` +
          `$2.1B, per @AaronGDillon Apr 2024"). ${REVENUE_INSTRUCTION} Return ` +
          `the 6 most relevant competitors. Omit any whose competitive ` +
          `relationship you cannot verify. Return an empty array if none found.`,
        COMPETITORS_SHAPE,
      );
      return (r?.competitors ?? [])
        .filter((x) => clean(x.name))
        .map((x) => ({
          name: (x.name as string).trim(),
          valuation: clean(x.valuation),
          valuationDate: clean(x.valuationDate),
          revenue: clean(x.revenue),
          revenueBasis: clean(x.revenueBasis),
          basis: clean(x.basis),
          source: SOURCE,
        }));
    } catch (e) {
      console.error("GrokConnector.fetchCompetitors:", (e as Error).message);
      return [];
    }
  }

  /**
   * Latest valuation + revenue/ARR for a single company — used to populate the
   * target company's own row (and its Valuation-to-Revenue multiple) in the
   * competitive landscape. Returns null if nothing credible is found.
   */
  async fetchValuationMetric(
    query: string,
  ): Promise<Omit<ConnectorCompetitor, "name"> | null> {
    try {
      const r = await grokSearch(
        metricSchema,
        `Find the most recent known post-money valuation (USD) of the private ` +
          `company "${query}", with its "valuationDate" as YYYY-MM-DD. ` +
          `${PRIORITY_SOURCES} ${REVENUE_INSTRUCTION} If you cannot find a ` +
          `credible valuation, set "found" to false.`,
        METRIC_SHAPE,
      );
      if (!r || r.found === false) return null;
      if (r.valuation == null && r.revenue == null) return null;
      return {
        valuation: clean(r.valuation),
        valuationDate: clean(r.valuationDate),
        revenue: clean(r.revenue),
        revenueBasis: clean(r.revenueBasis),
        basis: clean(r.basis),
        source: SOURCE,
      };
    } catch (e) {
      console.error("GrokConnector.fetchValuationMetric:", (e as Error).message);
      return null;
    }
  }
}
