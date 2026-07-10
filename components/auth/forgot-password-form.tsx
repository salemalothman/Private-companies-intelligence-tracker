"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { requestPasswordReset, type AuthResult } from "@/app/(auth)/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/auth/submit-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthResult | undefined, FormData>(
    requestPasswordReset,
    undefined,
  );

  // Move focus to the neutral confirmation once sent so screen-reader and
  // keyboard users are told the request completed (role="status" announces it).
  const sentRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state?.sent) sentRef.current?.focus();
  }, [state?.sent]);

  return (
    <AuthShell
      title="Reset your password"
      description="Enter your email and we'll send you a reset link."
    >
      {state?.sent ? (
        <p
          ref={sentRef}
          role="status"
          tabIndex={-1}
          className="rounded-md bg-success/10 px-3 py-2 text-sm text-success outline-none"
        >
          If an account exists for that email, we sent a reset link.
        </p>
      ) : (
        <form action={formAction} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@fund.com"
            />
          </div>

          <SubmitButton label="Send reset link" />
        </form>
      )}

      <p className="mt-4 text-center text-sm text-muted-foreground">
        <Link href="/login" className="text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </AuthShell>
  );
}
