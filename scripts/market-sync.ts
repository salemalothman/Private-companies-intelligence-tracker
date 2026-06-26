/**
 * Run the weekly market-intelligence sync once and print what it cached/updated.
 *
 *   node --conditions=react-server --import tsx scripts/market-sync.ts
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

async function main() {
  const { createClient } = await import("@supabase/supabase-js");
  const { runMarketSync } = await import("../lib/market-cache/ingest");

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const summary = await runMarketSync(sb as any);
  console.log("\nSUMMARY:", summary);

  const { data: cache } = await sb
    .from("market_valuations")
    .select("name, valuation, revenue, as_of")
    .order("valuation", { ascending: false, nullsFirst: false })
    .limit(30);
  console.log(`\n=== market_valuations (${cache?.length ?? 0}) ===`);
  for (const c of cache ?? []) {
    const v = c.valuation ? `$${(c.valuation / 1e9).toFixed(1)}B` : "—";
    const r = c.revenue ? `$${(c.revenue / 1e9).toFixed(2)}B rev` : "";
    console.log(`  ${c.name.padEnd(22)} ${v.padEnd(10)} ${r}  (${c.as_of})`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
