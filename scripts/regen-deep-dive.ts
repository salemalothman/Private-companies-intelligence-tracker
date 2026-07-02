/**
 * Regenerate one existing company's deep-dive analysis end-to-end and print the
 * section keys the run produced. Uses the service-role client (server-side),
 * loading creds + connector keys from .env.local. Operator-run only (bypasses
 * RLS) — mirrors scripts/sync-company.ts.
 *
 *   node --conditions=react-server --import tsx scripts/regen-deep-dive.ts "Replit"
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

// Same nested-relations select the app's getCompany reader uses, so runDeepDive
// receives the exact CompanyWithRelations shape it reads (valuations, funding
// rounds, news, investments).
const COMPANY_WITH_RELATIONS =
  "*, investments(*), valuations(*), funding_rounds(*), news(*)";

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { runDeepDive } = await import("../lib/agents/deep-dive");

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: company } = await sb
    .from("companies")
    .select(COMPANY_WITH_RELATIONS)
    .ilike("name", NAME)
    .maybeSingle();
  if (!company) {
    console.error("Company not found:", NAME);
    process.exit(1);
  }

  console.log(`\nRegenerating deep-dive for "${company.name}" (${company.id}) …`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await runDeepDive(sb as any, company as any);
  if (error) {
    console.error("runDeepDive failed:", error);
    process.exit(1);
  }

  // Re-read the stored analysis so the operator can confirm the fuller set landed.
  const { data: analysis } = await sb
    .from("company_analysis")
    .select("sections, generated_at")
    .eq("company_id", company.id)
    .maybeSingle();

  const sections = (analysis?.sections ?? {}) as Record<string, unknown>;
  const ic = sections.ic_conclusion as { rating?: string } | undefined;
  console.log("\nProduced section keys:", Object.keys(sections).sort().join(", ") || "(none)");
  console.log("ic_conclusion.rating:", ic?.rating ?? "(none)");
  console.log("generated_at:", analysis?.generated_at ?? "(none)");
  console.log("\n✅ done.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
