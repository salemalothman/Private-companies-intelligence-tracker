/**
 * Shared types for the off-Vercel grounding-ingestion pipeline (Phase 04).
 *
 * These describe the contract between the entrypoint script
 * (scripts/ingest-grounding.ts), the pure CLI-envelope layer (lib/ingest/cli.ts),
 * and the per-source modules (company-goat / sec-edgar / x-twitter, Plans 03/04/05).
 *
 * No `server-only` import here: these types are consumed by both the Node script
 * and by Vitest unit tests, so they must stay runtime-agnostic.
 */

/**
 * One enumerated ingestion subject — a portfolio company or one of its
 * competitors. `subject` is the human name used for ticker/handle lookups;
 * `domain` (when derivable from a company website) feeds company-goat.
 */
export interface IngestTarget {
  companyId: string;
  userId: string;
  subject: string;
  kind: "company" | "competitor";
  domain?: string;
}

/**
 * A per-source run result. `status` distinguishes a clean skip (missing
 * binary/auth) from a partial run (some rows failed) and a full success.
 */
export interface SourceSummary {
  source: string;
  upserted: number;
  skipped: number;
  status: "success" | "partial" | "skipped";
  detail?: string;
}

/**
 * The parsed `{meta, results}` envelope emitted by a pp-cli in `--agent` mode.
 * `ok:false` carries an `error` string and is returned (never thrown) for every
 * malformed / non-object / missing-binary case, so callers can skip cleanly.
 * `results` stays `unknown` — it may be an array or an object and is validated
 * by the per-source module that consumes it.
 */
export interface Envelope {
  ok: boolean;
  meta?: Record<string, unknown>;
  results?: unknown;
  error?: string;
}

/**
 * The outcome of CIK disambiguation. A resolved single CIK is a bare string;
 * an ambiguous result carries the candidate CIKs so the caller re-queries by
 * `--cik <id>` and never trusts a name-fragment amount.
 */
export type CikResolution = string | { ambiguous: true; candidates: string[] };

/**
 * The dispatch contract each per-source module (Plans 03/04/05) implements.
 * Takes the service-role admin client + the enumerated targets, returns a
 * SourceSummary. `SupabaseClient<Database>` is left to the module's own import
 * so this types file has no `server-only` / supabase coupling.
 */
export type SourceModule<Admin> = (
  admin: Admin,
  targets: IngestTarget[],
) => Promise<SourceSummary>;
