"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { updatePassword, type AuthResult } from "@/app/(auth)/actions";
import { SubmitButton } from "@/components/auth/submit-button";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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

  // Announce the in-dialog success confirmation to assistive tech.
  const successRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state?.success && !redirectTo) successRef.current?.focus();
  }, [state?.success, redirectTo]);

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="password">New password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          aria-describedby="new-password-hint"
          placeholder="••••••••"
        />
        <p id="new-password-hint" className="text-xs text-muted-foreground">
          At least {MIN_PASSWORD_LENGTH} characters
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirm">Confirm new password</Label>
        <Input
          id="confirm"
          name="confirm"
          type="password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          autoComplete="new-password"
          placeholder="••••••••"
        />
      </div>

      {state?.error && (
        <p
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      )}

      {state?.success && !redirectTo && (
        <p
          ref={successRef}
          role="status"
          tabIndex={-1}
          className="rounded-md bg-success/10 px-3 py-2 text-sm text-success outline-none"
        >
          Password updated.
        </p>
      )}

      <SubmitButton label={submitLabel} />
    </form>
  );
}
