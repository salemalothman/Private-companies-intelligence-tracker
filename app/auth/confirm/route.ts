import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Recovery links carry a one-time token_hash; redemption must not be cached.
export const dynamic = "force-dynamic";

/**
 * Redeem a Supabase recovery link. The email link points here with `token_hash`
 * + `type=recovery`; verifyOtp exchanges the one-time token for a session via
 * the cookie-bound server client, then we forward to /reset-password. Any
 * missing/invalid/expired token lands on /login with an error param — a session
 * is never granted on failure (T-pwd-03).
 */
export async function GET(request: NextRequest) {
  const token_hash = request.nextUrl.searchParams.get("token_hash");
  const type = request.nextUrl.searchParams.get("type") as EmailOtpType | null;

  if (!token_hash || !type) {
    return NextResponse.redirect(new URL("/login?error=invalid-link", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    return NextResponse.redirect(
      new URL("/login?error=recovery-failed", request.url),
    );
  }

  return NextResponse.redirect(new URL("/reset-password", request.url));
}
