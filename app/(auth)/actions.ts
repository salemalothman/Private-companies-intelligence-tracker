"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendApprovalRequest } from "@/lib/email/approval";
import { siteUrl } from "@/lib/site-url";
import { requestOrigin } from "@/lib/request-origin";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";

export interface AuthResult {
  error?: string;
  // Set by requestPasswordReset — always true on completion so the UI can show
  // a neutral confirmation without ever leaking whether the account exists.
  sent?: boolean;
  // Set by updatePassword — signals the client (reset page / change dialog) to
  // redirect or close; the action itself never navigates.
  success?: boolean;
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

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  // The email-confirmation link redirects here after Supabase verifies it.
  // Follow the serving host (allowlisted) so a user who signs up on the live
  // deployment lands back on the live app — not on Supabase's Site URL, which
  // may still be localhost and dead-ends the confirmation on their device.
  // /dashboard is a safe target: middleware routes a confirmed-but-pending user
  // to the "Awaiting approval" page.
  const h = await headers();
  const origin = requestOrigin(h) ?? (await siteUrl());

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/dashboard`,
    },
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

/**
 * Request a password-reset email. Deliberately neutral: we ignore the Supabase
 * result (success, error, or unknown email) and ALWAYS return { sent: true } so
 * account existence can never be probed via this endpoint (T-pwd-01). The
 * redirectTo FOLLOWS the serving host (via requestOrigin) so reset links from
 * the Cloudflare deployment point at workers.dev, Vercel keeps its host, and
 * localhost keeps localhost — but ONLY when the forwarded host is on
 * requestOrigin's trusted allowlist (localhost / *.workers.dev / *.vercel.app);
 * any other (attacker-influenced) host falls back to the canonical siteUrl().
 * This closes the Host-header open-redirect vector (T-pwd-02 / T-eoe-03);
 * Supabase Auth additionally only honors redirectTo values on its Redirect URLs
 * allowlist.
 */
export async function requestPasswordReset(
  _prev: AuthResult | undefined,
  formData: FormData,
): Promise<AuthResult> {
  const email = String(formData.get("email") ?? "");

  try {
    const h = await headers();
    const origin = requestOrigin(h) ?? (await siteUrl());
    const redirectTo = `${origin}/auth/confirm`;
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  } catch (e) {
    // Swallow: never surface success/failure to the caller (no existence leak).
    console.error("requestPasswordReset failed:", (e as Error).message);
  }

  return { sent: true };
}

/**
 * Set a new password for the current session (recovery session on /reset-password
 * or the signed-in session from the in-app change dialog). Validates length and
 * confirmation client-side of Supabase, then updates the user. Never redirects —
 * the caller decides what to do on { success: true }.
 */
export async function updatePassword(
  _prev: AuthResult | undefined,
  formData: FormData,
): Promise<AuthResult> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return {
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }
  if (password !== confirm) {
    return { error: "Passwords do not match." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  return { success: true };
}
