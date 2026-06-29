import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ESCAPE: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title></head>
  <body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#fafafa;margin:0;
               display:flex;min-height:100vh;align-items:center;justify-content:center">
    <div style="background:#fff;border:1px solid #e5e5e5;border-radius:16px;padding:32px;
                max-width:420px;width:90%;text-align:center;color:#0a0a0a">
      ${body}
    </div>
  </body></html>`;
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Admin approval webhook. The tokenized link from the signup email lands here.
 * GET renders a confirmation screen (no mutation — so email/link scanners that
 * prefetch the URL can't silently approve). The confirm button POSTs the token,
 * which flips the account to 'active' and burns the single-use token.
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  if (!token) return page("Invalid link", "<h2>Missing approval token.</h2>", 400);

  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("profiles")
    .select("email, full_name, status")
    .eq("approval_token", token)
    .maybeSingle();

  if (!profile) {
    return page(
      "Link expired",
      "<h2>This approval link is invalid or has already been used.</h2>",
      404,
    );
  }
  if (profile.status === "active") {
    return page("Already approved", `<h2>${esc(profile.email ?? "This account")} is already active.</h2>`);
  }

  return page(
    "Approve account",
    `<h2 style="margin:0 0 8px">Approve this account?</h2>
     <p style="color:#666;font-size:14px;margin:0 0 4px">${esc(profile.full_name || "—")}</p>
     <p style="color:#666;font-size:14px;margin:0 0 20px"><strong>${esc(profile.email ?? "")}</strong></p>
     <form method="post" action="/api/admin/approve">
       <input type="hidden" name="token" value="${esc(token)}">
       <button type="submit"
         style="background:#0a0a0a;color:#fff;border:0;border-radius:8px;padding:11px 22px;
                font-size:14px;font-weight:600;cursor:pointer">Grant access</button>
     </form>`,
  );
}

export async function POST(request: Request) {
  const form = await request.formData();
  const token = String(form.get("token") ?? "");
  if (!token) return page("Invalid link", "<h2>Missing approval token.</h2>", 400);

  const admin = createAdminClient();
  // Single-use: only flips a still-pending row, and clears the token so the
  // link can't be replayed.
  const { data, error } = await admin
    .from("profiles")
    .update({
      status: "active",
      approval_token: null,
      approved_at: new Date().toISOString(),
    })
    .eq("approval_token", token)
    .eq("status", "pending_approval")
    .select("email")
    .maybeSingle();

  if (error) return page("Error", `<h2>Could not approve: ${esc(error.message)}</h2>`, 500);
  if (!data) {
    return page(
      "Link expired",
      "<h2>This approval link is invalid or has already been used.</h2>",
      404,
    );
  }

  return page(
    "Approved",
    `<h2 style="margin:0 0 8px">✓ Access granted</h2>
     <p style="color:#666;font-size:14px;margin:0">
       ${esc(data.email ?? "The account")} can now sign in and use the platform.
     </p>`,
  );
}
