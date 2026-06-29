import "server-only";
import { headers } from "next/headers";

/**
 * Absolute base URL for building links in emails / webhooks. Prefers an
 * explicit NEXT_PUBLIC_SITE_URL, then Vercel's deployment URL, then falls back
 * to the inbound request's origin.
 */
export async function siteUrl(): Promise<string> {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  return host ? `${proto}://${host}` : "http://localhost:3000";
}
