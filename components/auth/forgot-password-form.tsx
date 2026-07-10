"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { requestPasswordReset, type AuthResult } from "@/app/(auth)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Please wait…" : label}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState<AuthResult | undefined, FormData>(
    requestPasswordReset,
    undefined,
  );

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
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>
            Enter your email and we&apos;ll send you a reset link.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {state?.sent ? (
            <p className="rounded-md bg-success/10 px-3 py-2 text-sm text-success">
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
        </CardContent>
      </Card>
    </div>
  );
}
