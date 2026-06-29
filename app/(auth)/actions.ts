"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendApprovalRequest } from "@/lib/email/approval";
import { siteUrl } from "@/lib/site-url";

export interface AuthResult {
  error?: string;
}

export async function login(
  _prev: AuthResult | undefined,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(
  _prev: AuthResult | undefined,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "");

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: fullName } },
  });
  if (error) return { error: error.message };

  // New accounts default to 'pending_approval' (set by the signup trigger).
  // Notify the admin with a tokenized approval link. Best-effort: never block
  // signup on the admin read / email send.
  let status: string | undefined;
  if (data.user) {
    try {
      const admin = createAdminClient();
      const { data: prof } = await admin
        .from("profiles")
        .select("status, approval_token, email, full_name")
        .eq("id", data.user.id)
        .maybeSingle();
      status = prof?.status;
      if (prof && prof.status !== "active" && prof.approval_token) {
        await sendApprovalRequest({
          email: prof.email ?? email,
          fullName: prof.full_name ?? fullName,
          token: prof.approval_token,
          baseUrl: await siteUrl(),
        });
      }
    } catch (e) {
      console.error("signup: approval dispatch failed:", (e as Error).message);
    }
  }

  // Admin account auto-activates → straight into the app.
  if (status === "active" && data.session) {
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }
  // Pending user with a live session (email confirmation off) → holding page.
  if (data.session) {
    revalidatePath("/", "layout");
    redirect("/pending");
  }

  return {
    error:
      "Account created — it's now pending admin approval. " +
      "You'll be able to sign in once an administrator approves your access.",
  };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
