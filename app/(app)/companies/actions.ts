"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { ingestCompany } from "@/lib/ingestion/orchestrator";

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

  // Trigger the automated ingestion pipeline immediately on add.
  // Best-effort: a connector failure must never block company creation.
  try {
    await ingestCompany(supabase, data);
  } catch (e) {
    console.error("ingestion on create:", (e as Error).message);
  }

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
    await ingestCompany(supabase, data);
    revalidatePath(`/companies/${companyId}`);
    revalidatePath("/dashboard");
    revalidatePath("/fund");
    return {};
  } catch (e) {
    return { error: `Sync failed: ${(e as Error).message}` };
  }
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
    summary: str(formData.get("summary")),
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
