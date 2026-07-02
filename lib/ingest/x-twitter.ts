/**
 * x-twitter source module (Phase 04, Plan 05).
 *
 * Opt-in on X_BEARER_TOKEN (paid per-read). Preflight the `doctor` app-only lane,
 * then sync company + competitor posts READ-ONLY via the app-only bearer lane and
 * idempotently upsert source-tagged rows into `x_posts` on the natural key
 * (company_id, post_id) — the news/sentiment grounding runDeepDive (Plan 06) cites.
 *
 * NO `server-only` import at module top: the pure helpers (appOnlyLaneReady,
 * mapTweetsResult) must run under Vitest in plain Node. The impure dispatch
 * (`ingestXTwitter` / `runXTwitter`) shells out to the local binary and is only
 * ever called from scripts/ingest-grounding.ts (off-Vercel).
 *
 * SECURITY:
 *  - T-04-15 (secrets): X_BEARER_TOKEN is read via requireEnv, passed through the
 *    child env only, and NEVER logged. Absent → clean skip.
 *  - T-04-16 (privilege / write): a single allowlist of READ subcommands builds
 *    every CLI call; no post/reply/quote/like string appears anywhere in the file.
 *  - T-04-17 (DoS/cost): opt-in on X_BEARER_TOKEN + doctor preflight, a bounded
 *    `--since` window, and a per-target try/catch so one target never aborts the run.
 *  - T-04-18 (privilege / upsert): the service-role client bypasses RLS, so every
 *    upserted row carries user_id/company_id from the enumerated target (owner-scoped).
 *  - No field is fabricated — absent tweet fields map to null (never 0/"").
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { hasBinary, requireEnv, runAgentCli } from "@/lib/ingest/cli";
import type {
  Envelope,
  IngestTarget,
  SourceSummary,
} from "@/lib/ingest/types";
import type { Database, XPostInsert } from "@/lib/types";

const SOURCE = "x-twitter";
const BIN = "x-twitter-pp-cli";
const BEARER_ENV = "X_BEARER_TOKEN";

/**
 * The recent window synced per target. Bounded on purpose (T-04-17): X bills
 * reads per-use, so a short, fixed window caps the paid-read cost of every run.
 */
const SINCE_WINDOW = "14d";

/**
 * READ-ONLY subcommand allowlist (T-04-16). Every runAgentCli invocation in this
 * module is built from a member of this set — no post/reply/quote/like string
 * appears anywhere in the file, so the module can only ever READ from X.
 */
const READ_SUBCOMMANDS = ["doctor", "sync", "recent-search"] as const;
type ReadSubcommand = (typeof READ_SUBCOMMANDS)[number];

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** String field, else null (empty string is treated as absent). */
function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

/** Tweet id as a string (numeric ids are coerced), else null. */
function idOrNull(v: unknown): string | null {
  if (typeof v === "string" && v.length > 0) return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/**
 * Gate on the app-only lane of a `doctor --agent` result. True only when
 * `auth_lanes.app_only_api.status` is present AND not "missing" (e.g. "confirmed"
 * / "ok"). A non-object result, an absent lane, or a "missing" status → false, so
 * the source skips cleanly rather than attempting a paid read without a token.
 * Pure + throw-free.
 */
export function appOnlyLaneReady(doctorResult: unknown): boolean {
  if (!isPlainObject(doctorResult)) return false;
  const lanes = doctorResult.auth_lanes;
  if (!isPlainObject(lanes)) return false;
  const lane = lanes.app_only_api;
  if (!isPlainObject(lane)) return false;
  const status = strOrNull(lane.status);
  return status !== null && status !== "missing";
}

/**
 * Pull the tweets array out of a sync result, tolerating the shapes the CLI may
 * emit: a bare array, `{tweets:[...]}`, or `{results:[...]}` / `{posts:[...]}`.
 */
function extractTweets(result: unknown): Record<string, unknown>[] {
  let arr: unknown;
  if (Array.isArray(result)) arr = result;
  else if (isPlainObject(result)) {
    arr = result.tweets ?? result.posts ?? result.results;
  }
  if (!Array.isArray(arr)) return [];
  return arr.filter(isPlainObject);
}

/** The envelope-level handle for the synced subject, when present. */
function extractHandle(result: unknown): string | null {
  if (!isPlainObject(result)) return null;
  return strOrNull(result.handle);
}

/**
 * Map an x-twitter `sync --resources tweets` result to XPostInsert[] for one
 * target. Pure + throw-free.
 *
 * Rules:
 *  - Each tweet → one row; post_id is the tweet id (required — rows without an id
 *    are DROPPED; the id is the natural-key anchor and is never fabricated).
 *  - text/author/posted_at/url are read where present, null when absent (never
 *    fabricated); metrics defaults to {} when absent.
 *  - Empty / non-object results → [].
 *
 * Every emitted row is owner-scoped (company_id/user_id from the target) and
 * source-tagged (source='x-twitter', fetched_at, subject, handle).
 */
export function mapTweetsResult(
  result: unknown,
  target: IngestTarget,
): XPostInsert[] {
  const tweets = extractTweets(result);
  if (tweets.length === 0) return [];

  const fetchedAt = new Date().toISOString();
  const handle = extractHandle(result);
  const rows: XPostInsert[] = [];

  for (const tweet of tweets) {
    // post_id is the natural-key anchor — drop tweets without an id.
    const postId = idOrNull(tweet.id) ?? idOrNull(tweet.post_id);
    if (!postId) continue;

    const metrics =
      isPlainObject(tweet.metrics) ? tweet.metrics
      : isPlainObject(tweet.public_metrics) ? tweet.public_metrics
      : {};

    rows.push({
      company_id: target.companyId,
      user_id: target.userId,
      subject: target.subject,
      handle,
      post_id: postId,
      text: strOrNull(tweet.text),
      author: strOrNull(tweet.author),
      posted_at:
        strOrNull(tweet.created_at) ?? strOrNull(tweet.posted_at),
      url: strOrNull(tweet.url),
      metrics,
      source: SOURCE,
      fetched_at: fetchedAt,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Impure dispatch — only called from scripts/ingest-grounding.ts (off-Vercel).
//
// NO `import "server-only"` here: this file's pure helpers (appOnlyLaneReady,
// mapTweetsResult) are loaded by Vitest in plain Node, and `server-only` throws
// outside a React-Server bundle — it would break the unit tests. The module is
// kept off app/ runtime by convention (only the local script imports it), the
// same way company-goat.ts and sec-edgar.ts are.
// ---------------------------------------------------------------------------

type Admin = SupabaseClient<Database>;

/**
 * Build the child env carrying the paid bearer token. The VALUE is passed through
 * to execFile only and is NEVER logged (T-04-15).
 */
function buildEnv(bearer: string): Record<string, string | undefined> {
  return { ...process.env, [BEARER_ENV]: bearer };
}

/**
 * Run a READ-ONLY x-twitter subcommand. `sub` is constrained to the allowlist at
 * the type level so no write subcommand can ever be constructed here (T-04-16).
 */
function runRead(
  sub: ReadSubcommand,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<Envelope> {
  return runAgentCli(BIN, [sub, ...args], { env });
}

/**
 * ingestXTwitter — the SourceModule dispatch for x-twitter (opt-in, read-only).
 *
 * Preflight, in order (any failure → clean "skipped", never an error):
 *  1. X_BEARER_TOKEN present — absent means opt-out (paid per-read), skip.
 *  2. x-twitter-pp-cli on PATH — absent → skip.
 *  3. `doctor` app-only lane usable (appOnlyLaneReady) — not ready → skip.
 *
 * For each target: `sync --resources tweets --since <window>` scoped by the
 * subject (READ-ONLY — only allowlisted subcommands), map via mapTweetsResult,
 * and idempotently upsert on (company_id, post_id) with user_id from the target
 * (service-role bypasses RLS — writes are owner-scoped, T-04-18). Per target is
 * try/catch-guarded so one target never aborts the run.
 */
export async function ingestXTwitter(
  admin: Admin,
  targets: IngestTarget[],
): Promise<SourceSummary> {
  // 1. Opt-in: the paid bearer token must be present.
  const bearer = requireEnv(BEARER_ENV);
  if (!bearer) {
    return {
      source: SOURCE,
      upserted: 0,
      skipped: targets.length,
      status: "skipped",
      detail: `${BEARER_ENV} not set (opt-in)`,
    };
  }

  // 2. Binary must be on PATH.
  if (!(await hasBinary(BIN))) {
    return {
      source: SOURCE,
      upserted: 0,
      skipped: targets.length,
      status: "skipped",
      detail: "binary not on PATH",
    };
  }

  const env = buildEnv(bearer);

  // 3. Preflight the app-only lane via doctor.
  const doctor = await runRead("doctor", [], env);
  if (!appOnlyLaneReady(doctor.results)) {
    return {
      source: SOURCE,
      upserted: 0,
      skipped: targets.length,
      status: "skipped",
      detail: "app-only api lane not available",
    };
  }

  let upserted = 0;
  let skipped = 0;
  let hadError = false;

  for (const target of targets) {
    try {
      // READ-ONLY sync of recent tweets for this subject, bounded window.
      const sync = await runRead(
        "sync",
        [
          "--resources",
          "tweets",
          "--since",
          SINCE_WINDOW,
          "--query",
          target.subject,
        ],
        env,
      );
      if (!sync.ok) {
        skipped++;
        continue;
      }

      const rows = mapTweetsResult(sync.results, target);
      if (rows.length === 0) {
        skipped++;
        continue;
      }

      // Idempotent, owner-scoped upsert on the (company_id, post_id) natural key.
      const { error } = await admin
        .from("x_posts")
        .upsert(rows, { onConflict: "company_id,post_id" });
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
 * `runXTwitter`. Kept in sync with the SourceModule contract.
 */
export const runXTwitter = ingestXTwitter;
