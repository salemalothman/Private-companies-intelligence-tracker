/**
 * Pure + impure helpers for running a Printing Press CLI in `--agent` mode and
 * parsing its output. Off-Vercel only (invoked by scripts/ingest-grounding.ts).
 *
 * NO `server-only` import: the pure functions (parseEnvelope, resolveCik) must
 * run under Vitest in plain Node. The impure runner (runAgentCli) shells out to
 * local binaries and is only ever called from the local/cron script.
 *
 * SECURITY — command-injection boundary (threat T-04-04):
 *   Every argument derived from DB values (domain, ticker, subject, cik) flows
 *   into `execFile` as a DISCRETE ARRAY ELEMENT — never interpolated into a
 *   shell string. `execFile` does NOT spawn a shell, so shell metacharacters in
 *   an adversarial domain/name value are inert. Do NOT switch to `exec`.
 *
 * SECURITY — untrusted CLI output (threat T-04-05):
 *   pp-cli stdout is untrusted. parseEnvelope validates object shape, uses only
 *   JSON.parse (never eval/Function), and NEVER throws — malformed output yields
 *   a typed `{ok:false}` skip.
 */
import { execFile, type ExecFileException } from "node:child_process";
import type { CikResolution, Envelope } from "@/lib/ingest/types";

/**
 * The expansion of `--agent`: the five flags that put a pp-cli into
 * machine-readable, non-interactive mode. Order is fixed so it is assertable.
 */
export const AGENT_FLAGS: readonly string[] = [
  "--json",
  "--compact",
  "--no-input",
  "--no-color",
  "--yes",
] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Balanced-brace extractor (adapted from lib/agents/deep-dive.ts `extractJson`).
 * Returns the substring of the first top-level `{...}` object, tolerating prose
 * before/after it and braces that appear inside JSON strings. Returns null when
 * no balanced object is found.
 */
function extractJsonObject(s: string): string | null {
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
 * Parse a pp-cli `--agent` `{meta, results}` envelope from stdout. Pure and
 * throw-free: any malformed / non-object / missing input returns `{ok:false}`.
 * The envelope MUST be a JSON object (a bare array or number is rejected —
 * `results` has to live under a key so callers can distinguish meta from data).
 */
export function parseEnvelope(stdout: string): Envelope {
  const json = extractJsonObject(stdout ?? "");
  if (json == null) {
    return { ok: false, error: "no JSON object found in CLI output" };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    return { ok: false, error: `envelope JSON parse failed: ${String(e)}` };
  }
  if (!isPlainObject(parsed)) {
    return { ok: false, error: "envelope is not a JSON object" };
  }
  const meta = isPlainObject(parsed.meta) ? parsed.meta : undefined;
  // Not every pp-cli command wraps its payload in `{meta, results}` — `doctor`
  // (and some others) return the payload at the top level. When there is no
  // `results` key, the parsed object IS the result; otherwise use it verbatim.
  const results = "results" in parsed ? parsed.results : parsed;
  return { ok: true, meta, results };
}

/**
 * Resolve a company-goat result to a single CIK (threat T-04-07). When the
 * result is unambiguous and carries a `cik`, returns that CIK as a string. When
 * `is_ambiguous` is set (or no usable single cik exists), returns
 * `{ambiguous:true, candidates}` from `cik_summaries` so the caller re-queries
 * by `--cik <id>` and NEVER trusts a name-fragment amount. Pure + throw-free.
 */
export function resolveCik(result: Record<string, unknown>): CikResolution {
  const ambiguousFlag = result.is_ambiguous === true;

  if (!ambiguousFlag) {
    const cik = result.cik;
    if (typeof cik === "string" && cik.length > 0) return cik;
    if (typeof cik === "number") return String(cik);
    // Not flagged ambiguous but no usable single cik — treat as ambiguous with
    // no candidates so the caller skips rather than fabricating an amount.
    return { ambiguous: true, candidates: [] };
  }

  const summaries = Array.isArray(result.cik_summaries)
    ? result.cik_summaries
    : [];
  const candidates = summaries
    .map((s) => {
      if (isPlainObject(s)) {
        if (typeof s.cik === "string") return s.cik;
        if (typeof s.cik === "number") return String(s.cik);
      }
      return null;
    })
    .filter((c): c is string => c != null && c.length > 0);

  return { ambiguous: true, candidates };
}

/**
 * Read a secret from the environment only (never a file, never a DB). Returns
 * null when absent so callers can skip a source cleanly. The VALUE is never
 * returned to logs by this helper — callers must not log it either (T-04-06).
 */
export function requireEnv(name: string): string | null {
  return process.env[name] || null;
}

/**
 * True if `bin` is on PATH (probed with `bin --version`). ENOENT / any error →
 * false, so a missing CLI becomes a clean skip rather than a crash.
 */
export function hasBinary(bin: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile(bin, ["--version"], { timeout: 10_000 }, (err) => {
      resolve(!err);
    });
  });
}

/**
 * Run a pp-cli in `--agent` mode and parse its envelope. IMPURE: spawns `bin`
 * via `execFile` (NO shell — see the command-injection note at the top). The
 * caller-supplied `args` are the source-specific args (domain/ticker/subject/
 * cik); AGENT_FLAGS are appended. `env` is passed explicitly (process.env plus
 * any per-source secret) so secrets stay env-only. ENOENT (binary absent) or a
 * non-zero exit returns `{ok:false}` — this function NEVER throws.
 */
export function runAgentCli(
  bin: string,
  args: string[],
  opts?: { env?: Record<string, string | undefined>; timeoutMs?: number },
): Promise<Envelope> {
  const fullArgs = [...args, ...AGENT_FLAGS];
  // Explicit env keeps secrets env-only. Cast to ProcessEnv: a caller-supplied
  // partial env is a valid environment map for execFile even without NODE_ENV.
  const env = (opts?.env ?? process.env) as NodeJS.ProcessEnv;
  return new Promise((resolve) => {
    execFile(
      bin,
      fullArgs,
      {
        env,
        timeout: opts?.timeoutMs ?? 120_000,
        maxBuffer: 32 * 1024 * 1024,
      },
      (err: ExecFileException | null, stdout: string) => {
        if (err) {
          // ENOENT (not on PATH) or non-zero exit — never expose env/secrets in
          // the error, only the CLI identity and a short reason.
          const reason =
            err.code === "ENOENT"
              ? "binary not found on PATH"
              : `exited non-zero: ${err.message}`;
          resolve({ ok: false, error: `${bin}: ${reason}` });
          return;
        }
        resolve(parseEnvelope(stdout ?? ""));
      },
    );
  });
}
