import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runGlobalSync } from "@/lib/agents/global-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Weekly global synchronization. Runs the full enrichment + source-sanitization
 * + competitor-modernization + entity-disambiguation pipeline across every
 * tracked company. Scheduled via Vercel Cron (Authorization: Bearer
 * ${CRON_SECRET}); also triggerable manually with the same token.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runGlobalSync(createAdminClient());
    return NextResponse.json({ ok: true, ...summary });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
