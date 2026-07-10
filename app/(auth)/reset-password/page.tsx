import { redirect } from "next/navigation";
import { Logo } from "@/components/app/logo";
import { createClient } from "@/lib/supabase/server";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function ResetPasswordPage() {
  // Defensive: the recovery session is set by /auth/confirm. If it's missing or
  // expired, bounce back to login rather than showing a form that can't submit.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?error=recovery-expired");

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Logo className="h-7 w-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Automation Investment Intelligence Platform
            </span>
          </div>
          <CardTitle className="text-2xl">Set a new password</CardTitle>
          <CardDescription>
            Choose a new password for your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <UpdatePasswordForm redirectTo="/dashboard" submitLabel="Set password" />
        </CardContent>
      </Card>
    </div>
  );
}
