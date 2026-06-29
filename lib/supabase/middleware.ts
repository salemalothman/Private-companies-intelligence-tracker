import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types";

// "/api" routes self-authenticate (cron bearer token, approval webhook token)
// and must not be redirected to the login screen.
const PUBLIC_PATHS = ["/", "/login", "/signup", "/auth", "/api"];

/** Refresh the Supabase session and gate the (app) routes behind auth. */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Never cache auth/profile reads in middleware — a stale approval status
      // would keep an approved user trapped on /pending (Next caches GET fetch).
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) =>
          fetch(input, { ...init, cache: "no-store" }),
      },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  // Unauthenticated traffic to any protected route funnels to the root login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("redirectedFrom", pathname);
    return NextResponse.redirect(url);
  }

  if (user) {
    // Admin-gated onboarding: accounts stay blocked until approved. Read the
    // user's own profile status (RLS-scoped) and route accordingly.
    const { data: profile } = await supabase
      .from("profiles")
      .select("status")
      .eq("id", user.id)
      .maybeSingle();
    const active = profile?.status === "active";

    if (!active) {
      // Pending accounts may only reach the holding page; everything else
      // bounces there (no operational access until approved).
      if (pathname !== "/pending") {
        const url = request.nextUrl.clone();
        url.pathname = "/pending";
        url.search = "";
        return NextResponse.redirect(url);
      }
      return supabaseResponse;
    }

    // Active users shouldn't sit on the auth or holding screens.
    if (["/", "/login", "/signup", "/pending"].includes(pathname)) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
