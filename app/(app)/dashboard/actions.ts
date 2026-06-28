"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** Mark all of the current user's activity events as seen (clears the badge). */
export async function markEventsSeen(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("portfolio_events")
    .update({ seen: true })
    .eq("seen", false); // RLS scopes this to the user's own rows
  revalidatePath("/dashboard");
}
