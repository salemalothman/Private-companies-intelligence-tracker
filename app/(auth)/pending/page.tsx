import { Clock } from "lucide-react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/(auth)/actions";
import { ADMIN_EMAIL } from "@/lib/auth/constants";

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4 sm:p-6">
      <Card className="w-full max-w-md text-center">
        <CardHeader className="space-y-3">
          <div className="flex items-center justify-center gap-2 text-primary">
            <Logo className="h-7 w-7 shrink-0" />
            <span className="text-sm font-medium text-foreground">
              Automation Investment Intelligence Platform
            </span>
          </div>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <Clock className="h-6 w-6" />
          </div>
          <CardTitle className="text-2xl">Awaiting approval</CardTitle>
          <CardDescription>
            Your account{user?.email ? ` (${user.email})` : ""} has been created
            and is pending administrator approval. You&apos;ll have full access
            as soon as it&apos;s granted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Questions? Contact{" "}
            <a href={`mailto:${ADMIN_EMAIL}`} className="text-primary hover:underline">
              {ADMIN_EMAIL}
            </a>
            .
          </p>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="w-full">
              Sign out
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
