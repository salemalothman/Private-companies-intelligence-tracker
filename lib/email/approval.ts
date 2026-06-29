import "server-only";
import { ADMIN_EMAIL } from "@/lib/auth/constants";
import { sendEmail, type SendResult } from "@/lib/email/send";

const ESCAPE: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ESCAPE[c]);

export interface ApprovalRequest {
  email: string;
  fullName?: string | null;
  token: string;
  baseUrl: string;
}

/**
 * Email the platform admin a new-signup notification with the user's details
 * and a tokenized approval link. Always logs the link too, so approval works
 * even when email delivery isn't configured.
 */
export async function sendApprovalRequest(
  req: ApprovalRequest,
): Promise<{ result: SendResult; approveUrl: string }> {
  const approveUrl = `${req.baseUrl}/api/admin/approve?token=${encodeURIComponent(req.token)}`;
  const name = req.fullName?.trim() || "—";

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a">
    <h2 style="font-size:18px;margin:0 0 4px">New account awaiting approval</h2>
    <p style="color:#666;font-size:14px;margin:0 0 16px">
      Someone registered for the Automation Investment Intelligence Platform.
    </p>
    <table style="font-size:14px;border-collapse:collapse;margin-bottom:20px">
      <tr><td style="color:#666;padding:4px 16px 4px 0">Name</td><td style="font-weight:600">${esc(name)}</td></tr>
      <tr><td style="color:#666;padding:4px 16px 4px 0">Email</td><td style="font-weight:600">${esc(req.email)}</td></tr>
    </table>
    <a href="${esc(approveUrl)}"
       style="display:inline-block;background:#0a0a0a;color:#fff;text-decoration:none;
              padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600">
      Review &amp; approve
    </a>
    <p style="color:#999;font-size:12px;margin-top:20px">
      This link is unique to this request and can only be used once. If you don't
      recognize this signup, simply ignore it — the account stays blocked.
    </p>
  </div>`;

  const result = await sendEmail({
    to: ADMIN_EMAIL,
    subject: `Approve new account: ${req.email}`,
    html,
    text: `New signup: ${req.email} (${name}).\nApprove: ${approveUrl}`,
  });

  console.info(`[approval] ${req.email} pending approval. Approve: ${approveUrl}`);
  return { result, approveUrl };
}
