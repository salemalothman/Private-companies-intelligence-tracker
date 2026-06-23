"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/app/(app)/companies/actions";

function pct(v: FormDataEntryValue | null, fallback: number): number {
  if (v == null || v === "") return fallback;
  const n = Number(String(v).replace(/[%\s]/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

export async function updateFundSettings(
  _prev: ActionResult | undefined,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { error } = await supabase.from("fund_settings").upsert(
    {
      user_id: user.id,
      carry_pct: pct(formData.get("carry_pct"), 20),
      mgmt_fee_pct: pct(formData.get("mgmt_fee_pct"), 7),
    },
    { onConflict: "user_id" },
  );

  if (error) return { error: error.message };
  revalidatePath("/fund");
  return {};
}
