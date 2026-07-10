"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runWeeklyDigest, type DigestRunSummary } from "@/lib/reports/digest";
import { generateCompanyReport } from "@/lib/reports/company-report";
import type { DigestPrefsView } from "@/lib/queries";

/** Save the current user's digest configuration. */
export async function updateDigestPrefs(prefs: DigestPrefsView): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("digest_prefs").upsert(
    {
      user_id: user.id,
      enabled: prefs.enabled,
      frequency: prefs.frequency,
      include_holdings: prefs.include_holdings,
      include_activity: prefs.include_activity,
      recipient_email: prefs.recipient_email?.trim() || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  revalidatePath("/reports");
}

/** Generate a digest PDF for the current user on demand (ignores prefs gates). */
export async function generateDigestNow(): Promise<
  DigestRunSummary | { error: string }
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  // Service-role client: builds + uploads the PDF to the private bucket.
  const summary = await runWeeklyDigest(createAdminClient(), {
    userId: user.id,
    force: true,
  });
  revalidatePath("/reports");
  return summary;
}

export interface CompanyReportActionResult {
  url?: string;
  stale?: boolean;
  error?: string;
}

/** Generate the per-company IC memo PDF on demand and sign a download URL. */
export async function generateCompanyReportNow(
  companyId: string,
): Promise<CompanyReportActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in" };
  // Service-role client: builds + uploads the PDF to the private bucket. The
  // generator enforces company.user_id === userId before any read/write.
  const admin = createAdminClient();
  const res = await generateCompanyReport(admin, {
    userId: user.id,
    companyId,
  });
  if (res.error || !res.path) {
    return { error: res.error ?? "Report generation failed." };
  }
  const { data: signed } = await admin.storage
    .from("reports")
    .createSignedUrl(res.path, 3600);
  revalidatePath("/reports");
  return { url: signed?.signedUrl, stale: res.stale };
}
