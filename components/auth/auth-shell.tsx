import type { ReactNode } from "react";
import { Logo } from "@/components/app/logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Shared chrome for the standalone auth screens (login, signup, forgot, reset):
 * a centered card with the brand mark, a title, and a description wrapping the
 * screen's form. Holds no hooks or client-only APIs, so it renders in both the
 * server tree (reset-password page) and client trees (auth/forgot forms).
 * Interactive children own their own "use client" boundary — AuthShell only
 * lays out static chrome.
 */
export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
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
          <CardTitle className="text-2xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    </div>
  );
}
