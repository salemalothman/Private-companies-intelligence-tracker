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
import type { IngestTarget } from "@/lib/ingest/types";
import type { XPostInsert } from "@/lib/types";

const SOURCE = "x-twitter";

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
