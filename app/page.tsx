import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AuthForm } from "@/components/auth/auth-form";

/**
 * Root route. The authentication screen is the very first page at `/`.
 * Authenticated users are sent straight to the dashboard; everyone else sees
 * the sign-in form. The middleware enforces the same rule at the edge.
 */
export default async function RootPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/dashboard");

  return <AuthForm mode="login" />;
}
