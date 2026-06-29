import "server-only";
import { getConnectors } from "@/lib/connectors/registry";
import { fetchUrlContent } from "@/lib/documents/fetch-url";

export interface EnrichedProfile {
  sector?: string;
  country?: string;
  website?: string;
  foundedYear?: number;
  founders?: string[];
  description?: string;
  logoUrl?: string;
}

/** Bare registrable domain from a website URL ("https://www.openai.com/x" -> "openai.com"). */
function domainOf(website?: string): string | null {
  if (!website) return null;
  try {
    const u = new URL(website.startsWith("http") ? website : `https://${website}`);
    return u.hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/**
 * High-fidelity brand logo from the company's domain via Clearbit's keyless
 * Logo API. The URL is constructed (not fetched) here — the browser <img>
 * loads it directly and falls back to an initial on error, which both verifies
 * the asset client-side and avoids a server round-trip on every keystroke.
 */
function resolveLogo(website?: string): string | undefined {
  const domain = domainOf(website);
  return domain ? `https://logo.clearbit.com/${domain}` : undefined;
}

/** LLM enrichment (gated on ANTHROPIC_API_KEY) — returns real, known facts. */
async function llmEnrich(name: string): Promise<EnrichedProfile> {
  const key = process.env.ANTHROPIC_API_KEY!;
  const prompt = `Return ONLY minified JSON describing the company "${name}" (no prose, no code fences):
{"sector":string|null,"country":string|null,"website":string|null,"foundedYear":number|null,"founders":string[]|null,"description":string|null}
Use null for anything you are unsure of. "sector" is a short category (e.g. "AI", "Fintech", "Dev Tools"). "description" max 180 chars.`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const raw: string = data?.content?.[0]?.text ?? "";
  const json = raw.replace(/^```(?:json)?\s*|\s*```$/g, "").trim();
  const p = JSON.parse(json) as Record<string, unknown>;
  return {
    sector: (p.sector as string) ?? undefined,
    country: (p.country as string) ?? undefined,
    website: (p.website as string) ?? undefined,
    foundedYear: (p.foundedYear as number) ?? undefined,
    founders: (p.founders as string[]) ?? undefined,
    description: (p.description as string) ?? undefined,
  };
}

/**
 * Enrich a company profile from just its name. Uses the LLM when a key is set
 * (real, known facts), otherwise the keyless connector(s). Same contract either
 * way so the modal's auto-fill is identical.
 */
export async function enrichCompanyProfile(
  name: string,
): Promise<EnrichedProfile> {
  const base = await resolveBase(name);
  // Deep-read the official website for a high-fidelity description, preferring
  // it over the model's from-memory one-liner (and grounding niche companies).
  const fromSite = base.website
    ? await describeFromWebsite(name, base.website)
    : undefined;
  return {
    ...base,
    description: fromSite ?? base.description,
    // Derive the brand logo from the resolved domain (verified client-side).
    logoUrl: resolveLogo(base.website),
  };
}

/**
 * Fetch the company's official site and distill a comprehensive description of
 * its core operations, products, and value proposition. Uses the LLM over the
 * page text when a key is set, else a heuristic over the readable content.
 * Best-effort — returns undefined on any failure.
 */
async function describeFromWebsite(
  name: string,
  website: string,
): Promise<string | undefined> {
  try {
    const { text, description } = await fetchUrlContent(website);
    const content = text.trim();
    if (content.length < 80 && !description) return undefined;

    if (process.env.ANTHROPIC_API_KEY && content.length >= 80) {
      const llm = await llmDescribe(name, content).catch(() => undefined);
      if (llm) return llm;
    }
    // Prefer the site's curated meta description over raw body sentences.
    const meta = description?.replace(/\s+/g, " ").trim();
    if (meta && meta.length >= 40) return meta.slice(0, 600);
    return heuristicDescribe(content);
  } catch {
    return undefined;
  }
}

/** LLM summary of what the company does, grounded in its website text. */
async function llmDescribe(name: string, content: string): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 240,
      messages: [
        {
          role: "user",
          content:
            `From this text scraped from ${name}'s official website, write a ` +
            `2-3 sentence description of what the company actually does — its ` +
            `core operations, main product(s), and value proposition / target ` +
            `customers. Plain prose only, no preamble, no markdown.\n\n` +
            content.slice(0, 8000),
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}`);
  const data = await res.json();
  const out: string = (data?.content?.[0]?.text ?? "").trim();
  return out.replace(/\s+/g, " ").slice(0, 600);
}

/** Keyless fallback: the first couple of substantial sentences. */
function heuristicDescribe(content: string): string | undefined {
  const sentences = content
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 40 && /[a-z]/.test(s) && /\s/.test(s));
  const summary = sentences.slice(0, 2).join(" ").slice(0, 400);
  return summary.length >= 40 ? summary : undefined;
}

/** The factual profile (without logo) from the LLM or keyless connectors. */
async function resolveBase(name: string): Promise<EnrichedProfile> {
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      return await llmEnrich(name);
    } catch {
      // fall through to connectors
    }
  }
  for (const c of getConnectors()) {
    const p = await c.fetchCompanyProfile(name);
    if (p) {
      return {
        sector: p.sector,
        country: p.country,
        website: p.website,
        foundedYear: p.foundedYear,
        founders: p.founders,
        description: p.description,
      };
    }
  }
  return {};
}
