import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { nameKey } from "@/lib/market-cache/parse";
import { isStale } from "@/lib/analysis/staleness";
import type {
  AlertPrefsRow,
  CompanyAnalysisRow,
  CompanyEventRow,
  CompanyWithRelations,
  CompetitorRow,
  DigestPrefsRow,
  DocumentRowDb,
  MarketValuationRow,
  PortfolioEventRow,
} from "@/lib/types";

export type AlertPrefsView = Pick<
  AlertPrefsRow,
  | "funding_round"
  | "valuation"
  | "contract_win"
  | "competitor"
  | "valuation_min_pct"
>;

export const DEFAULT_ALERT_PREFS: AlertPrefsView = {
  funding_round: true,
  valuation: true,
  contract_win: true,
  competitor: true,
  valuation_min_pct: 0,
};

/** The current user's alert preferences, or sensible defaults. */
export async function getAlertPrefs(): Promise<AlertPrefsView> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("alert_prefs")
    .select(
      "funding_round, valuation, contract_win, competitor, valuation_min_pct",
    )
    .maybeSingle();
  return data ?? DEFAULT_ALERT_PREFS;
}

export type DigestPrefsView = Pick<
  DigestPrefsRow,
  | "enabled"
  | "frequency"
  | "include_holdings"
  | "include_activity"
  | "recipient_email"
>;

export const DEFAULT_DIGEST_PREFS: DigestPrefsView = {
  enabled: true,
  frequency: "weekly",
  include_holdings: true,
  include_activity: true,
  recipient_email: null,
};

/** The current user's digest configuration, or sensible defaults. */
export async function getDigestPrefs(): Promise<DigestPrefsView> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("digest_prefs")
    .select(
      "enabled, frequency, include_holdings, include_activity, recipient_email",
    )
    .maybeSingle();
  return data ?? DEFAULT_DIGEST_PREFS;
}

export interface ReportFile {
  name: string;
  date: string;
  size: number;
  url: string;
  /** Digest (portfolio-wide weekly) vs. memo (per-company IC memo). */
  kind: "digest" | "memo";
  /** Display label: "Portfolio digest" or the memo's company name. */
  label: string;
}

/**
 * The current user's generated reports (digests + company memos) from the
 * private `reports` bucket, with short-lived signed download URLs. Listed via
 * the admin client scoped to the verified user's own folder (the bucket has
 * no per-user storage policy). Kind is classified by filename suffix:
 * `-memo.pdf` → memo, anything else keeps the original digest handling.
 */
export async function listReports(): Promise<ReportFile[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const admin = createAdminClient();
  const { data: files, error } = await admin.storage
    .from("reports")
    .list(user.id, { sortBy: { column: "name", order: "desc" }, limit: 100 });
  if (error) {
    console.error("listReports:", error.message);
    return [];
  }

  const out: ReportFile[] = [];
  for (const f of files ?? []) {
    if (!f.name.endsWith(".pdf")) continue;
    const path = `${user.id}/${f.name}`;
    const { data: signed } = await admin.storage
      .from("reports")
      .createSignedUrl(path, 3600);
    const isMemo = f.name.endsWith("-memo.pdf");
    out.push({
      name: f.name,
      // Digest date derivation unchanged; memo names are {date}-{slug}-memo.pdf.
      date: isMemo ? f.name.slice(0, 10) : f.name.replace(/-digest\.pdf$/, ""),
      size: (f.metadata as { size?: number } | null)?.size ?? 0,
      url: signed?.signedUrl ?? "",
      kind: isMemo ? "memo" : "digest",
      label: isMemo
        ? f.name
            .slice(11)
            .replace(/-memo\.pdf$/, "")
            .replace(/-/g, " ")
        : "Portfolio digest",
    });
  }
  return out;
}

export interface CompanyAnalysisOption {
  id: string;
  name: string;
  /** null when the company has no stored deep-dive analysis yet. */
  analysisGeneratedAt: string | null;
  /** True when underlying data changed after the stored analysis. */
  stale: boolean;
}

/**
 * The current user's companies left-joined to their deep-dive analysis, for
 * the memo picker: companies without an analysis are rendered disabled, and
 * ones whose valuations/competitors moved after `generated_at` get a stale
 * badge (same staleness rule as the company page).
 */
export async function listCompaniesWithAnalysis(): Promise<
  CompanyAnalysisOption[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(
      "id, name, company_analysis(generated_at), valuations(created_at), competitors(updated_at, created_at)",
    )
    .order("name", { ascending: true });
  if (error) {
    console.error("listCompaniesWithAnalysis:", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as {
    id: string;
    name: string;
    company_analysis: { generated_at: string }[] | { generated_at: string } | null;
    valuations: { created_at: string | null }[];
    competitors: { updated_at: string | null; created_at: string | null }[];
  }[];
  return rows.map((r) => {
    const analysis = Array.isArray(r.company_analysis)
      ? r.company_analysis[0] ?? null
      : r.company_analysis;
    const latestDataChange = [
      ...(r.valuations ?? []).map((v) => v.created_at),
      ...(r.competitors ?? []).map((cp) => cp.updated_at ?? cp.created_at),
    ]
      .filter((d): d is string => Boolean(d))
      .sort()
      .at(-1);
    return {
      id: r.id,
      name: r.name,
      analysisGeneratedAt: analysis?.generated_at ?? null,
      stale: analysis
        ? isStale(analysis.generated_at, latestDataChange)
        : false,
    };
  });
}

const COMPANY_WITH_RELATIONS =
  "*, investments(*), valuations(*), funding_rounds(*), news(*)";

/** All of the current user's companies with nested related records. */
export async function getCompaniesWithRelations(): Promise<
  CompanyWithRelations[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_WITH_RELATIONS)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("getCompaniesWithRelations:", error.message);
    return [];
  }
  return (data ?? []) as unknown as CompanyWithRelations[];
}

/** A single company with relations, or null if not found / not owned. */
export async function getCompany(
  id: string,
): Promise<CompanyWithRelations | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .select(COMPANY_WITH_RELATIONS)
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getCompany:", error.message);
    return null;
  }
  return (data as unknown as CompanyWithRelations) ?? null;
}

/** A company's stored deep-dive analysis (one row per company), or null. */
export async function getCompanyAnalysis(
  companyId: string,
): Promise<CompanyAnalysisRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_analysis")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    console.error("getCompanyAnalysis:", error.message);
    return null;
  }
  return data ?? null;
}

/** A company's discovered competitors, highest valuation first (nulls last). */
export async function getCompetitors(
  companyId: string,
): Promise<CompetitorRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("competitors")
    .select("*")
    .eq("company_id", companyId)
    .order("valuation", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("getCompetitors:", error.message);
    return [];
  }
  return data ?? [];
}

/** A company's ingested documents (data room), newest first, with diffs. */
export async function getDocuments(companyId: string): Promise<DocumentRowDb[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("documents")
    .select("id, company_id, user_id, type, file_path, diff, diff_vs, status, created_at")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("getDocuments:", error.message);
    return [];
  }
  return (data ?? []) as unknown as DocumentRowDb[];
}

/** The market-cache valuation for a company name, if any (provenance source). */
export async function getMarketValuation(
  name: string,
): Promise<MarketValuationRow | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("market_valuations")
    .select("*")
    .eq("name_key", nameKey(name))
    .maybeSingle();
  return data ?? null;
}

export interface ActivityEvent extends PortfolioEventRow {
  /** Company name (joined) for display in the feed. */
  company: string | null;
}

/** Most recent portfolio activity events for the current user. */
export async function getRecentEvents(limit = 15): Promise<ActivityEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("portfolio_events")
    .select("*, companies(name)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("getRecentEvents:", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as (PortfolioEventRow & {
    companies: { name: string } | null;
  })[];
  return rows.map(({ companies, ...rest }) => ({
    ...rest,
    company: companies?.name ?? null,
  }));
}

export interface CalendarEvent extends CompanyEventRow {
  /** Company name (joined) for display. */
  company: string | null;
}

/**
 * All web-fetched company events (corporate / valuation / secondary) for the
 * current user. The caller partitions these into upcoming vs. historical with
 * `partitionEvents` so the chronological logic stays in one tested place.
 */
export async function getCompanyEvents(): Promise<CalendarEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("company_events")
    .select("*, companies(name)")
    .order("event_date", { ascending: false, nullsFirst: false });
  if (error) {
    console.error("getCompanyEvents:", error.message);
    return [];
  }
  const rows = (data ?? []) as unknown as (CompanyEventRow & {
    companies: { name: string } | null;
  })[];
  return rows.map(({ companies, ...rest }) => ({
    ...rest,
    company: companies?.name ?? null,
  }));
}

/** Count of unseen activity events for the current user (the alert badge). */
export async function getUnseenEventCount(): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("portfolio_events")
    .select("id", { count: "exact", head: true })
    .eq("seen", false);
  return count ?? 0;
}
