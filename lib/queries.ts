import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CompanyWithRelations, CompetitorRow } from "@/lib/types";

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
