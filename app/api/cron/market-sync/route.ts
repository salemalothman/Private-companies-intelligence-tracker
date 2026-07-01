import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runMarketSync } from "@/lib/market-cache/ingest";

// Long-running external fetch + DB writes — force Node runtime, no caching.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Weekly market-intelligence sync. Scheduled via Vercel Cron (see vercel.json),
 * which sends `Authorization: Bearer ${CRON_SECRET}`. Parses the trusted
 * sources, refreshes the valuation cache, and propagates newer figures to
 * existing companies. Can also be triggered manually with the same bearer token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const summary = await runMarketSync(createAdminClient());
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message },
      { status: 500 },
    );
  }
}
