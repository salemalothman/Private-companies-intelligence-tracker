"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCompany } from "@/lib/queries";
import { runDeepDive } from "@/lib/agents/deep-dive";
import { ingestCompany } from "@/lib/ingestion/orchestrator";
import { verifyFinancialsFor } from "@/lib/agents/financials";
import { refreshCompetitorsFor, companyHint } from "@/lib/competitors/refresh";
import { hasLiveConnectors } from "@/lib/connectors/registry";
import { classifyNews } from "@/lib/news/classify";
import {
  enrichCompanyProfile,
  type EnrichedProfile,
} from "@/lib/enrichment/enrich";

const INGEST_FIELDS =
  "id, name, website, sector, country, founded_year, description, founders";

export interface ActionResult {
  error?: string;
  id?: string;
}

function num(v: FormDataEntryValue | null): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[,$%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function str(v: FormDataEntryValue | null): string | null {
  const s = v == null ? "" : String(v).trim();
  return s.length ? s : null;
}

function list(v: FormDataEntryValue | null): string[] | null {
  const s = str(v);
  if (!s) return null;
  return s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

/** Auto-enrich the Add Company form from just the company name. */
export async function enrichCompany(
  name: string,
): Promise<EnrichedProfile & { error?: string }> {
  const { user } = await requireUser();
  if (!user) return { error: "Not authenticated." };
  const q = name.trim();
  if (q.length < 2) return {};
  try {
    return await enrichCompanyProfile(q);
  } catch {
    return {};
  }
}

export async function createCompany(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const name = str(formData.get("name"));
  if (!name) return { error: "Company name is required." };

  const { data, error } = await supabase
    .from("companies")
    .insert({
      user_id: user.id,
      name,
      website: str(formData.get("website")),
      logo_url: str(formData.get("logo_url")),
      sector: str(formData.get("sector")),
      country: str(formData.get("country")),
      founded_year: num(formData.get("founded_year")),
      founders: list(formData.get("founders")),
      description: str(formData.get("description")),
      status: (str(formData.get("status")) as "active" | "exited") ?? "active",
    })
    .select(INGEST_FIELDS)
    .single();

  if (error) return { error: error.message };

  // Optional "Investment Details" from onboarding — record the entry so the
  // valuation timeline and portfolio metrics populate immediately.
  const amount = num(formData.get("investment_amount"));
  const ownership = num(formData.get("ownership_pct"));
  const entryVal = num(formData.get("entry_valuation"));
  const today = new Date().toISOString().slice(0, 10);

  if (amount != null || ownership != null) {
    await supabase.from("investments").insert({
      company_id: data.id,
      user_id: user.id,
      investment_date: today,
      amount: amount ?? 0,
      ownership_pct: ownership,
    });
  }
  if (entryVal != null) {
    await supabase.from("valuations").insert({
      company_id: data.id,
      date: today,
      round: "Entry",
      post_money: entryVal,
      source: "Manual entry",
      confidence: "medium",
    });
  }

  // Kick off ingestion + competitor discovery in parallel on add. Competitor
  // discovery is seeded with the website-derived description so it grounds the
  // search in what the company actually does. Both best-effort — a failure must
  // never block company creation.
  const hint = companyHint(data.description, data.sector);
  await Promise.allSettled([
    ingestCompany(supabase, data).catch((e) =>
      console.error("ingestion on create:", (e as Error).message),
    ),
    refreshCompetitorsFor(
      supabase,
      data.id,
      data.name,
      user.id,
      hint,
    ).catch((e) => console.error("competitors on create:", (e as Error).message)),
  ]);

  revalidatePath("/dashboard");
  revalidatePath("/companies");
  return { id: data.id };
}

export async function syncCompany(companyId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const { data, error } = await supabase
    .from("companies")
    .select(INGEST_FIELDS)
    .eq("id", companyId)
    .maybeSingle();
  if (error || !data) return { error: error?.message ?? "Company not found." };

  try {
    // One click runs the full refresh: profile + funding rounds + valuations +
    // news (ingestion pipeline) AND the competitive landscape. Competitor
    // discovery is best-effort so an empty/failed result never fails the sync.
    await ingestCompany(supabase, data);
    try {
      await refreshCompetitorsFor(
        supabase,
        data.id,
        data.name,
        user.id,
        companyHint(data.description, data.sector),
      );
    } catch (e) {
      console.error("sync competitors:", (e as Error).message);
    }

    // Targeted Exa financials sweep: latest reported revenue, current private
    // valuation, and secondary-market share price. Best-effort — never fails
    // the sync. Shared with the global sync via verifyFinancialsFor.
    try {
      await verifyFinancialsFor(supabase, {
        id: data.id,
        user_id: user.id,
        name: data.name,
      });
    } catch (e) {
      console.error("sync financials:", (e as Error).message);
    }

    revalidatePath(`/companies/${companyId}`);
    revalidatePath("/dashboard");
    revalidatePath("/fund");
    return {};
  } catch (e) {
    return { error: `Sync failed: ${(e as Error).message}` };
  }
}

/**
 * On-demand deep-dive generation, triggered by the "Run deep-dive" header button
 * (separate from Sync). Runs `runDeepDive` under the RLS user client — never the
 * service-role admin client — so a user can only generate for a company they own
 * (RLS blocks cross-owner reads/writes). The agent upserts one `company_analysis`
 * row keyed on `company_id`, so a re-run overwrites the prior row with a fresh
 * `generated_at`. Degrades gracefully (returns `{ error }` rather than throwing).
 */
export async function runDeepDiveAction(
  companyId: string,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  // Load the company with relations via the RLS user client — ownership is
  // enforced by RLS, so a non-owner sees `null` here rather than another user's row.
  const company = await getCompany(companyId);
  if (!company) return { error: "Company not found." };

  try {
    const res = await runDeepDive(supabase, company);
    if (res.error) return { error: `Deep-dive failed: ${res.error}` };
    revalidatePath(`/companies/${companyId}`);
    return { id: companyId };
  } catch (e) {
    return { error: `Deep-dive failed: ${(e as Error).message}` };
  }
}

export async function refreshCompetitors(
  companyId: string,
): Promise<ActionResult & { count?: number }> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const { data: company, error } = await supabase
    .from("companies")
    .select("id, name, description, sector")
    .eq("id", companyId)
    .maybeSingle();
  if (error || !company) return { error: error?.message ?? "Company not found." };

  let count: number;
  try {
    count = await refreshCompetitorsFor(
      supabase,
      company.id,
      company.name,
      user.id,
      companyHint(company.description, company.sector),
    );
  } catch (e) {
    return { error: `Competitor lookup failed: ${(e as Error).message}` };
  }

  if (count === 0) {
    return {
      error: hasLiveConnectors()
        ? `No competitors identified for "${company.name}" yet. Try again, or check the company name is correct.`
        : "Competitor discovery needs the Grok connector — set XAI_API_KEY.",
    };
  }

  revalidatePath(`/companies/${companyId}`);
  return { count };
}

export async function updateCompanyOverview(
  companyId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const name = str(formData.get("name"));
  if (!name) return { error: "Company name is required." };

  const { error } = await supabase
    .from("companies")
    .update({
      name,
      website: str(formData.get("website")),
      logo_url: str(formData.get("logo_url")),
      sector: str(formData.get("sector")),
      country: str(formData.get("country")),
      founded_year: num(formData.get("founded_year")),
      founders: list(formData.get("founders")),
      description: str(formData.get("description")),
      status: (str(formData.get("status")) as "active" | "exited") ?? "active",
      realized_proceeds: num(formData.get("realized_proceeds")) ?? 0,
      // null = inherit the fund default fee
      carry_pct: num(formData.get("carry_pct")),
      mgmt_fee_pct: num(formData.get("mgmt_fee_pct")),
    })
    .eq("id", companyId);

  if (error) return { error: error.message };
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/dashboard");
  revalidatePath("/companies");
  return {};
}

export async function addInvestment(
  companyId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const investment_date = str(formData.get("investment_date"));
  if (!investment_date) return { error: "Investment date is required." };

  const { error } = await supabase.from("investments").insert({
    company_id: companyId,
    user_id: user.id,
    investment_date,
    amount: num(formData.get("amount")) ?? 0,
    share_price: num(formData.get("share_price")),
    shares: num(formData.get("shares")),
    ownership_pct: num(formData.get("ownership_pct")),
    investor_name: str(formData.get("investor_name")),
    round: str(formData.get("round")),
    terms: str(formData.get("terms")),
    notes: str(formData.get("notes")),
  });

  if (error) return { error: error.message };
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function addValuation(
  companyId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const date = str(formData.get("date"));
  if (!date) return { error: "Valuation date is required." };

  const { error } = await supabase.from("valuations").insert({
    company_id: companyId,
    date,
    round: str(formData.get("round")),
    pre_money: num(formData.get("pre_money")),
    post_money: num(formData.get("post_money")),
    share_price: num(formData.get("share_price")),
    source: str(formData.get("source")),
    confidence:
      (str(formData.get("confidence")) as "low" | "medium" | "high") ??
      "medium",
  });

  if (error) return { error: error.message };
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function addFundingRound(
  companyId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const round = str(formData.get("round"));
  if (!round) return { error: "Round name is required." };

  const { error } = await supabase.from("funding_rounds").insert({
    company_id: companyId,
    round,
    date: str(formData.get("date")),
    amount_raised: num(formData.get("amount_raised")),
    valuation: num(formData.get("valuation")),
    investors: list(formData.get("investors")),
    lead_investor: str(formData.get("lead_investor")),
    share_price: num(formData.get("share_price")),
    source: str(formData.get("source")),
  });

  if (error) return { error: error.message };
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function addNews(
  companyId: string,
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };

  const title = str(formData.get("title"));
  if (!title) return { error: "Headline is required." };

  const summary = str(formData.get("summary"));
  const { error } = await supabase.from("news").insert({
    company_id: companyId,
    title,
    source: str(formData.get("source")),
    url: str(formData.get("url")),
    date: str(formData.get("date")),
    sentiment:
      (str(formData.get("sentiment")) as
        | "positive"
        | "neutral"
        | "negative"
        | null) ?? null,
    summary,
    category: classifyNews(title, summary),
  });

  if (error) return { error: error.message };
  revalidatePath(`/companies/${companyId}`);
  revalidatePath("/dashboard");
  return {};
}

export async function deleteCompany(companyId: string): Promise<ActionResult> {
  const { supabase, user } = await requireUser();
  if (!user) return { error: "Not authenticated." };
  const { error } = await supabase
    .from("companies")
    .delete()
    .eq("id", companyId);
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  revalidatePath("/companies");
  return {};
}
