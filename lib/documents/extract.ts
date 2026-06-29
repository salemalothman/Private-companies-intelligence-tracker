import "server-only";
import {
  heuristicExtract,
  type ExtractOptions,
  type ExtractedEntities,
} from "@/lib/documents/heuristic";

export type { ExtractedEntities, ExtractOptions };

export interface ExtractionResult {
  engine: "llm" | "llm-vision" | "heuristic";
  entities: ExtractedEntities;
}

const MODEL = "claude-haiku-4-5-20251001";

/** Shared extraction instructions (schema + rules) for the LLM engines. */
const INSTRUCTIONS = `You are a financial analyst extracting structured data from a document about a private company.
Return ONLY minified JSON matching this TypeScript type (no prose, no code fences):
{"fundingRounds":[{"round":string,"date":string|null,"amountRaised":number|null,"valuation":number|null,"leadInvestor":string|null,"investors":string[]|null}],"valuations":[{"date":string,"post_money":number,"round":string|null}],"news":[{"title":string,"date":string|null,"summary":string,"sentiment":"positive"|"neutral"|"negative"}],"competitors":[{"name":string,"valuation":number|null,"revenue":number|null,"note":string|null}],"revenue":number|null}
Rules: amounts in absolute USD (e.g. "$1.2B" -> 1200000000); dates as YYYY-MM-DD or null; only include a valuation when both an amount and a date are present; always include exactly one news item summarizing the document. For "competitors", list every market competitor / rival company the document names (e.g. a "Competitive Landscape" or "Competitors" section), with their stated valuation or revenue when given; never include the subject company itself. For "revenue", give THE SUBJECT COMPANY's own most recent annual revenue or ARR in absolute USD (null if not stated) — not a competitor's.`;

interface ParsedShape {
  fundingRounds?: ExtractedEntities["fundingRounds"];
  valuations?: { date: string; post_money: number; round: string | null }[];
  news?: {
    title: string;
    date: string | null;
    summary: string;
    sentiment: "positive" | "neutral" | "negative";
  }[];
  competitors?: {
    name: string;
    valuation: number | null;
    revenue: number | null;
    note: string | null;
  }[];
  revenue?: number | null;
}

/** Call Anthropic Messages with arbitrary content blocks; return the raw text. */
async function callAnthropic(content: unknown): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1500,
      messages: [{ role: "user", content }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  return data?.content?.[0]?.text ?? "";
}

/** Map the model's JSON response onto the ExtractedEntities contract. */
function parseEntities(raw: string, opts: ExtractOptions): ExtractedEntities {
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const parsed = JSON.parse(json) as ParsedShape;
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
    competitors: (parsed.competitors ?? [])
      .filter((c) => c?.name?.trim())
      .map((c) => ({
        name: c.name.trim(),
        valuation: c.valuation ?? undefined,
        revenue: c.revenue ?? undefined,
        note: c.note ?? undefined,
      })),
    revenue: parsed.revenue ?? undefined,
  };
}

/**
 * LLM extraction from already-parsed text (gated on ANTHROPIC_API_KEY). Far more
 * accurate than the heuristic on real documents.
 */
async function llmExtract(
  text: string,
  opts: ExtractOptions,
): Promise<ExtractedEntities> {
  const raw = await callAnthropic(
    `${INSTRUCTIONS}\nDocument title: ${opts.title}\nDocument text:\n${text.slice(0, 12000)}`,
  );
  return parseEntities(raw, opts);
}

/**
 * Vision extraction straight from the PDF bytes — Claude reads the rendered
 * pages, so this works on image-based slide decks that yield no extractable
 * text. This is our OCR path; gated on ANTHROPIC_API_KEY.
 */
export async function extractEntitiesFromPdf(
  buf: Uint8Array,
  opts: ExtractOptions,
): Promise<ExtractionResult> {
  const base64 = Buffer.from(buf).toString("base64");
  const raw = await callAnthropic([
    {
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: base64 },
    },
    {
      type: "text",
      text: `${INSTRUCTIONS}\nDocument title: ${opts.title}\nExtract from the attached PDF (it may be a slide deck — read the pages).`,
    },
  ]);
  return { engine: "llm-vision", entities: parseEntities(raw, opts) };
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
