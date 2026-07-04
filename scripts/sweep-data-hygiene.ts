/**
 * One-shot data-hygiene sweep across EVERY company (all users) — the operator
 * version of the repairs that global-sync now performs weekly:
 *
 *   1. Round hygiene   — persist same-raise dedupe + backfill timeline rows
 *                        from rounds' recorded post-money (lib/enrichment/
 *                        round-hygiene.ts).
 *   2. Timeline sweep  — strip backdated/hallucinated valuations (existing
 *                        validateAllTimelines rule set).
 *   3. Label repair    — historical competitor rows written with the blanket
 *                        "agdillon (cache)" label are re-pointed at their
 *                        underlying market row's REAL source (discover.ts now
 *                        writes true labels; this heals rows from before).
 *
 * Idempotent and safe to re-run. Uses the service-role client (bypasses RLS to
 * cover all users) — operator-run only, mirrors scripts/regen-deep-dive.ts.
 *
 *   node --conditions=react-server --import tsx scripts/sweep-data-hygiene.ts
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
  const { sweepRoundHygiene } = await import("../lib/enrichment/round-hygiene");
  const { validateAllTimelines } = await import(
    "../lib/enrichment/timeline-validation"
  );
  const { nameKey } = await import("../lib/market-cache/parse");

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // 1. Round hygiene (dedupe + backfill) — runs before the timeline sweep so
  //    backfilled figures arm the monotonic guard.
  const hygiene = await sweepRoundHygiene(
    sb as Parameters<typeof sweepRoundHygiene>[0],
  );
  console.log(
    `round hygiene: ${hygiene.companies} companies · ${hygiene.deleted} duplicates deleted · ` +
      `${hygiene.merged} survivors patched · ${hygiene.backfilled} timeline rows backfilled`,
  );

  // 2. Timeline anomaly sweep.
  const timeline = await validateAllTimelines(
    sb as Parameters<typeof validateAllTimelines>[0],
  );
  console.log(
    `timeline sweep: ${timeline.scanned} rows scanned · ${timeline.stripped} stripped · ${timeline.flagged} flagged`,
  );

  // 3. Heal historical blanket "agdillon (cache)" labels to the underlying
  //    market row's real source (no-op when none remain).
  const { data: mislabeled } = await sb
    .from("competitors")
    .select("id,name")
    .eq("source", "agdillon (cache)");
  let relabeled = 0;
  if (mislabeled?.length) {
    const { data: cache } = await sb
      .from("market_valuations")
      .select("name_key,source");
    const srcByKey = new Map((cache ?? []).map((r) => [r.name_key, r.source]));
    for (const c of mislabeled) {
      const underlying = srcByKey.get(nameKey(c.name));
      const src = underlying ? `${underlying} (cache)` : "market cache";
      // A true AG Dillon row keeps an agdillon-derived label — this only
      // corrects rows whose underlying source was something else.
      const { error } = await sb
        .from("competitors")
        .update({ source: src })
        .eq("id", c.id);
      if (!error) relabeled++;
    }
  }
  console.log(`label repair: ${relabeled} competitor rows re-pointed`);

  console.log("\n✅ sweep complete.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
