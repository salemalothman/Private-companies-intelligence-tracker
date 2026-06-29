import "server-only";
import { sendEmail, type SendResult } from "@/lib/email/send";
import { formatCurrency } from "@/lib/utils";

export interface DigestEmailInput {
  to: string;
  generatedAt: string;
  portfolioValue: number;
  companyCount: number;
  pdf: Uint8Array;
  filename: string;
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/**
 * Deliver a portfolio digest by email with the PDF attached. Minimal, modern,
 * brand-marked body; the attached PDF carries the full report. Degrades
 * gracefully (logs) when email isn't configured — see sendEmail.
 */
export async function sendDigestEmail(input: DigestEmailInput): Promise<SendResult> {
  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#0f1720">
    <table role="presentation" style="border-collapse:collapse;margin-bottom:24px">
      <tr>
        <td style="vertical-align:middle">
          <div style="width:30px;height:30px;border-radius:8px;background:#5C9EAD;
                      display:inline-block;text-align:center;line-height:30px;color:#fff;
                      font-weight:700;font-size:14px">A</div>
        </td>
        <td style="vertical-align:middle;padding-left:10px">
          <div style="font-size:14px;font-weight:600;line-height:1.2">Automation Investment</div>
          <div style="font-size:12px;color:#6b7280;line-height:1.2">Intelligence Platform</div>
        </td>
      </tr>
    </table>

    <h1 style="font-size:20px;margin:0 0 4px">Your portfolio digest</h1>
    <p style="color:#6b7280;font-size:13px;margin:0 0 20px">${input.generatedAt}</p>

    <table role="presentation" style="border-collapse:collapse;width:100%;margin-bottom:20px">
      <tr>
        <td style="padding:14px 16px;border:1px solid #e5e7eb;border-radius:10px 0 0 10px">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Portfolio value</div>
          <div style="font-size:20px;font-weight:700;margin-top:4px">${formatCurrency(input.portfolioValue)}</div>
        </td>
        <td style="padding:14px 16px;border:1px solid #e5e7eb;border-left:0;border-radius:0 10px 10px 0">
          <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em">Companies</div>
          <div style="font-size:20px;font-weight:700;margin-top:4px">${input.companyCount}</div>
        </td>
      </tr>
    </table>

    <p style="font-size:14px;line-height:1.5;color:#374151;margin:0 0 8px">
      Your full one-page digest — holdings, valuation moves and notable activity —
      is attached as a PDF.
    </p>
    <p style="color:#9ca3af;font-size:12px;margin-top:24px;border-top:1px solid #eee;padding-top:12px">
      Automation Investment Intelligence Platform · automated portfolio reporting.
    </p>
  </div>`;

  return sendEmail({
    to: input.to,
    subject: `Your portfolio digest — ${input.generatedAt}`,
    html,
    text: `Your portfolio digest for ${input.generatedAt} is attached as a PDF.`,
    attachments: [{ filename: input.filename, content: toBase64(input.pdf) }],
  });
}
