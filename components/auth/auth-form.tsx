"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, signup, type AuthResult } from "@/app/(auth)/actions";
import { AuthShell } from "@/components/auth/auth-shell";
import { SubmitButton } from "@/components/auth/submit-button";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-constants";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AuthForm({
  mode,
  recoveryError,
}: {
  mode: "login" | "signup";
  /** A recovery-flow message (invalid/expired reset link) from the login URL. */
  recoveryError?: string;
}) {
  const action = mode === "login" ? login : signup;
  const [state, formAction] = useActionState<AuthResult | undefined, FormData>(
    action,
    undefined,
  );

  const isSignup = mode === "signup";
  // A submit error supersedes the initial recovery message; only the recovery
  // case offers the "request a new link" affordance.
  const shownError = state?.error ?? recoveryError;
  const showResetLink = !state?.error && !!recoveryError;

  return (
    <AuthShell
      title={isSignup ? "Create your account" : "Welcome back"}
      description={
        isSignup
          ? "Start tracking your private portfolio."
          : "Sign in to your investor dashboard."
      }
    >
      <form action={formAction} className="space-y-4">
        {isSignup && (
          <div className="space-y-1.5">
            <Label htmlFor="full_name">Full name</Label>
            <Input
              id="full_name"
              name="full_name"
              autoComplete="name"
              placeholder="Jane Investor"
            />
          </div>
        )}
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
        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            required
            minLength={isSignup ? MIN_PASSWORD_LENGTH : undefined}
            autoComplete={isSignup ? "new-password" : "current-password"}
            aria-describedby={isSignup ? "password-hint" : undefined}
            placeholder="••••••••"
          />
          {isSignup && (
            <p id="password-hint" className="text-xs text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters
            </p>
          )}
        </div>

        {!isSignup && (
          <div className="text-right">
            <Link
              href="/forgot-password"
              className="-mr-1 inline-flex min-h-[32px] items-center px-1 text-xs text-primary hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        )}

        {shownError && (
          <div
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            <p>{shownError}</p>
            {showResetLink && (
              <Link
                href="/forgot-password"
                className="mt-1 inline-block font-medium underline"
              >
                Request a new reset link
              </Link>
            )}
          </div>
        )}

        <SubmitButton label={isSignup ? "Create account" : "Sign in"} />
      </form>

      <p className="mt-4 text-center text-sm text-muted-foreground">
        {isSignup ? (
          <>
            Already have an account?{" "}
            <Link href="/login" className="text-primary hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{" "}
            <Link href="/signup" className="text-primary hover:underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </AuthShell>
  );
}
