/**
 * External-grounding ingestion — the off-Vercel entrypoint (Phase 04).
 *
 * ⚠️  RUNS LOCALLY / VIA EXTERNAL CRON ONLY. This script shells out to the local
 *     Printing Press CLIs (company-goat / sec-edgar / x-twitter) which read local
 *     SQLite — the Vercel serverless runtime CANNOT run them. Do NOT wrap this in
 *     a Vercel route/function and do NOT import it from app/ runtime code. The
 *     Next.js app only ever READS the cached Supabase rows this script writes.
 *
 *   node --conditions=react-server --import tsx scripts/ingest-grounding.ts
 *
 * It builds the service-role admin client inline (lib/supabase/admin.ts is
 * `server-only` and cannot be imported here — mirror scripts/market-sync.ts),
 * enumerates companies + competitors into IngestTarget[], then dispatches to
 * each per-source module. Each dispatch is try/catch-guarded and the modules are
 * loaded via dynamic import so a not-yet-implemented source (Plans 03/04/05)
 * skips cleanly instead of aborting the whole run.
 */
import WebSocket from "ws";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types";
import { requireEnv } from "@/lib/ingest/cli";
import type { IngestTarget, SourceModule, SourceSummary } from "@/lib/ingest/types";

// supabase-js constructs a Realtime client that needs a global WebSocket.
if (!(globalThis as { WebSocket?: unknown }).WebSocket) {
  (globalThis as { WebSocket?: unknown }).WebSocket =
    WebSocket as unknown as typeof globalThis.WebSocket;
}

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may already be present */
}

type Admin = SupabaseClient<Database>;

/** Each source: [source name, module path, exported dispatch fn name]. */
const SOURCES: Array<{ source: string; module: string; fn: string }> = [
  { source: "company-goat", module: "@/lib/ingest/company-goat", fn: "runCompanyGoat" },
  { source: "sec-edgar", module: "@/lib/ingest/sec-edgar", fn: "runSecEdgar" },
  { source: "x-twitter", module: "@/lib/ingest/x-twitter", fn: "runXTwitter" },
];

/**
 * Derive a bare hostname from a company website (strip scheme/path, drop `www.`).
 * Returns undefined when the website is absent or unparseable — company-goat is
 * skipped for that target rather than fed a bad domain.
 */
function deriveDomain(website: string | null): string | undefined {
  if (!website) return undefined;
  const raw = website.trim();
  if (!raw) return undefined;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const host = new URL(withScheme).hostname.replace(/^www\./i, "");
    return host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Enumerate every ingestion subject: portfolio companies + their competitors.
 * `is_self` competitors are the company-as-its-own-comp duplicates — dropped so
 * we do not fetch the same subject twice. Targets are deduplicated by
 * (companyId, subject).
 */
async function enumerateTargets(admin: Admin): Promise<IngestTarget[]> {
  const targets: IngestTarget[] = [];
  const seen = new Set<string>();
  const push = (t: IngestTarget) => {
    const key = `${t.companyId}::${t.subject.toLowerCase()}`;
    if (t.subject && !seen.has(key)) {
      seen.add(key);
      targets.push(t);
    }
  };

  const { data: companies, error: cErr } = await admin
    .from("companies")
    .select("id, user_id, name, website");
  if (cErr) throw new Error(`enumerate companies: ${cErr.message}`);

  for (const c of companies ?? []) {
    push({
      companyId: c.id,
      userId: c.user_id,
      subject: c.name,
      kind: "company",
      domain: deriveDomain(c.website),
    });
  }

  const { data: competitors, error: kErr } = await admin
    .from("competitors")
    .select("company_id, user_id, name, is_self");
  if (kErr) throw new Error(`enumerate competitors: ${kErr.message}`);

  for (const k of competitors ?? []) {
    if (k.is_self) continue; // skip the company-as-its-own-comp duplicate
    push({
      companyId: k.company_id,
      userId: k.user_id,
      subject: k.name,
      kind: "competitor",
    });
  }

  return targets;
}

/**
 * Load a per-source module's dispatch fn via dynamic import. Returns null when
 * the module does not exist yet (Plans 03/04/05) or does not export the fn, so
 * the caller records a clean skip instead of aborting.
 */
async function loadModule(
  modulePath: string,
  fnName: string,
): Promise<SourceModule<Admin> | null> {
  try {
    const mod: Record<string, unknown> = await import(modulePath);
    const fn = mod[fnName];
    return typeof fn === "function" ? (fn as SourceModule<Admin>) : null;
  } catch {
    return null;
  }
}

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local",
    );
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const admin = createClient<Database>(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const targets = await enumerateTargets(admin);
  console.log(`Enumerated ${targets.length} target(s) for ingestion.`);

  const summaries: SourceSummary[] = [];

  for (const { source, module, fn } of SOURCES) {
    // x-twitter is opt-in: only run when the paid bearer token is present.
    if (source === "x-twitter" && !requireEnv("X_BEARER_TOKEN")) {
      summaries.push({
        source,
        upserted: 0,
        skipped: targets.length,
        status: "skipped",
        detail: "X_BEARER_TOKEN not set — x-twitter skipped (opt-in)",
      });
      continue;
    }

    // Each dispatch is guarded so one source failing never aborts the others.
    try {
      const run = await loadModule(module, fn);
      if (!run) {
        summaries.push({
          source,
          upserted: 0,
          skipped: targets.length,
          status: "skipped",
          detail: "module not yet implemented — skipped",
        });
        continue;
      }
      summaries.push(await run(admin, targets));
    } catch (e) {
      summaries.push({
        source,
        upserted: 0,
        skipped: targets.length,
        status: "partial",
        detail: `dispatch failed: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  console.log("\n=== ingestion summary ===");
  for (const s of summaries) {
    const line = `  ${s.source.padEnd(14)} ${s.status.padEnd(8)} upserted=${s.upserted} skipped=${s.skipped}`;
    console.log(s.detail ? `${line}  (${s.detail})` : line);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
