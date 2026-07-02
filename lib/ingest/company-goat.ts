/**
 * company-goat source module (Phase 04, Plan 03).
 *
 * For every enumerated target with a domain, fetch SEC Form D rounds + startup
 * signals via `company-goat-pp-cli`, apply MANDATORY CIK disambiguation, and
 * idempotently upsert source-tagged rows into `form_d_rounds`.
 *
 * NO `server-only` import at module top: the pure helpers (mapFundingResult,
 * needsCikRequery) must run under Vitest in plain Node. The impure dispatch
 * (`ingestCompanyGoat` / `runCompanyGoat`) shells out to the local binary and is
 * only ever called from scripts/ingest-grounding.ts (off-Vercel).
 *
 * SECURITY:
 *  - T-04-08 (fabrication): ambiguous name-fragment amounts are NEVER cached.
 *    `mapFundingResult` returns [] when the result is ambiguous; the caller must
 *    re-query `funding --cik <id>` (single candidate) or skip (multiple/none).
 *    SPV/fund-vehicle filers are excluded (reused sec-edgar heuristic).
 *  - T-04-09 (privilege): the service-role client bypasses RLS, so every upserted
 *    row carries user_id/company_id from the enumerated target (owner-scoped).
 *  - T-04-10 (secrets): COMPANY_PP_CONTACT_EMAIL / GITHUB_TOKEN are read via
 *    requireEnv and passed through the child env only — never logged.
 *  - Real Form D figures stay nullable — absent numerics map to null, never 0.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  hasBinary,
  requireEnv,
  resolveCik,
  runAgentCli,
} from "@/lib/ingest/cli";
import type {
  Envelope,
  IngestTarget,
  SourceSummary,
} from "@/lib/ingest/types";
import type { Database, FormDRoundInsert } from "@/lib/types";

const SOURCE = "company-goat";
const BIN = "company-goat-pp-cli";

/**
 * SPV / fund-vehicle exclusion — a filer named after the company but formed as a
 * pooled investment vehicle is NOT the company's own raise. Reused verbatim from
 * lib/connectors/sec-edgar.ts (searchFormD, ~L50).
 */
const SPV_RE = /\bspv\b|\bfund\b|a series of/i;

/** Company-name normalization (reused from sec-edgar.ts) for candidate matching. */
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Coerce a possibly-string/number field to a finite number, else null. NEVER
 * defaults to 0 — an absent or unparseable Form D amount stays null so nothing
 * is fabricated (CLAUDE.md data-integrity constraint).
 */
function numOrNull(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** String field, else null (empty string is treated as absent). */
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** CIK as a string (numeric CIKs are coerced), else null. */
function cikOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number") return String(v);
  return null;
}

/**
 * Pull the rounds array out of a funding result, tolerating the shapes the CLI
 * may emit: a bare array, `{rounds:[...]}`, or `{filings:[...]}`.
 */
function extractRounds(result: unknown): Record<string, unknown>[] {
  let arr: unknown;
  if (Array.isArray(result)) arr = result;
  else if (isPlainObject(result)) arr = result.rounds ?? result.filings;
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPlainObject);
}

/**
 * When a funding result is ambiguous (multiple CIKs match a name fragment),
 * return the candidate CIKs so the caller re-queries `funding --cik <id>`.
 * Returns [] when the result resolves to a single CIK (safe to trust) OR when
 * it is ambiguous with no usable candidates (caller must skip — never cache).
 * Pure + throw-free.
 */
export function needsCikRequery(result: unknown): string[] {
  if (!isPlainObject(result)) return [];
  const res = resolveCik(result);
  if (typeof res === "string") return [];
  return res.candidates;
}

/**
 * Map a company-goat funding result to FormDRoundInsert[] for one target. Pure +
 * throw-free.
 *
 * Guards, in order:
 *  1. Ambiguous result → [] (caller must re-query by CIK; no name-fragment
 *     amount is ever cached). This is the T-04-08 mitigation.
 *  2. Non-object / empty results → [].
 *  3. Per round: SPV/fund filers excluded; rounds with no accession dropped
 *     (accession is the natural-key anchor and is never fabricated); numeric
 *     fields null when absent (never 0).
 *
 * Every emitted row is owner-scoped (company_id/user_id from the target) and
 * source-tagged (source='company-goat', fetched_at, cik/subject).
 */
export function mapFundingResult(
  result: unknown,
  target: IngestTarget,
): FormDRoundInsert[] {
  // Guard 1: ambiguous → never trust a name-fragment amount (T-04-08).
  if (isPlainObject(result) && needsCikRequery(result).length > 0) return [];
  if (isPlainObject(result) && result.is_ambiguous === true) return [];

  const rounds = extractRounds(result);
  if (rounds.length === 0) return [];

  const fetchedAt = new Date().toISOString();
  const subjectNorm = norm(target.subject);
  const rows: FormDRoundInsert[] = [];

  for (const round of rounds) {
    // Guard 3a: SPV / fund vehicle → not the company's own raise.
    const filer =
      strOrNull(round.filer_name) ??
      strOrNull(round.name) ??
      strOrNull(round.entity_name);
    if (filer && SPV_RE.test(filer)) continue;
    // Reject a filer that plainly does not correspond to the subject (fuzzy
    // false-positive guard from sec-edgar); accept when either name is a prefix
    // of the other, or when no filer name is provided (trust the CIK path).
    if (filer) {
      const f = norm(filer);
      if (!f.startsWith(subjectNorm) && !subjectNorm.startsWith(f)) continue;
    }

    // Guard 3b: accession is the natural-key anchor — drop rounds without one.
    const accession = strOrNull(round.accession);
    if (!accession) continue;

    rows.push({
      company_id: target.companyId,
      user_id: target.userId,
      subject: target.subject,
      cik: cikOrNull(round.cik),
      accession,
      offering_amount: numOrNull(round.offering_amount),
      amount_sold: numOrNull(round.amount_sold),
      filing_date: strOrNull(round.filing_date),
      exemption: strOrNull(round.exemption),
      related_persons: Array.isArray(round.related_persons)
        ? round.related_persons
        : [],
      signals: {},
      source: SOURCE,
      source_url: strOrNull(round.source_url),
      fetched_at: fetchedAt,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Impure dispatch — only called from scripts/ingest-grounding.ts (off-Vercel).
// ---------------------------------------------------------------------------

type Admin = SupabaseClient<Database>;

/** Read the optional per-source secrets and build the child env (never logged). */
function buildEnv(): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = { ...process.env };
  const contact = requireEnv("COMPANY_PP_CONTACT_EMAIL");
  const gh = requireEnv("GITHUB_TOKEN");
  if (contact) env.COMPANY_PP_CONTACT_EMAIL = contact;
  if (gh) env.GITHUB_TOKEN = gh;
  return env;
}

/** The `results` payload of an envelope as a plain object (for disambiguation). */
function resultObject(env: Envelope): Record<string, unknown> | null {
  if (!env.ok) return null;
  return isPlainObject(env.results) ? env.results : null;
}

/**
 * Choose the candidate CIK whose entity name best matches the target subject.
 * Returns the single candidate when there is exactly one; when several, prefers
 * the one whose cik_summaries name normalizes to a prefix of / from the subject;
 * returns null when nothing matches (caller then skips — never caches an
 * ambiguous amount).
 */
function pickCik(
  result: Record<string, unknown>,
  candidates: string[],
  subject: string,
): string | null {
  if (candidates.length === 1) return candidates[0];
  const summaries = Array.isArray(result.cik_summaries)
    ? result.cik_summaries
    : [];
  const s = norm(subject);
  for (const summary of summaries) {
    if (!isPlainObject(summary)) continue;
    const cik = cikOrNull(summary.cik);
    const name = strOrNull(summary.name);
    if (!cik || !candidates.includes(cik) || !name) continue;
    const n = norm(name);
    if (n.startsWith(s) || s.startsWith(n)) return cik;
  }
  return null;
}

/**
 * Merge snapshot signals (github/HN/legitimacy) into a jsonb blob. Best-effort:
 * a failed / malformed snapshot yields {} and never throws out of the loop.
 */
async function fetchSignals(
  domain: string,
  env: Record<string, string | undefined>,
): Promise<Record<string, unknown>> {
  const snap = await runAgentCli(BIN, ["snapshot", "--domain", domain], { env });
  const obj = resultObject(snap);
  if (obj && isPlainObject(obj.signals)) return obj.signals;
  return obj ?? {};
}

/**
 * ingestCompanyGoat — the SourceModule dispatch for company-goat.
 *
 * Preflight: if the binary is absent, skip cleanly. For each target with a
 * domain: fetch funding, apply MANDATORY CIK disambiguation (re-query by --cik
 * for a single candidate, pick-by-name for several, skip otherwise), map to
 * rows, merge snapshot signals, and idempotently upsert on
 * (company_id, subject, accession) with user_id set from the target. Never
 * throws out of the per-target loop.
 */
export async function ingestCompanyGoat(
  admin: Admin,
  targets: IngestTarget[],
): Promise<SourceSummary> {
  if (!(await hasBinary(BIN))) {
    return {
      source: SOURCE,
      upserted: 0,
      skipped: targets.length,
      status: "skipped",
      detail: "binary not on PATH",
    };
  }

  const env = buildEnv();
  let upserted = 0;
  let skipped = 0;
  let hadError = false;

  for (const target of targets) {
    if (!target.domain) {
      skipped++;
      continue;
    }

    try {
      // 1. Funding by domain.
      const funding = await runAgentCli(
        BIN,
        ["funding", "--domain", target.domain],
        { env },
      );
      if (!funding.ok) {
        skipped++;
        continue;
      }

      // 2. MANDATORY CIK disambiguation.
      let resultForMap: unknown = funding.results;
      const initial = resultObject(funding);
      if (initial) {
        const candidates = needsCikRequery(initial);
        if (candidates.length > 0) {
          const cik = pickCik(initial, candidates, target.subject);
          if (!cik) {
            // Ambiguous and no confident match — skip (never cache an amount).
            skipped++;
            continue;
          }
          const requeried = await runAgentCli(
            BIN,
            ["funding", "--cik", cik],
            { env },
          );
          if (!requeried.ok) {
            skipped++;
            continue;
          }
          resultForMap = requeried.results;
        }
      }

      // 3. Map to rows (still returns [] if the re-query is somehow ambiguous).
      const rows = mapFundingResult(resultForMap, target);
      if (rows.length === 0) {
        skipped++;
        continue;
      }

      // 4. Merge snapshot signals (best-effort).
      const signals = await fetchSignals(target.domain, env);
      if (Object.keys(signals).length > 0) {
        for (const row of rows) row.signals = signals;
      }

      // 5. Idempotent, owner-scoped upsert.
      const { error } = await admin
        .from("form_d_rounds")
        .upsert(rows, { onConflict: "company_id,subject,accession" });
      if (error) {
        hadError = true;
        skipped++;
        continue;
      }

      upserted += rows.length;
    } catch {
      // Never let one target abort the run.
      hadError = true;
      skipped++;
    }
  }

  return {
    source: SOURCE,
    upserted,
    skipped,
    status: hadError ? "partial" : "success",
  };
}

/**
 * Dispatch alias — scripts/ingest-grounding.ts imports the module by the name
 * `runCompanyGoat`. Kept in sync with the SourceModule contract.
 */
export const runCompanyGoat = ingestCompanyGoat;
