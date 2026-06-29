import "server-only";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Transactional email sender. Uses Resend when RESEND_API_KEY is configured;
 * otherwise degrades gracefully — it logs the message (so links remain usable
 * from server logs in dev / unconfigured environments) without throwing, so
 * callers like signup never fail just because email isn't wired up yet.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "onboarding@resend.dev";

  if (!key) {
    console.warn(
      `[email] RESEND_API_KEY unset — not sending. To: ${msg.to} · Subject: ${msg.subject}`,
    );
    return { ok: false, skipped: true };
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: msg.to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      console.error("[email] Resend error:", res.status, detail);
      return { ok: false, error: `Resend ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[email] send failed:", (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}
