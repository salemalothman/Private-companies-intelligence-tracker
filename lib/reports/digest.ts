import "server-only";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyWithRelations, Database } from "@/lib/types";
import {
  companyTableRow,
  currentValue,
  portfolioSummary,
} from "@/lib/metrics";
import { drawLogo, GREEN, INK, MUTED, RED, TEAL } from "@/lib/reports/pdf-kit";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";
import { sendDigestEmail } from "@/lib/email/digest-email";

type DB = SupabaseClient<Database>;

const REPORT_BUCKET = "reports";

export interface DigestActivity {
  company: string | null;
  title: string;
  detail: string | null;
}

export interface DigestInput {
  companies: CompanyWithRelations[];
  generatedAt: string; // ISO date
  /** Notable portfolio events from the last week (activity feed). */
  activity?: DigestActivity[];
  /** Section toggles (per-user digest config). */
  includeHoldings?: boolean;
  includeActivity?: boolean;
}

/** Render a one-page professional portfolio digest PDF. */
export async function buildDigestPdf({
  companies,
  generatedAt,
  activity = [],
  includeHoldings = true,
  includeActivity = true,
}: DigestInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 48;
  let y = 800;

  const text = (
    str: string,
    x: number,
    yy: number,
    opts: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(str, {
      x,
      y: yy,
      size: opts.size ?? 10,
      font: opts.bold ? bold : font,
      color: opts.color ?? INK,
    });

  // Header — logo mark + two-line wordmark on the left, brand-teal report
  // label + date right-aligned, closed with a teal accent rule.
  drawLogo(page, M, y + 28, 30);
  text("Automation Investment", M + 42, y + 16, { size: 13, bold: true });
  text("Intelligence Platform", M + 42, y + 3, { size: 10, color: MUTED });

  const rLabel = "PORTFOLIO DIGEST";
  text(rLabel, 547 - bold.widthOfTextAtSize(rLabel, 9), y + 16, {
    size: 9,
    bold: true,
    color: TEAL,
  });
  const gen = `Generated ${formatDate(generatedAt)}`;
  text(gen, 547 - font.widthOfTextAtSize(gen, 9), y + 3, {
    size: 9,
    color: MUTED,
  });

  y -= 34;
  page.drawLine({ start: { x: M, y }, end: { x: 547, y }, thickness: 1.25, color: TEAL });
  y -= 30;

  // Portfolio summary
  const s = portfolioSummary(companies);
  text("PORTFOLIO SUMMARY", M, y, { size: 9, bold: true, color: MUTED });
  y -= 20;
  const stats: [string, string][] = [
    ["Portfolio value", formatCurrency(s.portfolioValue)],
    ["Invested capital", formatCurrency(s.totalInvested)],
    ["Unrealized gain", formatCurrency(s.unrealizedGain)],
    ["Companies", `${s.companyCount} (${s.activeCount} active)`],
  ];
  let cx = M;
  for (const [label, val] of stats) {
    text(label, cx, y, { size: 8, color: MUTED });
    text(val, cx, y - 14, { size: 13, bold: true });
    cx += 125;
  }
  if (s.totalReturnPct != null) {
    text(
      `Total return ${formatPercent(s.totalReturnPct, { signed: true })}`,
      M,
      y - 32,
      { size: 9, color: s.totalReturnPct >= 0 ? GREEN : RED },
    );
  }
  y -= 58;

  // Holdings table
  if (includeHoldings) {
    text("HOLDINGS", M, y, { size: 9, bold: true, color: MUTED });
    y -= 18;
    const cols = [M, M + 200, M + 320, M + 430];
    text("Company", cols[0], y, { size: 8, bold: true, color: MUTED });
    text("Invested", cols[1], y, { size: 8, bold: true, color: MUTED });
    text("Est. value", cols[2], y, { size: 8, bold: true, color: MUTED });
    text("Change", cols[3], y, { size: 8, bold: true, color: MUTED });
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: 547, y }, thickness: 0.5, color: rgb(0.85, 0.87, 0.9) });
    y -= 16;
    for (const co of companies) {
      const r = companyTableRow(co);
      text(r.name.slice(0, 34), cols[0], y, { size: 10 });
      text(formatCurrency(r.amountInvested), cols[1], y, { size: 10 });
      text(formatCurrency(currentValue(co)), cols[2], y, { size: 10 });
      text(
        r.changePct == null ? "—" : formatPercent(r.changePct, { signed: true }),
        cols[3],
        y,
        { size: 10, color: (r.changePct ?? 0) >= 0 ? GREEN : RED },
      );
      y -= 18;
      if (y < 140) break;
    }
  }

  // Notable activity (last 7 days) from the portfolio events feed.
  if (includeActivity && activity.length && y > 130) {
    y -= 14;
    text("NOTABLE ACTIVITY (LAST 7 DAYS)", M, y, {
      size: 9,
      bold: true,
      color: MUTED,
    });
    y -= 18;
    for (const a of activity) {
      page.drawCircle({ x: M + 3, y: y + 3, size: 2.5, color: TEAL });
      const line = `${a.company ? `${a.company}: ` : ""}${a.title}${a.detail ? ` (${a.detail})` : ""}`;
      text(line.slice(0, 92), M + 12, y, { size: 9 });
      y -= 15;
      if (y < 70) break;
    }
  }

  // Footer
  text(
    "Generated by Automation Investment Intelligence Platform · figures are estimates from tracked sources.",
    M,
    40,
    { size: 7, color: MUTED },
  );

  return doc.save();
}

export interface DigestRunSummary {
  users: number;
  reports: number;
  skipped: number;
  emailed: number;
  status: "success" | "partial";
  detail?: string;
}

/**
 * Reporting engine: builds a PDF digest per user from their portfolio and
 * uploads it to the private `reports` Storage bucket at {userId}/{date}-digest.pdf.
 *
 * Respects each user's digest_prefs (enabled, frequency, section toggles). Pass
 * `userId` to scope to one user and `force: true` for an on-demand "generate
 * now" that ignores the enabled/frequency gates. The weekly cron calls it with
 * no options (all users, gated by prefs).
 */
export async function runWeeklyDigest(
  supabase: DB,
  opts: { userId?: string; force?: boolean } = {},
): Promise<DigestRunSummary> {
  let companiesQuery = supabase
    .from("companies")
    .select("*, investments(*), valuations(*), funding_rounds(*), news(*)");
  if (opts.userId) companiesQuery = companiesQuery.eq("user_id", opts.userId);
  const { data, error } = await companiesQuery;
  if (error)
    return { users: 0, reports: 0, skipped: 0, emailed: 0, status: "partial", detail: error.message };

  const byUser = new Map<string, CompanyWithRelations[]>();
  for (const c of (data ?? []) as unknown as (CompanyWithRelations & { user_id: string })[]) {
    const list = byUser.get(c.user_id) ?? [];
    list.push(c);
    byUser.set(c.user_id, list);
  }

  // Notable activity from the last 7 days, grouped by user.
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const { data: evRows } = await supabase
    .from("portfolio_events")
    .select("user_id, title, detail, companies(name)")
    .gte("created_at", weekAgo)
    .order("created_at", { ascending: false });
  const activityByUser = new Map<string, DigestActivity[]>();
  for (const e of (evRows ?? []) as unknown as {
    user_id: string;
    title: string;
    detail: string | null;
    companies: { name: string } | null;
  }[]) {
    const list = activityByUser.get(e.user_id) ?? [];
    if (list.length < 8)
      list.push({ company: e.companies?.name ?? null, title: e.title, detail: e.detail });
    activityByUser.set(e.user_id, list);
  }

  // Per-user digest configuration.
  let prefsQuery = supabase.from("digest_prefs").select("*");
  if (opts.userId) prefsQuery = prefsQuery.eq("user_id", opts.userId);
  const { data: prefRows } = await prefsQuery;
  const prefsByUser = new Map(
    (prefRows ?? []).map((p) => [p.user_id, p] as const),
  );

  const now = new Date();
  const dayOfMonth = now.getUTCDate();
  const date = now.toISOString().slice(0, 10);
  let reports = 0;
  let skipped = 0;
  let emailed = 0;
  const errors: string[] = [];
  for (const [userId, companies] of byUser) {
    const prefs = prefsByUser.get(userId);
    // Honor enabled / frequency gates unless this is a forced on-demand run.
    if (!opts.force) {
      if (prefs && !prefs.enabled) {
        skipped += 1;
        continue;
      }
      if ((prefs?.frequency ?? "weekly") === "monthly" && dayOfMonth > 7) {
        skipped += 1;
        continue;
      }
    }
    try {
      const pdf = await buildDigestPdf({
        companies,
        generatedAt: date,
        activity: activityByUser.get(userId) ?? [],
        includeHoldings: prefs?.include_holdings ?? true,
        includeActivity: prefs?.include_activity ?? true,
      });
      const { error: upErr } = await supabase.storage
        .from(REPORT_BUCKET)
        .upload(`${userId}/${date}-digest.pdf`, pdf, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) {
        errors.push(upErr.message);
        continue;
      }
      reports += 1;

      // Deliver by email with the PDF attached, when a recipient is configured
      // and email is wired up (degrades to a no-op otherwise).
      const to = prefs?.recipient_email?.trim();
      if (to) {
        const s = portfolioSummary(companies);
        const res = await sendDigestEmail({
          to,
          generatedAt: date,
          portfolioValue: s.portfolioValue,
          companyCount: s.companyCount,
          pdf,
          filename: `portfolio-digest-${date}.pdf`,
        });
        if (res.ok) emailed += 1;
        else if (res.error) errors.push(`email ${to}: ${res.error}`);
      }
    } catch (e) {
      errors.push(`${userId}: ${(e as Error).message}`);
    }
  }

  return {
    users: byUser.size,
    reports,
    skipped,
    emailed,
    status: errors.length ? "partial" : "success",
    detail: errors.length ? errors.slice(0, 3).join("; ") : undefined,
  };
}
