import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CompanyWithRelations, FundSettings } from "@/lib/types";

export const DEFAULT_FEES = { carry_pct: 20, mgmt_fee_pct: 7 };

/** The current user's fee assumptions, falling back to defaults. */
export async function getFundSettings(): Promise<
  Pick<FundSettings, "carry_pct" | "mgmt_fee_pct">
> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("fund_settings")
    .select("carry_pct, mgmt_fee_pct")
    .maybeSingle();
  return data ?? DEFAULT_FEES;
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
