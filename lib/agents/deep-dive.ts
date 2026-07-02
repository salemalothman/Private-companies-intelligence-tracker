import "server-only";
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCompetitorRanking, type RankedEntity } from "@/lib/competitors/rank";
import { buildCanonicalRecord, type CanonicalRecord } from "@/lib/canonical";
import { latestValuation, valuationAmount } from "@/lib/metrics";
import { nameKey } from "@/lib/market-cache/parse";
import type {
  AnalysisSections,
  AnalysisValuation,
} from "@/lib/agents/deep-dive-types";
import type {
  CompanyWithRelations,
  CompetitorRow,
  Database,
  MarketValuationRow,
} from "@/lib/types";

const GROK_MODEL = "grok-4.3";

/**
 * Linear-interpolation percentile (the R-7 / Excel `PERCENTILE.INC` method) over
 * an already-sorted ascending array. For quantile q in [0,1] the fractional rank
 * is `q·(N-1)`; the result interpolates between the two straddling samples. Over
 * `[2,4,6,8]` this yields p25=3.5, median=5, p75=6.5. Returns null for an empty set —
 * we never fabricate a percentile out of no data.
 */
function percentile(sortedAsc: number[], q: number): number | null {
  const n = sortedAsc.length;
  if (n === 0) return null;
  if (n === 1) return sortedAsc[0];
  const rank = q * (n - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sortedAsc[lo];
  const frac = rank - lo;
  return sortedAsc[lo] + (sortedAsc[hi] - sortedAsc[lo]) * frac;
}

/**
 * Peer-multiple percentiles, computed IN CODE (never by the LLM) from the ranked
 * competitor set. Only non-target peers that are BOTH SEC-verified and carry a
 * finite V/R `multiple` feed the median/p25/p75; when none qualify the percentiles
 * are null (not zero, not invented). `n_sec_verified` counts the peers that fed the
 * percentiles; `n_peers` counts every non-target ranked peer considered.
 */
export function computePeerMultiple(
  ranked: RankedEntity[],
): AnalysisValuation["peer_multiple"] {
  const peers = ranked.filter((r) => !r.isTarget);
  const secVerifiedMultiples = peers
    .filter((r) => r.secVerified && r.multiple != null && Number.isFinite(r.multiple))
    .map((r) => r.multiple as number)
    .sort((a, b) => a - b);

  return {
    median: percentile(secVerifiedMultiples, 0.5),
    p25: percentile(secVerifiedMultiples, 0.25),
    p75: percentile(secVerifiedMultiples, 0.75),
    n_peers: peers.length,
    n_sec_verified: secVerifiedMultiples.length,
  };
}

/**
 * Base revenue for the comps model, taken verbatim from the canonical record —
 * never invented. The value is `canonical.revenue.value`; the source is the label
 * of the observation that set the canonical `asOf` date (may be null). `CanonicalField`
 * has no top-level `.source`, so the source is derived from the matching observation.
 */
export function deriveBaseRevenue(
  canonical: CanonicalRecord,
): AnalysisValuation["base_revenue"] {
  const { value, asOf, observations } = canonical.revenue;
  const source =
    observations.find((o) => o.date === asOf)?.source ?? null;
  return { value, source };
}

type DB = SupabaseClient<Database>;

/**
 * Pull the first balanced JSON object out of a model response, ignoring any
 * trailing prose or citation markdown the model appends. Mirrors the extractor
 * in lib/connectors/grok.ts (kept local so the agent has no coupling to the
 * connector's private internals).
 */
function extractJson(s: string): string | null {
  const start = s.indexOf("{");
  if (start < 0) return null;
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
    else if (ch === "{") depth++;
    else if (ch === "}" && --depth === 0) return s.slice(start, i + 1);
  }
  return null;
}

/**
 * The structured Grok response. `sections` is the open narrative container; the
 * LLM contributes numbers ONLY inside `growth` (base/bear/bull growth RATES +
 * confidence + rationale) — every quantitative comps input is code-computed.
 */
const analysisSchema = z.object({
  sections: z.record(z.string(), z.unknown()).nullish(),
  growth: z
    .object({
      base: z.number().nullish(),
      bear: z.number().nullish(),
      bull: z.number().nullish(),
      confidence: z.enum(["low", "med", "high"]).nullish(),
      rationale: z.string().nullish(),
    })
    .nullish(),
});

const ANALYSIS_SHAPE =
  '{"sections":{"executive_summary":{"text":string,"basis":"fact"|"estimate",' +
  '"confidence":"low"|"med"|"high","source":string|null},"technology":{...same ' +
  'labelled-field shape...},"business_model":{...},"moat":{...},"market_opportunity":' +
  '{...},"outlook_and_exit":{...},"ic_conclusion":{...}},"growth":{"base":number,' +
  '"bear":number,"bull":number,"confidence":"low"|"med"|"high","rationale":string}}';

/**
 * The one and only prompt guard. Instructs Grok to synthesize the narrative from
 * the supplied grounding, to label every forward-looking field, and — critically —
 * to invent NO probabilities, price targets, or exact financial figures. Growth is
 * a RATE proposal only; all valuation math is done in code downstream.
 */
function buildPrompt(grounding: string): string {
  return (
    `You are an institutional analyst writing a grounded deep-dive on a private ` +
    `company. Use ONLY the grounding context below plus X/web search for ` +
    `qualitative colour.\n\nGROUNDING CONTEXT:\n${grounding}\n\n` +
    `Produce a JSON object with two keys:\n` +
    `1. "sections" — a narrative object (executive_summary, technology, ` +
    `business_model, moat, market_opportunity, outlook_and_exit, ic_conclusion). ` +
    `Every forward-looking field MUST be an object {text, basis:"fact"|"estimate", ` +
    `confidence:"low"|"med"|"high", source?}. Label anything not directly ` +
    `attributable to the grounding as an "estimate".\n` +
    `2. "growth" — ONLY a proposed annual revenue growth-RATE scenario for this ` +
    `company: base, bear and bull as decimals (e.g. 0.3 = 30%), a confidence, and ` +
    `a one-line rationale grounded in its history/sector.\n\n` +
    `HARD RULES — you MUST NOT: invent probabilities or probability tables ` +
    `(no IPO-by-year %, no acquisition %, no scenario % splits); assert price ` +
    `targets or exact valuation figures; fabricate revenue, margins, or P&L as ` +
    `fact. Do not output any numeric valuation forecast — the comps math is done ` +
    `in code from real peer multiples, not by you. Numbers you emit appear ONLY ` +
    `inside "growth" as rates.`
  );
}

/** Serialize the in-app grounding into a compact prompt block. */
function summarizeGrounding(
  company: CompanyWithRelations,
  canonical: CanonicalRecord,
  ranking: RankedEntity[],
): string {
  const peers = ranking
    .filter((r) => !r.isTarget)
    .map(
      (r) =>
        `- ${r.name}: valuation=${r.valuation ?? "?"}, revenue=${r.revenue ?? "?"}, ` +
        `V/R=${r.multiple != null ? r.multiple.toFixed(1) : "?"}` +
        `${r.secVerified ? " [SEC-verified]" : ""}`,
    )
    .join("\n");
  const rounds = company.funding_rounds
    .map((f) => `- ${f.round ?? "round"} ${f.date ?? ""}: raised ${f.amount_raised ?? "?"}`)
    .join("\n");
  const news = company.news
    .slice(0, 5)
    .map((n) => `- ${n.title}${n.date ? ` (${n.date})` : ""}`)
    .join("\n");
  return [
    `Company: ${company.name}${company.sector ? ` — ${company.sector}` : ""}`,
    company.description ? `About: ${company.description}` : "",
    `Canonical valuation: ${canonical.valuation.value ?? "unknown"} ` +
      `(as of ${canonical.valuation.asOf ?? "n/a"})`,
    `Canonical revenue: ${canonical.revenue.value ?? "unknown"} ` +
      `(as of ${canonical.revenue.asOf ?? "n/a"})`,
    `Canonical V/R multiple: ${canonical.multiple != null ? canonical.multiple.toFixed(1) : "unknown"}`,
    peers ? `Competitor landscape:\n${peers}` : "Competitor landscape: none on record",
    rounds ? `Funding history:\n${rounds}` : "",
    news ? `Recent news:\n${news}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

const EMPTY_GROWTH: AnalysisValuation["growth"] = {
  base: 0,
  bear: 0,
  bull: 0,
  confidence: "low",
  rationale: "",
};

/**
 * The single Grok deep-dive agent. Signature convention: the Supabase client is
 * the first arg so the agent runs identically under an RLS user session (the
 * "Run deep-dive" button) or a service-role identity (cron).
 *
 * Steps: (1) GATHER the grounding the app already holds — canonical record,
 * competitor ranking + multiples (REUSES existing competitor sync rows, does not
 * re-run Phase-0 discovery), funding/valuation history, news; (2) ONE structured
 * Grok call for the narrative `sections` + a growth-RATE proposal; (3) compute the
 * comps inputs IN CODE (peer-multiple percentiles, base revenue, current
 * valuation) — the LLM's numbers live ONLY inside `growth`; (4) UPSERT one
 * `company_analysis` row keyed on `company_id`. The Grok call degrades to an empty
 * analysis (still a timestamped upsert) rather than throwing, matching the
 * connector convention.
 */
export async function runDeepDive(
  supabase: DB,
  company: CompanyWithRelations,
): Promise<{ error?: string }> {
  // Step 1 — GATHER in-app grounding (reuse existing sync rows; no re-discovery).
  const [{ data: competitors }, { data: marketRow }] = await Promise.all([
    supabase.from("competitors").select("*").eq("company_id", company.id),
    supabase
      .from("market_valuations")
      .select("*")
      .eq("name_key", nameKey(company.name))
      .maybeSingle(),
  ]);
  const comps: CompetitorRow[] = competitors ?? [];
  const market = (marketRow as MarketValuationRow | null) ?? null;
  const selfMetric = comps.find((c) => c.is_self) ?? null;
  const peers = comps.filter((c) => !c.is_self);

  const canonical = buildCanonicalRecord(company, {
    market: market
      ? {
          source: market.source,
          valuation: market.valuation,
          valuation_date: market.valuation_date,
          revenue: market.revenue,
          as_of: market.as_of,
        }
      : null,
    self: selfMetric
      ? {
          source: selfMetric.source,
          valuation: selfMetric.valuation,
          revenue: selfMetric.revenue,
          valuation_date: selfMetric.valuation_date,
        }
      : null,
  });
  const latestVal = latestValuation(company.valuations);
  const ranking = buildCompetitorRanking(
    {
      name: company.name,
      valuation: valuationAmount(latestVal) ?? selfMetric?.valuation ?? null,
      valuationDate: latestVal?.date ?? selfMetric?.valuation_date ?? null,
      revenue: canonical.revenue.value,
    },
    peers,
  );

  // Step 2 — ONE structured Grok call for the narrative + growth-rate proposal.
  // Degrade to an empty analysis on any failure (never throw) — matches grok.ts.
  let sections: AnalysisSections = {};
  let growth: AnalysisValuation["growth"] = EMPTY_GROWTH;
  try {
    const { text } = await generateText({
      model: xai.responses(GROK_MODEL),
      tools: { x_search: xai.tools.xSearch() },
      prompt:
        `${buildPrompt(summarizeGrounding(company, canonical, ranking))}\n\n` +
        `Respond with ONLY minified JSON matching this shape — no prose, no ` +
        `markdown fences, no citations:\n${ANALYSIS_SHAPE}`,
    });
    const json = extractJson(text ?? "");
    const parsed = json ? analysisSchema.safeParse(JSON.parse(json)) : null;
    if (parsed?.success) {
      sections = (parsed.data.sections ?? {}) as AnalysisSections;
      const g = parsed.data.growth;
      if (g) {
        growth = {
          base: g.base ?? 0,
          bear: g.bear ?? 0,
          bull: g.bull ?? 0,
          confidence: g.confidence ?? "low",
          rationale: g.rationale ?? "",
        };
      }
    }
  } catch (e) {
    console.error("runDeepDive.grok:", (e as Error).message);
  }

  // Step 3 — comps inputs computed IN CODE (LLM contributes nothing here).
  const valuation: AnalysisValuation = {
    base_revenue: deriveBaseRevenue(canonical),
    current_valuation:
      valuationAmount(latestVal) ?? canonical.valuation.value ?? null,
    peer_multiple: computePeerMultiple(ranking),
    growth,
  };

  // Step 4 — UPSERT one company_analysis row keyed on company_id. user_id defaults
  // to auth.uid() under RLS (button) or must be set under service-role (cron).
  const { error } = await supabase.from("company_analysis").upsert(
    {
      company_id: company.id,
      user_id: company.user_id,
      generated_at: new Date().toISOString(),
      model: GROK_MODEL,
      sections,
      valuation,
    },
    { onConflict: "company_id" },
  );
  if (error) {
    console.error("runDeepDive.upsert:", error.message);
    return { error: error.message };
  }
  return {};
}
