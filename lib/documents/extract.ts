import "server-only";
import {
  heuristicExtract,
  type ExtractOptions,
  type ExtractedEntities,
} from "@/lib/documents/heuristic";

export type { ExtractedEntities, ExtractOptions };

export interface ExtractionResult {
  engine: "llm" | "heuristic";
  entities: ExtractedEntities;
}

/**
 * LLM extraction (gated on ANTHROPIC_API_KEY). Asks Claude to return structured
 * financial entities matching the ExtractedEntities contract. Far more accurate
 * than the heuristic on real documents; only runs when a key is configured.
 */
async function llmExtract(
  text: string,
  opts: ExtractOptions,
): Promise<ExtractedEntities> {
  const key = process.env.ANTHROPIC_API_KEY!;
  const prompt = `You are a financial analyst extracting structured data from a document about a private company.
Return ONLY minified JSON matching this TypeScript type (no prose, no code fences):
{"fundingRounds":[{"round":string,"date":string|null,"amountRaised":number|null,"valuation":number|null,"leadInvestor":string|null,"investors":string[]|null}],"valuations":[{"date":string,"post_money":number,"round":string|null}],"news":[{"title":string,"date":string|null,"summary":string,"sentiment":"positive"|"neutral"|"negative"}]}
Rules: amounts in absolute USD (e.g. "$1.2B" -> 1200000000); dates as YYYY-MM-DD or null; only include a valuation when both an amount and a date are present; always include exactly one news item summarizing the document.
Document title: ${opts.title}
Document text:
${text.slice(0, 12000)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1500,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const raw: string = data?.content?.[0]?.text ?? "";
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(json) as {
    fundingRounds?: ExtractedEntities["fundingRounds"];
    valuations?: { date: string; post_money: number; round: string | null }[];
    news?: {
      title: string;
      date: string | null;
      summary: string;
      sentiment: "positive" | "neutral" | "negative";
    }[];
  };

  return {
    fundingRounds: (parsed.fundingRounds ?? []).map((r) => ({
      ...r,
      source: opts.source,
    })),
    valuations: (parsed.valuations ?? []).map((v) => ({
      ...v,
      source: opts.source,
    })),
    news: (parsed.news ?? []).map((n) => ({
      title: n.title,
      source: opts.source,
      url: opts.url,
      date: n.date ?? undefined,
      summary: n.summary,
      sentiment: n.sentiment,
    })),
  };
}

/**
 * Extract entities using the best available engine: LLM when ANTHROPIC_API_KEY is
 * set (falling back to the heuristic on any failure), otherwise the keyless
 * heuristic. Same contract either way, so the downstream routing is identical.
 */
export async function extractEntities(
  text: string,
  opts: ExtractOptions,
): Promise<ExtractionResult> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return { engine: "llm", entities: await llmExtract(text, opts) };
    } catch {
      // fall through to heuristic
    }
  }
  return { engine: "heuristic", entities: heuristicExtract(text, opts) };
}
