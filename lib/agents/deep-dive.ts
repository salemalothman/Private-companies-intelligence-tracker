import "server-only";
import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildCompetitorRanking, type RankedEntity } from "@/lib/competitors/rank";
import { buildCanonicalRecord, type CanonicalRecord } from "@/lib/canonical";
import { latestValuation, valuationAmount } from "@/lib/metrics";
import { nameKey } from "@/lib/market-cache/parse";
import { clampRating } from "@/lib/agents/deep-dive-types";
import type {
  AnalysisSections,
  AnalysisValuation,
  CapabilityThreat,
  CompetitorsSection,
  IcRating,
  LabelledField,
  OverviewSections,
  ThreatTier,
} from "@/lib/agents/deep-dive-types";
import type {
  CompanyWithRelations,
  CompetitorRow,
  Database,
  FormDRoundRow,
  MarketValuationRow,
  PeerFinancialRow,
  XPostRow,
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

const IC_RATINGS: readonly IcRating[] = ["strong_buy", "buy", "hold", "sell"];

const THREAT_TIERS: readonly ThreatTier[] = ["direct", "indirect", "emerging"];

/** True for a plain (non-array, non-null) object. */
function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Coerce an arbitrary value into a `LabelledField`, or undefined. Keeps ONLY the
 * four honest keys (text, basis, confidence, source) — this is what strips any
 * stray probability/price-target keys the model may attach to a narrative field
 * (defense-in-depth for the no-fabricated-numbers guardrail). Returns undefined
 * when there is no usable text.
 */
function toLabelled(v: unknown): LabelledField | undefined {
  if (!isObject(v)) return undefined;
  const text = typeof v.text === "string" ? v.text : undefined;
  if (!text) return undefined;
  const basis = v.basis === "fact" ? "fact" : "estimate";
  const confidence =
    v.confidence === "low" || v.confidence === "high" ? v.confidence : "med";
  const field: LabelledField = { text, basis, confidence };
  if (typeof v.source === "string") field.source = v.source;
  return field;
}

/** Map an array of raw values into labelled fields, dropping unusable entries. */
function toLabelledArray(v: unknown): LabelledField[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v.map(toLabelled).filter((f): f is LabelledField => f != null);
  return out.length ? out : undefined;
}

/** Assign a key only if the value is defined (keeps the output object sparse). */
function put<T extends object, K extends keyof T>(
  o: T,
  k: K,
  val: T[K] | undefined,
): void {
  if (val !== undefined) o[k] = val;
}

/**
 * Pure, throw-free normalizer that maps a parsed (untrusted) Grok object into the
 * tightened `OverviewSections` shape (crosses the LLM → app trust boundary — see
 * threat T-02-01). It: passes every numeric rating through `clampRating`
 * (moat_rating + each strategic_moat dimension); keeps narrative fields as
 * {text, basis, confidence, source} via `toLabelled` (which strips any extra
 * probability/price-target keys); coerces `ic_conclusion.rating` to the enum or
 * drops it; and drops unknown/missing keys. Returns `{}` for any non-object
 * input. This runs before persistence so a hostile or malformed model response
 * can never write fabricated numbers or unexpected keys into storage.
 *
 * `allowedNames` is the classification allow-list — the ranked competitor +
 * target names (from buildCompetitorRanking). For the `competitors` block it
 * enforces threat T-03-02: any tier/matrix name NOT in this list (matched
 * case-insensitively) is dropped, so the model cannot inject a competitor it was
 * never given. An empty list means "no name-filtering context" (back-compat for
 * the existing single-arg callers/tests): names pass through un-filtered but tiers
 * are still enum-coerced and scores still clamped.
 */
export function normalizeSections(
  raw: unknown,
  allowedNames: string[] = [],
): OverviewSections {
  const out: OverviewSections = {};
  if (!isObject(raw)) return out;

  // Case-insensitive allow-list of ranked names (empty => no name filtering).
  const allow = new Set(
    allowedNames.map((n) => n.trim().toLowerCase()).filter(Boolean),
  );
  const isAllowed = (name: string): boolean =>
    allow.size === 0 || allow.has(name.trim().toLowerCase());

  // executive_summary — thesis/value_prop/positioning/most_likely_outcome + arrays
  if (isObject(raw.executive_summary)) {
    const es = raw.executive_summary;
    const exec: NonNullable<OverviewSections["executive_summary"]> = {};
    put(exec, "thesis", toLabelled(es.thesis));
    put(exec, "value_prop", toLabelled(es.value_prop));
    put(exec, "strengths", toLabelledArray(es.strengths));
    put(exec, "weaknesses", toLabelledArray(es.weaknesses));
    put(exec, "positioning", toLabelled(es.positioning));
    put(exec, "most_likely_outcome", toLabelled(es.most_likely_outcome));
    if (Object.keys(exec).length) out.executive_summary = exec;
  }

  // technology — labelled narrative + a 1–10 moat rating (clamped)
  if (isObject(raw.technology)) {
    const t = raw.technology;
    const tech: NonNullable<OverviewSections["technology"]> = {};
    put(tech, "narrative", toLabelled(t.narrative));
    if ("moat_rating" in t) {
      tech.moat_rating = clampRating(t.moat_rating as number | null | undefined);
    }
    if (Object.keys(tech).length) out.technology = tech;
  }

  // Single labelled-field sections
  put(out, "product_portfolio", toLabelled(raw.product_portfolio));
  put(out, "vertical_customer", toLabelled(raw.vertical_customer));
  put(out, "business_model", toLabelled(raw.business_model));
  put(out, "unit_economics", toLabelled(raw.unit_economics));
  put(out, "historical_analogue", toLabelled(raw.historical_analogue));
  // outlook_and_exit — narrative ONLY; toLabelled strips probability/price keys.
  put(out, "outlook_and_exit", toLabelled(raw.outlook_and_exit));

  // market_opportunity — tam/sam/som directional labelled ranges
  if (isObject(raw.market_opportunity)) {
    const m = raw.market_opportunity;
    const mkt: NonNullable<OverviewSections["market_opportunity"]> = {};
    put(mkt, "tam", toLabelled(m.tam));
    put(mkt, "sam", toLabelled(m.sam));
    put(mkt, "som", toLabelled(m.som));
    if (Object.keys(mkt).length) out.market_opportunity = mkt;
  }

  // strategic_moat — four per-dimension 1–10 ratings (clamped) + optional narrative
  if (isObject(raw.strategic_moat)) {
    const sm = raw.strategic_moat;
    const moat: NonNullable<OverviewSections["strategic_moat"]> = {};
    const dims = [
      "switching_costs",
      "network_flywheel",
      "distribution_regulatory",
      "ip",
    ] as const;
    for (const d of dims) {
      if (d in sm) moat[d] = clampRating(sm[d] as number | null | undefined);
    }
    put(moat, "narrative", toLabelled(sm.narrative));
    if (Object.keys(moat).length) out.strategic_moat = moat;
  }

  // ic_conclusion — rating enum (dropped if invalid) + bull/bear/recommendation
  if (isObject(raw.ic_conclusion)) {
    const ic = raw.ic_conclusion;
    const conc: NonNullable<OverviewSections["ic_conclusion"]> = {};
    if (IC_RATINGS.includes(ic.rating as IcRating)) {
      conc.rating = ic.rating as IcRating;
    }
    put(conc, "bull", toLabelled(ic.bull));
    put(conc, "bear", toLabelled(ic.bear));
    put(conc, "recommendation", toLabelled(ic.recommendation));
    if (Object.keys(conc).length) out.ic_conclusion = conc;
  }

  // competitors — CLASSIFY the already-ranked names only (threat T-03-01/02):
  // tiers enum-coerced + name-filtered; matrix scores clamped 1-10, threats
  // name-filtered and capped at 3; narrative stripped to a labelled field.
  if (isObject(raw.competitors)) {
    const c = raw.competitors;
    const cmp: CompetitorsSection = {};

    // threat_tiers — keep [name, tier] only when tier is a valid enum value AND
    // the name is in the allow-list (case-insensitive; unfiltered if list empty).
    if (isObject(c.threat_tiers)) {
      const tiers: Record<string, ThreatTier> = {};
      for (const [name, tier] of Object.entries(c.threat_tiers)) {
        if (
          THREAT_TIERS.includes(tier as ThreatTier) &&
          isAllowed(name)
        ) {
          tiers[name] = tier as ThreatTier;
        }
      }
      if (Object.keys(tiers).length) cmp.threat_tiers = tiers;
    }

    // capability_matrix — coerce target, clamp each score, drop out-of-list /
    // empty-name threats, then cap the surviving threats at the first 3.
    if (isObject(c.capability_matrix)) {
      const m = c.capability_matrix;
      const rawThreats = Array.isArray(m.threats) ? m.threats : [];
      const threats: CapabilityThreat[] = rawThreats
        .filter(isObject)
        .map((t): CapabilityThreat => ({
          name: typeof t.name === "string" ? t.name : "",
          ip_depth: clampRating(t.ip_depth as number | null | undefined),
          gtm_velocity: clampRating(t.gtm_velocity as number | null | undefined),
          capital_efficiency: clampRating(
            t.capital_efficiency as number | null | undefined,
          ),
          workflow_retention: clampRating(
            t.workflow_retention as number | null | undefined,
          ),
        }))
        .filter((t) => t.name !== "" && isAllowed(t.name))
        .slice(0, 3);
      const target = typeof m.target === "string" ? m.target : "";
      if (target || threats.length) {
        cmp.capability_matrix = { target, threats };
      }
    }

    put(cmp, "narrative", toLabelled(c.narrative));

    if (Object.keys(cmp).length) out.competitors = cmp;
  }

  return out;
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
 * The structured Grok response. `sections` stays permissive at the parse boundary
 * (a nested record of unknowns) — `normalizeSections` does the shaping, clamping,
 * and guardrail filtering after parse. The LLM contributes numbers ONLY inside
 * `growth` (base/bear/bull growth RATES + confidence + rationale) and the bounded
 * 1–10 rating indicators inside `sections`; every quantitative comps input is
 * code-computed.
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

// L is the labelled-field shape reused for every narrative field.
const LABELLED =
  '{"text":string,"basis":"fact"|"estimate","confidence":"low"|"med"|"high","source":string|null}';

const ANALYSIS_SHAPE =
  '{"sections":{' +
  `"executive_summary":{"thesis":${LABELLED},"value_prop":${LABELLED},` +
  `"strengths":[${LABELLED}],"weaknesses":[${LABELLED}],"positioning":${LABELLED},` +
  `"most_likely_outcome":${LABELLED}},` +
  `"technology":{"narrative":${LABELLED},"moat_rating":integer 1-10},` +
  `"product_portfolio":${LABELLED},"vertical_customer":${LABELLED},` +
  `"business_model":${LABELLED},"unit_economics":${LABELLED},` +
  `"market_opportunity":{"tam":${LABELLED},"sam":${LABELLED},"som":${LABELLED}},` +
  '"strategic_moat":{"switching_costs":integer 1-10,"network_flywheel":integer 1-10,' +
  '"distribution_regulatory":integer 1-10,"ip":integer 1-10,' +
  `"narrative":${LABELLED}},` +
  `"historical_analogue":${LABELLED},"outlook_and_exit":${LABELLED},` +
  `"ic_conclusion":{"rating":"strong_buy"|"buy"|"hold"|"sell","bull":${LABELLED},` +
  `"bear":${LABELLED},"recommendation":${LABELLED}},` +
  '"competitors":{"threat_tiers":{"<competitor name>":"direct"|"indirect"|"emerging"},' +
  '"capability_matrix":{"target":string,"threats":[{"name":string,' +
  '"ip_depth":integer 1-10,"gtm_velocity":integer 1-10,' +
  '"capital_efficiency":integer 1-10,"workflow_retention":integer 1-10}]},' +
  `"narrative":${LABELLED}}},` +
  '"growth":{"base":number,"bear":number,"bull":number,' +
  '"confidence":"low"|"med"|"high","rationale":string}}';

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
    `1. "sections" — a narrative object with THESE keys, in this order:\n` +
    `   - executive_summary: {thesis, value_prop, strengths[], weaknesses[], ` +
    `positioning, most_likely_outcome} (each a labelled field, strengths/weaknesses ` +
    `are arrays of labelled fields).\n` +
    `   - technology: {narrative (labelled field), moat_rating: an integer 1-10 ` +
    `reflecting the durability of the technical/differentiation moat}.\n` +
    `   - product_portfolio, vertical_customer, business_model, unit_economics: ` +
    `each a single labelled field (qualitative/directional — NO fabricated ` +
    `revenue $ per product).\n` +
    `   - market_opportunity: {tam, sam, som} each a labelled field expressing a ` +
    `DIRECTIONAL range with confidence — never an asserted exact figure.\n` +
    `   - strategic_moat: {switching_costs, network_flywheel, ` +
    `distribution_regulatory, ip} each an integer 1-10, plus an optional narrative ` +
    `labelled field.\n` +
    `   - historical_analogue: a single labelled field.\n` +
    `   - outlook_and_exit: a single labelled field — narrative ONLY (likely ` +
    `strategic moves, IPO readiness, likely suitors, scenario narrative). NO ` +
    `probability fields, NO price targets.\n` +
    `   - ic_conclusion: {rating:"strong_buy"|"buy"|"hold"|"sell", bull, bear, ` +
    `recommendation} (bull/bear/recommendation each a labelled field).\n` +
    `   - competitors: {threat_tiers, capability_matrix, narrative}. Using ONLY ` +
    `the competitors listed in the grounding's "Competitor landscape", assign each ` +
    `a threat_tier — "direct" (head-on same-market rival), "indirect" ` +
    `(asymmetric/adjacent threat), or "emerging" (stealth/early-stage entrant). ` +
    `Then build a capability_matrix: {target: this company's name, threats: an ` +
    `array of the TOP 3 threats (prefer direct-tier)} where each threat is ` +
    `{name, ip_depth, gtm_velocity, capital_efficiency, workflow_retention} scored ` +
    `as integers 1-10. Add an optional narrative labelled field. HARD RULE: you ` +
    `MUST NOT invent competitor names not in the grounding's landscape list; only ` +
    `classify names you were given. The 1-10 scores are qualitative judgement, ` +
    `NOT fabricated financials.\n` +
    `   Every forward-looking narrative field MUST be an object {text, ` +
    `basis:"fact"|"estimate", confidence:"low"|"med"|"high", source?}. Label ` +
    `anything not directly attributable to the grounding as an "estimate".\n` +
    `2. "growth" — ONLY a proposed annual revenue growth-RATE scenario for this ` +
    `company: base, bear and bull as decimals (e.g. 0.3 = 30%), a confidence, and ` +
    `a one-line rationale grounded in its history/sector.\n\n` +
    `HARD RULES — you MUST NOT: invent probabilities or probability tables ` +
    `(no IPO-by-year %, no acquisition %, no scenario % splits); assert price ` +
    `targets or exact valuation figures; fabricate revenue, margins, or P&L as ` +
    `fact. Do not output any numeric valuation forecast — the comps math is done ` +
    `in code from real peer multiples, not by you. The ONLY numbers you emit are: ` +
    `the growth RATES inside "growth", and the 1-10 integer rating indicators ` +
    `(technology.moat_rating and the four strategic_moat dimensions), which are ` +
    `qualitative judgement scores — NOT fabricated financials.\n\n` +
    `SOURCE ATTRIBUTION: some grounding lines are prefixed with a real source ` +
    `tag — "Form D (SEC, source: company-goat)", "Peer XBRL (SEC, source: ` +
    `sec-edgar)", or "X post (source: x-twitter)". When you use such a fact, set ` +
    `that field's basis to "fact" and put the tag in its "source". Treat anything ` +
    `NOT backed by a tagged grounding fact as an "estimate".`
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

/** Cap on cached items per source folded into the prompt — the structured Grok
 * response is already large (11 narrative sections + the competitors matrix);
 * over-stuffing the prompt risks the completion truncating mid-object. */
const CACHED_GROUNDING_CAP = 8;

/** Render a real numeric/string field or the "?" sentinel — NEVER a fabricated
 * value. Used by summarizeCachedGrounding so an absent cached fact reads as
 * unknown rather than an invented number. */
function orUnknown(v: number | string | null | undefined): string {
  return v == null || v === "" ? "?" : String(v);
}

/**
 * Pure, source-attributed serialization of the three ingested caches (ING-05).
 * Each cached fact is a REAL, already-source-tagged row; this renders one compact
 * line per fact prefixed with its true origin — "Form D (SEC, source: <src>)",
 * "Peer XBRL (SEC, source: <src>)", "X post (source: <src>)" — so the model can
 * cite the fact by its genuine source and never conflate it with an estimate.
 *
 * Contracts (unit-tested):
 * - Missing numeric/text fields render as "?" (never a fabricated number).
 * - An empty source array omits its whole section — no empty headers, no invented
 *   placeholder facts. All three empty → "".
 * - Peer XBRL lines always carry fiscal_period so revenue is never period-ambiguous.
 * - Each source is capped at CACHED_GROUNDING_CAP items to protect the completion
 *   from truncation.
 * - Fully pure (no Supabase, no network) so it is directly unit-testable.
 */
export function summarizeCachedGrounding(cached: {
  formD: FormDRoundRow[];
  peerFin: PeerFinancialRow[];
  posts: XPostRow[];
}): string {
  const sections: string[] = [];

  const formD = cached.formD.slice(0, CACHED_GROUNDING_CAP);
  if (formD.length) {
    const lines = formD
      .map(
        (f) =>
          `- Form D (SEC, source: ${f.source}): ${orUnknown(f.subject)} raised ` +
          `${orUnknown(f.offering_amount)} on ${orUnknown(f.filing_date)}` +
          `${f.exemption ? ` (exemption ${f.exemption})` : ""}`,
      )
      .join("\n");
    sections.push(`Form D rounds (real SEC filings):\n${lines}`);
  }

  const peerFin = cached.peerFin.slice(0, CACHED_GROUNDING_CAP);
  if (peerFin.length) {
    const lines = peerFin
      .map(
        (p) =>
          `- Peer XBRL (SEC, source: ${p.source}): ${orUnknown(p.entity_name)} ` +
          `revenue ${orUnknown(p.revenue)} (${orUnknown(p.fiscal_period)})` +
          `${p.net_income != null ? `, net income ${p.net_income}` : ""}`,
      )
      .join("\n");
    sections.push(`Peer XBRL income facts (real SEC data):\n${lines}`);
  }

  const posts = cached.posts.slice(0, CACHED_GROUNDING_CAP);
  if (posts.length) {
    const lines = posts
      .map(
        (x) =>
          `- X post (source: ${x.source}): ${orUnknown(x.text)} ` +
          `(${orUnknown(x.posted_at)})`,
      )
      .join("\n");
    sections.push(`Recent X posts (real X/Twitter, news + sentiment):\n${lines}`);
  }

  return sections.join("\n\n");
}

const EMPTY_GROWTH: AnalysisValuation["growth"] = {
  base: 0,
  bear: 0,
  bull: 0,
  confidence: "low",
  rationale: "",
};

/**
 * Upper bound on the Grok completion. The response is now large (11 narrative
 * sections + the competitors capability matrix); the model's default ceiling
 * truncated it mid-object (observed JSON.parse failure at ~position 4798). Sizing
 * this generously keeps the single structured object intact so it parses.
 */
const MAX_OUTPUT_TOKENS = 16000;

/** How many times to ask Grok before giving up (1 retry — a transient
 * truncated/malformed response then self-heals without a manual re-run). */
const MAX_ATTEMPTS = 2;

/**
 * One structured Grok attempt: generate → pull the first balanced JSON object
 * (extractJson already ignores any surrounding code fences / prose / trailing
 * citations) → validate against `analysisSchema`. Returns the parsed payload, or
 * `null` on ANY soft failure — empty text, no JSON found, malformed/truncated
 * JSON (JSON.parse throw), or schema mismatch. Never throws for those; a thrown
 * error here means the network/model call itself failed and is handled by the
 * caller's retry loop.
 */
async function grokAnalysisAttempt(
  prompt: string,
): Promise<z.infer<typeof analysisSchema> | null> {
  const { text } = await generateText({
    model: xai.responses(GROK_MODEL),
    tools: { x_search: xai.tools.xSearch() },
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    prompt,
  });
  const json = extractJson(text ?? "");
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null; // malformed / truncated — caller retries, never persists garbage
  }
  const result = analysisSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

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
 * `company_analysis` row keyed on `company_id`.
 *
 * DATA-INTEGRITY GUARANTEE: the Grok call is retried once and, if it still yields
 * no usable analysis (malformed/truncated JSON, schema mismatch, or a response
 * that normalizes to zero sections), runDeepDive does NOT upsert — it returns an
 * `{ error }` so the caller can surface the failure and the previously-stored
 * analysis row is left untouched. A transient LLM hiccup can never overwrite a
 * good stored analysis with an empty one.
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

  // Step 1b — read the three ingested caches (ING-05). form_d_rounds + x_posts are
  // owner-scoped by company_id (RLS enforces per-user); peer_financials is shared
  // reference data matched to the ranked peers by entity_name (CompetitorRow carries
  // no cik/ticker). All reads degrade to [] on null/error (never throw — matches the
  // existing degrade-not-throw convention); empty caches simply add no grounding.
  const peerNames = Array.from(
    new Set(peers.map((p) => p.name).filter((n): n is string => !!n)),
  );
  const [{ data: formDData }, { data: postsData }, peerFinResult] =
    await Promise.all([
      supabase.from("form_d_rounds").select("*").eq("company_id", company.id),
      supabase
        .from("x_posts")
        .select("*")
        .eq("company_id", company.id)
        .order("posted_at", { ascending: false })
        .limit(10),
      peerNames.length
        ? supabase
            .from("peer_financials")
            .select("*")
            .in("entity_name", peerNames)
        : Promise.resolve({ data: [] as PeerFinancialRow[] }),
    ]);
  const cachedGrounding = summarizeCachedGrounding({
    formD: (formDData as FormDRoundRow[] | null) ?? [],
    peerFin: (peerFinResult.data as PeerFinancialRow[] | null) ?? [],
    posts: (postsData as XPostRow[] | null) ?? [],
  });

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

  // Step 2 — structured Grok call for the narrative + growth-rate proposal,
  // retried once. Each attempt returns null (never throws) on a soft parse/schema
  // failure; a thrown error is a hard network/model failure we log and retry.
  const inAppGrounding = summarizeGrounding(company, canonical, ranking);
  const grounding = cachedGrounding
    ? `${inAppGrounding}\n\nCACHED SOURCE-TAGGED FACTS:\n${cachedGrounding}`
    : inAppGrounding;
  const prompt =
    `${buildPrompt(grounding)}\n\n` +
    `Respond with ONLY minified JSON matching this shape — no prose, no ` +
    `markdown fences, no citations:\n${ANALYSIS_SHAPE}`;
  let data: z.infer<typeof analysisSchema> | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && !data; attempt++) {
    try {
      data = await grokAnalysisAttempt(prompt);
    } catch (e) {
      console.error("runDeepDive.grok:", (e as Error).message);
    }
  }

  let sections: OverviewSections = {};
  let growth: AnalysisValuation["growth"] = EMPTY_GROWTH;
  if (data) {
    // Ranked names (target + all peers) are the classification allow-list so
    // the model cannot inject a competitor it was never given (threat T-03-02).
    sections = normalizeSections(data.sections, ranking.map((r) => r.name));
    const g = data.growth;
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

  // DATA-INTEGRITY GUARD: bail BEFORE the upsert when the model produced no
  // usable analysis (both attempts failed, or the response normalized to zero
  // sections). Overwriting a previously-good company_analysis row with an empty
  // one on a transient LLM hiccup would destroy real work — so instead we leave
  // the existing row untouched and surface the failure to the caller/UI.
  if (Object.keys(sections).length === 0) {
    return {
      error:
        "Deep-dive generation failed: the model returned no usable analysis. " +
        "Any previously saved analysis was left unchanged — please retry.",
    };
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
      // OverviewSections is the tightened producer shape; the stored column type
      // AnalysisSections is intentionally wider (legacy open index) — a normalized
      // OverviewSections is always a valid AnalysisSections.
      sections: sections as AnalysisSections,
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
