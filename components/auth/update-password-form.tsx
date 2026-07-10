"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import { updatePassword, type AuthResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Please wait…" : label}
    </Button>
  );
}

/**
 * Shared new-password form. Used by /reset-password (recovery session, with a
 * `redirectTo`) and the in-app change-password dialog (no redirect, calls
 * `onSuccess`). Confirmation + min-length are validated in the server action.
 */
export function UpdatePasswordForm({
  redirectTo,
  onSuccess,
  submitLabel = "Update password",
}: {
  redirectTo?: string;
  onSuccess?: () => void;
  submitLabel?: string;
}) {
  const router = useRouter();
  const [state, formAction] = useActionState<AuthResult | undefined, FormData>(
    updatePassword,
    undefined,
  );

  useEffect(() => {
    if (!state?.success) return;
    if (redirectTo) {
      router.replace(redirectTo);
    } else {
      onSuccess?.();
    }
  }, [state?.success, redirectTo, onSuccess, router]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={6}
          placeholder="••••••••"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={6}
          placeholder="••••••••"
        />
      </div>

      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      )}

      {state?.success && !redirectTo && (
        <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          Password updated.
        </p>
      )}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
