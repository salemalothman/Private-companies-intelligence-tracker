import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";

export default async function ResetPasswordPage() {
  // Defensive: the recovery session is set by /auth/confirm. If it's missing or
  // expired, bounce back to login rather than showing a form that can't submit.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=recovery-expired");

  return (
    <AuthShell
      title="Set a new password"
      description="Choose a new password for your account."
    >
      <UpdatePasswordForm redirectTo="/dashboard" submitLabel="Set password" />
    </AuthShell>
  );
}
