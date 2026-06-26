/**
 * Run the live ingestion pipeline for one existing company and print what was
 * written. Uses the service-role client (server-side), loading creds + connector
 * keys from .env.local.
 *
 *   node --conditions=react-server --import tsx scripts/sync-company.ts "Replit"
 */
import WebSocket from "ws";
if (!(globalThis as { WebSocket?: unknown }).WebSocket) {
  (globalThis as { WebSocket?: unknown }).WebSocket =
    WebSocket as unknown as typeof globalThis.WebSocket;
}
try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may already be present */
}

const NAME = process.argv[2] ?? "Replit";

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { getConnectors } = await import("../lib/connectors/registry");
  const { ingestCompany } = await import("../lib/ingestion/orchestrator");

  console.log(
    "Active connectors:",
    getConnectors().map((c) => c.id).join(", "),
  );

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: company } = await sb
    .from("companies")
    .select("id, name, website, sector, country, founded_year, description, founders")
    .ilike("name", NAME)
    .maybeSingle();
  if (!company) {
    console.error("Company not found:", NAME);
    process.exit(1);
  }

  console.log(`\nIngesting "${company.name}" (${company.id}) …`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = await ingestCompany(sb as any, company as any);
  console.log("Summary:", summary);

  for (const t of ["funding_rounds", "valuations", "news"] as const) {
    const { data } = await sb
      .from(t)
      .select("*")
      .eq("company_id", company.id)
      .order("date", { ascending: false });
    console.log(`\n=== ${t} (${data?.length ?? 0}) ===`);
    console.dir(data, { depth: null });
  }
  console.log("\n✅ done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
