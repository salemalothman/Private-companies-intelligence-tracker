/**
 * sec-edgar source module (Phase 04, Plan 04).
 *
 * Resolve public competitors to a CIK via `sec-edgar-pp-cli companies lookup`,
 * pull their XBRL income-statement facts (`facts statement --kind income`) plus a
 * peer-revenue `cross-section`, and idempotently upsert source-tagged rows into
 * `peer_financials` on the natural key (cik, fiscal_period).
 *
 * NO `server-only` import at module top: the pure helpers (mapStatementResult,
 * mapCrossSection) must run under Vitest in plain Node. The impure dispatch
 * (`ingestSecEdgar` / `runSecEdgar`) shells out to the local binary and is only
 * ever called from scripts/ingest-grounding.ts (off-Vercel).
 *
 * SECURITY:
 *  - T-04-11 (fabrication): only us-gaap tags actually present are stored, as
 *    null-not-zero. Private portfolio targets resolve to no CIK and are skipped —
 *    never fabricated. XBRL exists only for PUBLIC companies.
 *  - T-04-12 (secrets): SEC_EDGAR_USER_AGENT is read via requireEnv, passed
 *    through the child env only, and NEVER logged.
 *  - T-04-13 (DoS/rate-limit): the user-agent is preflighted (SEC requirement);
 *    each target is try/catch-guarded so a 403/429 skips one peer, not the run.
 *  - T-04-14 (injection): every DB-derived arg (subject, ticker, cik) flows into
 *    runAgentCli → execFile as a discrete array element, never a shell string.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasBinary, requireEnv, runAgentCli } from "@/lib/ingest/cli";
import type {
  Envelope,
  IngestTarget,
  SourceSummary,
} from "@/lib/ingest/types";
import type { Database, PeerFinancialRow } from "@/lib/types";

// PeerFinancialInsert is not exported from lib/types.ts (it is inlined into the
// Database Insert map). Derive the insert shape from the Row: every column is
// optional except the two natural-key anchors (cik, fiscal_period), and the
// db-generated columns are omitted.
type PeerFinancialInsert = Partial<
  Omit<PeerFinancialRow, "id" | "created_at">
> & {
  cik: string;
  fiscal_period: string;
};

const SOURCE = "sec-edgar";
const BIN = "sec-edgar-pp-cli";
const USER_AGENT_ENV = "SEC_EDGAR_USER_AGENT";

/**
 * us-gaap income tags, in preference order per metric. Revenue is the canonical
 * `Revenues`, falling back to the contract-revenue tag ONLY when Revenues is
 * absent — the two are never summed (that would fabricate a figure, T-04-11).
 */
const REVENUE_TAGS = [
  "us-gaap:Revenues",
  "us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax",
] as const;
const NET_INCOME_TAGS = ["us-gaap:NetIncomeLoss"] as const;
const GROSS_PROFIT_TAGS = ["us-gaap:GrossProfit"] as const;
const OPERATING_INCOME_TAGS = ["us-gaap:OperatingIncomeLoss"] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Coerce a possibly-string/number field to a finite number, else null. NEVER
 * defaults to 0 — an absent or unparseable XBRL fact stays null so nothing is
 * fabricated (CLAUDE.md data-integrity constraint).
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
 * First present us-gaap tag from a preference-ordered list → number-or-null. The
 * preference order encodes "prefer canonical, fall back only when absent"; tags
 * are never summed. A tag present but unparseable maps to null (never 0).
 */
function pickTag(
  period: Record<string, unknown>,
  tags: readonly string[],
): number | null {
  for (const tag of tags) {
    if (tag in period) return numOrNull(period[tag]);
  }
  return null;
}

/** The period array of a facts-statement result, tolerating shape drift. */
function extractPeriods(result: unknown): Record<string, unknown>[] {
  let arr: unknown;
  if (Array.isArray(result)) arr = result;
  else if (isPlainObject(result)) arr = result.periods ?? result.facts;
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPlainObject);
}

/**
 * Map a `facts statement --kind income` result to PeerFinancialInsert[] — one
 * row per fiscal_period. Pure + throw-free.
 *
 * Rules:
 *  - Each period → one row; revenue/net_income/gross_profit/operating_income are
 *    read from the us-gaap tags PRESENT for that period, null when absent (never
 *    0, never carried from another period).
 *  - A period with no fiscal_period label is dropped (natural-key anchor).
 *  - Empty / non-object results → [].
 *
 * `ctx` supplies the identity (cik/ticker/entityName) resolved by the caller;
 * ctx.cik takes precedence over any cik echoed inside the result payload.
 */
export function mapStatementResult(
  result: unknown,
  ctx: { cik: string; ticker?: string | null; entityName?: string | null },
): PeerFinancialInsert[] {
  const periods = extractPeriods(result);
  if (periods.length === 0) return [];

  const fetchedAt = new Date().toISOString();
  const currency =
    isPlainObject(result) ? strOrNull(result.currency) : null;
  const entityName =
    strOrNull(ctx.entityName) ??
    (isPlainObject(result) ? strOrNull(result.entity_name) : null);
  const sourceUrl = isPlainObject(result) ? strOrNull(result.source_url) : null;

  const rows: PeerFinancialInsert[] = [];
  for (const period of periods) {
    // fiscal_period is the natural-key anchor — never fabricate it.
    const fiscalPeriod =
      strOrNull(period.fiscal_period) ??
      strOrNull(period.period) ??
      strOrNull(period.fy);
    if (!fiscalPeriod) continue;

    rows.push({
      cik: ctx.cik,
      ticker: strOrNull(ctx.ticker),
      entity_name: entityName,
      fiscal_period: fiscalPeriod,
      revenue: pickTag(period, REVENUE_TAGS),
      net_income: pickTag(period, NET_INCOME_TAGS),
      gross_profit: pickTag(period, GROSS_PROFIT_TAGS),
      operating_income: pickTag(period, OPERATING_INCOME_TAGS),
      currency: strOrNull(period.currency) ?? currency,
      source: SOURCE,
      source_url: sourceUrl,
      fetched_at: fetchedAt,
    });
  }

  return rows;
}

/** The peer rows of a cross-section result, tolerating shape drift. */
function extractCrossRows(result: unknown): Record<string, unknown>[] {
  let arr: unknown;
  if (Array.isArray(result)) arr = result;
  else if (isPlainObject(result)) arr = result.rows ?? result.peers;
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPlainObject);
}

/**
 * Map a `cross-section --tag us-gaap:Revenues` pivot to PeerFinancialInsert[].
 * Each peer row carries a `values` map of fiscal_period → revenue; this flattens
 * it to one row per (cik, fiscal_period). Pure + throw-free.
 *
 * Rules:
 *  - A peer with no cik (the natural-key anchor) is dropped, not cached.
 *  - A period whose revenue is null/unparseable is dropped, never zeroed
 *    (T-04-11 — no fabricated figures).
 *  - Empty / non-object results → [].
 */
export function mapCrossSection(result: unknown): PeerFinancialInsert[] {
  const peers = extractCrossRows(result);
  if (peers.length === 0) return [];

  const fetchedAt = new Date().toISOString();
  const rows: PeerFinancialInsert[] = [];

  for (const peer of peers) {
    const cik = cikOrNull(peer.cik);
    if (!cik) continue; // no natural-key anchor → skip (never cache)

    const ticker = strOrNull(peer.ticker);
    const entityName = strOrNull(peer.entity_name) ?? strOrNull(peer.name);
    const values = isPlainObject(peer.values) ? peer.values : {};

    for (const [fiscalPeriod, raw] of Object.entries(values)) {
      if (!fiscalPeriod) continue;
      const revenue = numOrNull(raw);
      if (revenue === null) continue; // null/unparseable → drop (never zero)
      rows.push({
        cik,
        ticker,
        entity_name: entityName,
        fiscal_period: fiscalPeriod,
        revenue,
        source: SOURCE,
        fetched_at: fetchedAt,
      });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Impure dispatch — only called from scripts/ingest-grounding.ts (off-Vercel).
// ---------------------------------------------------------------------------

type Admin = SupabaseClient<Database>;

/**
 * Build the child env carrying the SEC user-agent. The value is passed through
 * only — never logged (T-04-12).
 */
function buildEnv(userAgent: string): Record<string, string | undefined> {
  return { ...process.env, [USER_AGENT_ENV]: userAgent };
}

/** The `results` payload of an envelope as a plain object, else null. */
function resultObject(env: Envelope): Record<string, unknown> | null {
  if (!env.ok) return null;
  return isPlainObject(env.results) ? env.results : null;
}

/**
 * Resolve a target to its public-company identity via `companies lookup`.
 * Returns { cik, ticker?, entityName? } for a public peer, or null when the
 * subject has no XBRL identity (the expected private-target path — NOT an error).
 * Never throws.
 */
async function resolveIdentity(
  subject: string,
  env: Record<string, string | undefined>,
): Promise<{ cik: string; ticker: string | null; entityName: string | null } | null> {
  const lookup = await runAgentCli(BIN, ["companies", "lookup", subject], {
    env,
  });
  const obj = resultObject(lookup);
  if (!obj) return null;
  const cik = cikOrNull(obj.cik);
  if (!cik) return null; // private company / no match → skip cleanly
  return {
    cik,
    ticker: strOrNull(obj.ticker),
    entityName: strOrNull(obj.entity_name) ?? strOrNull(obj.name),
  };
}

/**
 * ingestSecEdgar — the SourceModule dispatch for sec-edgar.
 *
 * Preflight: the binary must be on PATH AND SEC_EDGAR_USER_AGENT must be set
 * (without it the CLI 403s). Either missing → clean "skipped".
 *
 * Only competitors are candidate public peers (portfolio companies are private
 * and have no XBRL). For each candidate: resolve to a CIK (private → skip,
 * counted, not an error); pull income facts; upsert on (cik, fiscal_period).
 * A final cross-section over the resolved tickers backfills peer revenue. Per
 * target is try/catch-guarded so a rate-limit on one peer never aborts the run.
 */
export async function ingestSecEdgar(
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

  const userAgent = requireEnv(USER_AGENT_ENV);
  if (!userAgent) {
    return {
      source: SOURCE,
      upserted: 0,
      skipped: targets.length,
      status: "skipped",
      detail: `${USER_AGENT_ENV} not set — SEC requires a contact user-agent`,
    };
  }

  const env = buildEnv(userAgent);
  let upserted = 0;
  let skipped = 0;
  let hadError = false;
  const resolvedTickers: string[] = [];

  // Only competitors are candidate public peers.
  const candidates = targets.filter((t) => t.kind === "competitor");
  skipped += targets.length - candidates.length; // portfolio companies: private

  for (const target of candidates) {
    try {
      const identity = await resolveIdentity(target.subject, env);
      if (!identity) {
        // No CIK — the expected private-target path. Skip and count, NOT error.
        skipped++;
        continue;
      }
      if (identity.ticker) resolvedTickers.push(identity.ticker);

      const facts = await runAgentCli(
        BIN,
        ["facts", "statement", "--cik", identity.cik, "--kind", "income", "--periods", "last4"],
        { env },
      );
      if (!facts.ok) {
        skipped++;
        continue;
      }

      const rows = mapStatementResult(facts.results, {
        cik: identity.cik,
        ticker: identity.ticker,
        entityName: identity.entityName,
      });
      if (rows.length === 0) {
        skipped++;
        continue;
      }

      const { error } = await admin
        .from("peer_financials")
        .upsert(rows, { onConflict: "cik,fiscal_period" });
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

  // Optional cross-section revenue backfill over the resolved public tickers.
  if (resolvedTickers.length > 0) {
    try {
      const uniqueTickers = Array.from(new Set(resolvedTickers));
      const cross = await runAgentCli(
        BIN,
        [
          "cross-section",
          "--tag",
          "us-gaap:Revenues",
          "--ticker",
          uniqueTickers.join(","),
          "--periods",
          "last8",
        ],
        { env },
      );
      if (cross.ok) {
        const crossRows = mapCrossSection(cross.results);
        if (crossRows.length > 0) {
          const { error } = await admin
            .from("peer_financials")
            .upsert(crossRows, { onConflict: "cik,fiscal_period" });
          if (error) hadError = true;
          else upserted += crossRows.length;
        }
      }
    } catch {
      hadError = true;
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
 * `runSecEdgar`. Kept in sync with the SourceModule contract.
 */
export const runSecEdgar = ingestSecEdgar;
