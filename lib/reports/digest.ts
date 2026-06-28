import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFPage, type PDFFont } from "pdf-lib";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { CompanyWithRelations, Database } from "@/lib/types";
import {
  companyTableRow,
  currentValue,
  portfolioSummary,
} from "@/lib/metrics";
import { formatCurrency, formatDate, formatPercent } from "@/lib/utils";

type DB = SupabaseClient<Database>;

const TEAL = rgb(0.36, 0.62, 0.68);
const INK = rgb(0.12, 0.18, 0.24);
const MUTED = rgb(0.45, 0.5, 0.55);
const GREEN = rgb(0.13, 0.55, 0.33);
const RED = rgb(0.79, 0.16, 0.16);
const REPORT_BUCKET = "reports";

/** Draw the brand mark (network graph in nodes) at (ox, oy-top) in a `box`pt square. */
function drawLogo(page: PDFPage, ox: number, oyTop: number, box: number) {
  const s = box / 48;
  const X = (vx: number) => ox + vx * s;
  const Y = (vy: number) => oyTop - vy * s; // flip viewBox y-down to PDF y-up
  const nodes: [number, number, number][] = [
    [12, 33, 2.8],
    [20, 24, 2.8],
    [16, 15, 2.8],
    [31, 11, 3.2],
    [34, 20, 2.8],
  ];
  const lines: [number, number, number, number][] = [
    [12, 33, 20, 24],
    [20, 24, 16, 15],
    [16, 15, 31, 11],
    [20, 24, 34, 20],
  ];
  for (const [x1, y1, x2, y2] of lines) {
    page.drawLine({
      start: { x: X(x1), y: Y(y1) },
      end: { x: X(x2), y: Y(y2) },
      thickness: 1.6,
      color: TEAL,
    });
  }
  for (const [cx, cy, r] of nodes) {
    page.drawCircle({ x: X(cx), y: Y(cy), size: r * s, color: TEAL });
  }
}

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
}

/** Render a one-page professional portfolio digest PDF. */
export async function buildDigestPdf({
  companies,
  generatedAt,
  activity = [],
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

  // Header
  drawLogo(page, M, y + 26, 30);
  text("Automation Investment Intelligence Platform", M + 40, y + 14, {
    size: 13,
    bold: true,
  });
  text("Weekly Portfolio Digest", M + 40, y, { size: 10, color: MUTED });
  text(`Generated ${formatDate(generatedAt)}`, M + 40, y - 12, {
    size: 9,
    color: MUTED,
  });
  y -= 56;
  page.drawLine({ start: { x: M, y }, end: { x: 547, y }, thickness: 0.75, color: rgb(0.85, 0.87, 0.9) });
  y -= 28;

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

  // Notable activity (last 7 days) from the portfolio events feed.
  if (activity.length && y > 130) {
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
  status: "success" | "partial";
  detail?: string;
}

/**
 * Weekly reporting engine: builds a PDF digest per user from their portfolio and
 * uploads it to the private `reports` Storage bucket at {userId}/{date}-digest.pdf.
 * (Email delivery is deferred — the PDF is stored/downloadable for now.)
 */
export async function runWeeklyDigest(supabase: DB): Promise<DigestRunSummary> {
  const { data, error } = await supabase
    .from("companies")
    .select("*, investments(*), valuations(*), funding_rounds(*), news(*)");
  if (error) return { users: 0, reports: 0, status: "partial", detail: error.message };

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

  const date = new Date().toISOString().slice(0, 10);
  let reports = 0;
  const errors: string[] = [];
  for (const [userId, companies] of byUser) {
    try {
      const pdf = await buildDigestPdf({
        companies,
        generatedAt: date,
        activity: activityByUser.get(userId) ?? [],
      });
      const { error: upErr } = await supabase.storage
        .from(REPORT_BUCKET)
        .upload(`${userId}/${date}-digest.pdf`, pdf, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (upErr) errors.push(upErr.message);
      else reports += 1;
    } catch (e) {
      errors.push(`${userId}: ${(e as Error).message}`);
    }
  }

  return {
    users: byUser.size,
    reports,
    status: errors.length ? "partial" : "success",
    detail: errors.length ? errors.slice(0, 3).join("; ") : undefined,
  };
}
